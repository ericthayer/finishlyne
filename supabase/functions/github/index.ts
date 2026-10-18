// github: the browser's only route to GitHub. Mints installation tokens server-side, so no
// GitHub token reaches the client (SPEC §7). Actions: status, repos, link, sync. Read-only
// toward GitHub; writes go to the Finishlyne cache tables with the service role.
import { findInstallation, get, GitHubError, installationToken, type AppConfig } from './app.ts';
import { addPushEvent, linkRepo, listLinks, ownsProject, replaceIssues, updateLink, type Db, type IssueRow, type LinkRow } from './db.ts';

type Action =
  | { action: 'status' }
  | { action: 'repos' }
  | { action: 'link'; projectId: string; repoId: number }
  | { action: 'sync' };

interface GhRepo {
  id: number;
  full_name: string;
  html_url: string;
  private: boolean;
  pushed_at: string | null;
  default_branch: string;
}

interface GhIssue {
  number: number;
  title: string;
  updated_at: string;
  pull_request?: unknown;
}

interface GhPush {
  ref: string;
  after: string;
  timestamp: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  return Object.values(keys)[0] ?? '';
}

function parse(body: unknown): Action | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b['action'] === 'status' || b['action'] === 'repos' || b['action'] === 'sync') return { action: b['action'] };
  if (b['action'] === 'link' && typeof b['projectId'] === 'string' && typeof b['repoId'] === 'number') {
    return { action: 'link', projectId: b['projectId'], repoId: b['repoId'] };
  }
  return null;
}

/** The caller's Finishlyne user id and GitHub user id, read from their own session token. */
async function caller(db: Db, auth: string): Promise<{ userId: string; githubId: number } | null> {
  const res = await fetch(`${db.url}/auth/v1/user`, { headers: { apikey: db.key, Authorization: auth } });
  if (!res.ok) return null;
  const user = (await res.json()) as { id: string; identities?: { provider: string; identity_data?: Record<string, unknown> }[] };
  const identity = user.identities?.find((i) => i.provider === 'github');
  const raw = identity?.identity_data?.['provider_id'] ?? identity?.identity_data?.['sub'];
  const githubId = Number(raw);
  return Number.isFinite(githubId) && githubId > 0 ? { userId: user.id, githubId } : null;
}

async function installationRepos(token: string): Promise<GhRepo[]> {
  const out: GhRepo[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await get<{ repositories: GhRepo[] }>(`/installation/repositories?per_page=100&page=${page}`, token);
    out.push(...res.repositories);
    if (res.repositories.length < 100) break;
  }
  return out.sort((a, b) => (b.pushed_at ?? '').localeCompare(a.pushed_at ?? ''));
}

/** Refreshes one link: repo name, open issues and PRs, and the latest push on any branch. */
async function syncLink(db: Db, userId: string, link: LinkRow, token: string, at: string): Promise<void> {
  const repo = await get<GhRepo>(`/repositories/${link.github_repo_id}`, token);
  const [issues, pushes] = await Promise.all([
    get<GhIssue[]>(`/repos/${repo.full_name}/issues?state=open&per_page=100&sort=updated`, token),
    get<GhPush[]>(`/repos/${repo.full_name}/activity?activity_type=push&per_page=1`, token).catch((): GhPush[] => []),
  ]);
  const items: IssueRow[] = issues.map((i) => ({
    number: i.number,
    kind: i.pull_request ? 'pr' : 'issue',
    title: i.title,
    state: 'open',
    updated_at: i.updated_at,
  }));
  await replaceIssues(db, userId, link.id, items);

  const latest = pushes[0];
  const pushedAt = latest?.timestamp ?? repo.pushed_at;
  const isNew = pushedAt && (!link.last_push_at || Date.parse(pushedAt) > Date.parse(link.last_push_at));
  if (isNew) {
    // Pushes to any branch count as progress (SPEC §6), so agent branches freshen the project.
    await addPushEvent(db, userId, link.project_id, {
      repoLinkId: link.id,
      branch: latest ? latest.ref.replace(/^refs\/heads\//, '') : repo.default_branch,
      sha: latest?.after ?? '',
      at: pushedAt,
    });
  }
  await updateLink(db, link.id, {
    full_name: repo.full_name,
    default_branch: repo.default_branch,
    last_push_at: isNew ? pushedAt : link.last_push_at,
    last_synced_at: at,
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);

  const db: Db = { url: Deno.env.get('SUPABASE_URL') ?? '', key: serviceKey() };
  const who = await caller(db, req.headers.get('Authorization') ?? '');
  if (!who) return json({ error: 'Sign in with GitHub first.' }, 401);
  const input = parse(await req.json().catch(() => null));
  if (!input) return json({ error: 'Unknown action' }, 400);

  const missing = ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY'].filter((name) => !Deno.env.get(name));
  if (missing.length) return json({ kind: 'not-configured', missing });
  const config: AppConfig = { appId: Deno.env.get('GITHUB_APP_ID') ?? '', privateKey: Deno.env.get('GITHUB_APP_PRIVATE_KEY') ?? '' };

  try {
    const app = await findInstallation(config, who.githubId);
    const installUrl = `https://github.com/apps/${app.slug}/installations/new`;
    if (!app.installation) return json({ kind: 'not-installed', installUrl });
    const installationId = app.installation.id;
    const token = await installationToken(config, installationId);

    if (input.action === 'status') {
      return json({
        kind: 'connected',
        account: app.installation.account.login,
        manageUrl: `https://github.com/settings/installations/${installationId}`,
      });
    }
    if (input.action === 'repos') {
      const repos = await installationRepos(token);
      return json({
        repos: repos.map((r) => ({ id: r.id, fullName: r.full_name, url: r.html_url, private: r.private, pushedAt: r.pushed_at })),
      });
    }
    const at = new Date().toISOString();
    if (input.action === 'link') {
      if (!(await ownsProject(db, who.userId, input.projectId))) return json({ error: 'Project not found' }, 404);
      const repo = (await installationRepos(token)).find((r) => r.id === input.repoId);
      if (!repo) return json({ error: 'The Finishlyne App cannot see that repository. Add it on GitHub first.' }, 403);
      const link = await linkRepo(db, who.userId, {
        project_id: input.projectId,
        github_repo_id: repo.id,
        full_name: repo.full_name,
        default_branch: repo.default_branch,
        installation_id: installationId,
      });
      await syncLink(db, who.userId, link, token, at);
      return json({ ok: true, syncedAt: at });
    }
    const links = await listLinks(db, who.userId);
    const results = await Promise.allSettled(links.map((l) => syncLink(db, who.userId, l, token, at)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    return json({ ok: true, syncedAt: at, synced: links.length - failed, failed });
  } catch (error) {
    const status = error instanceof GitHubError && error.status === 401 ? 502 : 500;
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, status);
  }
});
