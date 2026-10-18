// netlify: read-only Netlify data and live-site checks for project previews. The Netlify
// token stays in function secrets (NETLIFY_TOKEN, or NETLIFY_KEY); it answers only callers whose GitHub
// login matches the GitHub account connected to that Netlify user. Actions: sites, previews.
import { canEmbed, summarize, type NetlifySummary, type NfDeploy, type NfSite } from './summary.ts';

type Action = { action: 'sites' } | { action: 'previews'; projectIds: string[] };

/** connected: data flows. not-configured: no NETLIFY_TOKEN. not-yours: the token belongs to another GitHub user. */
type NetlifyStatus = 'connected' | 'not-configured' | 'not-yours';

interface ProjectRow {
  id: string;
  site_url: string | null;
  netlify_site_id: string | null;
}

const API = 'https://api.netlify.com/api/v1';
const MAX_PROJECTS = 24;
const PROBE_TIMEOUT_MS = 6000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function parse(body: unknown): Action | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b['action'] === 'sites') return { action: 'sites' };
  const ids = b['projectIds'];
  if (b['action'] === 'previews' && Array.isArray(ids) && ids.every((id) => typeof id === 'string' && UUID.test(id))) {
    return { action: 'previews', projectIds: (ids as string[]).slice(0, MAX_PROJECTS) };
  }
  return null;
}

/** The caller's GitHub login, read from their own session token. */
async function callerLogin(url: string, apikey: string, auth: string): Promise<string | null> {
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey, Authorization: auth } });
  if (!res.ok) return null;
  const user = (await res.json()) as { identities?: { provider: string; identity_data?: Record<string, unknown> }[] };
  const login = user.identities?.find((i) => i.provider === 'github')?.identity_data?.['user_name'];
  return typeof login === 'string' && login ? login.toLowerCase() : null;
}

async function nf<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Finishlyne' } });
  if (!res.ok) throw new Error(`Netlify answered ${res.status} for ${path.split('?')[0]}`);
  return (await res.json()) as T;
}

async function netlifyStatus(token: string | undefined, login: string): Promise<NetlifyStatus> {
  if (!token) return 'not-configured';
  const user = await nf<{ connected_accounts?: Record<string, string> }>('/user', token);
  return user.connected_accounts?.['github']?.toLowerCase() === login ? 'connected' : 'not-yours';
}

async function allSites(token: string): Promise<NfSite[]> {
  const out: NfSite[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await nf<NfSite[]>(`/sites?filter=all&per_page=100&page=${page}`, token);
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
}

async function siteSummary(siteId: string, token: string): Promise<NetlifySummary | null> {
  try {
    const [site, deploys] = await Promise.all([
      nf<NfSite>(`/sites/${siteId}`, token),
      nf<NfDeploy[]>(`/sites/${siteId}/deploys?per_page=30`, token),
    ]);
    return summarize(site, deploys);
  } catch (error) {
    console.error(error);
    return null;
  }
}

/** Loads the page the way an iframe would and reads its framing headers. */
async function probe(url: string, origin: string): Promise<boolean | null> {
  if (!/^https:\/\//i.test(url)) return null;
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), headers: { 'User-Agent': 'Finishlyne preview check' } });
    await res.body?.cancel();
    return canEmbed(res.status, res.headers, origin);
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const apikey = req.headers.get('apikey') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const auth = req.headers.get('Authorization') ?? '';
  const login = await callerLogin(url, apikey, auth);
  if (!login) return json({ error: 'Sign in with GitHub first.' }, 401);
  const input = parse(await req.json().catch(() => null));
  if (!input) return json({ error: 'Unknown action' }, 400);

  const token = Deno.env.get('NETLIFY_TOKEN') || Deno.env.get('NETLIFY_KEY') || undefined;
  try {
    const status = await netlifyStatus(token, login);
    if (input.action === 'sites') {
      if (status !== 'connected' || !token) return json({ netlify: status, sites: [] });
      const sites = await allSites(token);
      return json({
        netlify: status,
        sites: sites.map((s) => ({ id: s.id, name: s.name, url: s.ssl_url || s.url.replace(/^http:/, 'https:') })),
      });
    }

    // Read as the caller, so row-level security decides which projects exist.
    const ids = input.projectIds;
    if (!ids.length) return json({ netlify: status, projects: {} });
    const res = await fetch(`${url}/rest/v1/projects?select=id,site_url,netlify_site_id&id=in.(${ids.join(',')})`, {
      headers: { apikey, Authorization: auth },
    });
    if (!res.ok) return json({ error: `Projects did not load (${res.status})` }, 502);
    const rows = (await res.json()) as ProjectRow[];

    const origin = req.headers.get('Origin') || 'https://finishlyne.netlify.app';
    const entries = await Promise.all(
      rows.map(async (row) => {
        const netlify = status === 'connected' && token && row.netlify_site_id ? await siteSummary(row.netlify_site_id, token) : null;
        const live = row.site_url ?? netlify?.url ?? null;
        const embeddable = live ? await probe(live, origin) : null;
        return [row.id, { embeddable, netlify }] as const;
      }),
    );
    return json({ netlify: status, projects: Object.fromEntries(entries) });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 502);
  }
});
