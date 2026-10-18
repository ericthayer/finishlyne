// What the netlify Edge Function answers. The Netlify shapes are defined next to the
// function so both sides read the same types.
import type { NetlifySummary } from '../../supabase/functions/netlify/summary.ts';

export type { DeployState, DeploySummary, NetlifySummary, PreviewLink } from '../../supabase/functions/netlify/summary.ts';

/** connected: data flows. not-configured: no token on the server. not-yours: the token is someone else's. */
export type NetlifyStatus = 'connected' | 'not-configured' | 'not-yours';

export interface ProjectSiteInfo {
  /** Whether the live site allows framing; null when there is no site or the check failed. */
  embeddable: boolean | null;
  netlify: NetlifySummary | null;
}

export interface PreviewsResult {
  netlify: NetlifyStatus;
  projects: Readonly<Record<string, ProjectSiteInfo>>;
}

export interface NetlifySiteOption {
  id: string;
  name: string;
  url: string;
}

export interface NetlifySitesResult {
  netlify: NetlifyStatus;
  sites: readonly NetlifySiteOption[];
}

/** What the edit dialog asks for. Empty strings clear. */
export type ScreenshotChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'replace'; file: Blob };

export interface SiteChange {
  siteUrl: string;
  netlifySiteId: string;
  screenshot: ScreenshotChange;
}
