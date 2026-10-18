// Pure helpers for the netlify function: no Deno or network, so vitest covers them.

export type DeployState = 'ready' | 'building' | 'error' | 'canceled';

export interface DeploySummary {
  state: DeployState;
  at: string;
  url: string;
  branch: string | null;
  error: string | null;
}

export interface PreviewLink {
  /** The pull request number Netlify built this preview for. */
  review: number;
  title: string | null;
  url: string;
  prUrl: string | null;
  at: string;
}

export interface NetlifySummary {
  siteId: string;
  name: string;
  url: string;
  adminUrl: string;
  screenshotUrl: string | null;
  /** The newest production deploy, finished or not. */
  latest: DeploySummary | null;
  /** Newest ready deploy preview per pull request, newest first. */
  previews: PreviewLink[];
}

export interface NfDeploy {
  state: string;
  context: string;
  created_at: string;
  published_at?: string | null;
  deploy_ssl_url?: string | null;
  branch?: string | null;
  error_message?: string | null;
  review_id?: number | null;
  review_url?: string | null;
  title?: string | null;
}

export interface NfSite {
  id: string;
  name: string;
  url: string;
  ssl_url?: string | null;
  admin_url: string;
  screenshot_url?: string | null;
  updated_at?: string;
  published_deploy?: NfDeploy | null;
}

const PREVIEW_LIMIT = 5;

export function deployState(raw: string): DeployState {
  if (raw === 'ready') return 'ready';
  if (raw === 'error' || raw === 'rejected') return 'error';
  if (raw === 'canceled' || raw === 'cancelled' || raw === 'skipped') return 'canceled';
  return 'building';
}

function toDeploy(d: NfDeploy, fallbackUrl: string): DeploySummary {
  return {
    state: deployState(d.state),
    at: d.published_at ?? d.created_at,
    url: d.deploy_ssl_url ?? fallbackUrl,
    branch: d.branch ?? null,
    error: d.error_message || null,
  };
}

/** The site link, its latest production deploy and its recent deploy previews. `deploys` is newest first. */
export function summarize(site: NfSite, deploys: readonly NfDeploy[]): NetlifySummary {
  const url = site.ssl_url || site.url.replace(/^http:/, 'https:');
  const production = deploys.find((d) => d.context === 'production') ?? site.published_deploy ?? null;
  const previews: PreviewLink[] = [];
  const seen = new Set<number>();
  for (const d of deploys) {
    if (d.context !== 'deploy-preview' || d.state !== 'ready' || !d.review_id || !d.deploy_ssl_url) continue;
    if (seen.has(d.review_id)) continue;
    seen.add(d.review_id);
    previews.push({ review: d.review_id, title: d.title ?? null, url: d.deploy_ssl_url, prUrl: d.review_url ?? null, at: d.created_at });
    if (previews.length === PREVIEW_LIMIT) break;
  }
  return {
    siteId: site.id,
    name: site.name,
    url,
    adminUrl: site.admin_url,
    screenshotUrl: site.screenshot_url || null,
    latest: production ? toDeploy(production, url) : null,
    previews,
  };
}

function sourceAllows(source: string, origin: URL): boolean {
  const s = source.toLowerCase();
  if (s === '*') return true;
  if (s === "'self'" || s === "'none'") return false;
  if (/^[a-z][a-z0-9+.-]*:$/.test(s)) return origin.protocol === s;
  const match = /^(?:([a-z][a-z0-9+.-]*):\/\/)?([^/:]+)(?::(\d+|\*))?/.exec(s);
  if (!match) return false;
  const [, scheme, host = '', port] = match;
  if (scheme && `${scheme}:` !== origin.protocol) return false;
  if (port && port !== '*' && port !== (origin.port || (origin.protocol === 'https:' ? '443' : '80'))) return false;
  if (host.startsWith('*.')) return origin.hostname.endsWith(host.slice(1));
  return origin.hostname === host;
}

/**
 * Whether a page with these response headers will render inside an iframe on `origin`.
 * CSP frame-ancestors wins over X-Frame-Options, as it does in browsers.
 */
export function canEmbed(status: number, headers: Headers, origin: string): boolean {
  if (status >= 400) return false;
  const here = new URL(origin);
  const csp = headers.get('content-security-policy') ?? '';
  const directive = csp
    .split(',')
    .flatMap((policy) => policy.split(';'))
    .map((d) => d.trim().split(/\s+/))
    .find(([name]) => name?.toLowerCase() === 'frame-ancestors');
  if (directive) return directive.slice(1).some((src) => sourceAllows(src, here));
  const xfo = (headers.get('x-frame-options') ?? '').trim().toLowerCase();
  return xfo === '';
}
