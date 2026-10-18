import type { NetlifySummary, ProjectSiteInfo } from '../domain/site.ts';
import type { Project } from '../domain/types.ts';

// Picks what a project's preview shows: the uploaded screenshot, the live site in a
// frame when it allows framing, Netlify's own screenshot, or nothing.

export type PreviewFrame =
  | { kind: 'image'; src: string; source: 'upload' | 'netlify' }
  | { kind: 'live'; url: string }
  | { kind: 'none' };

export type Tone = 'neutral' | 'positive' | 'warning' | 'danger';

export interface SitePreviewModel {
  name: string;
  frame: PreviewFrame;
  /** The live site, opened from the caption. */
  siteUrl: string | null;
  deploy: { label: string; tone: Tone; href: string } | null;
  previews: readonly { label: string; href: string }[];
}

const CARD_PREVIEWS = 2;

/** `2h ago`, `3d ago`; `just now` under a minute. */
export function ago(at: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - Date.parse(at)) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function deployLine(n: NetlifySummary, now: Date): SitePreviewModel['deploy'] {
  const latest = n.latest;
  if (!latest) return null;
  const href = `${n.adminUrl}/deploys`;
  if (latest.state === 'building') return { label: 'Deploying', tone: 'warning', href };
  if (latest.state === 'error') return { label: `Deploy failed ${ago(latest.at, now)}`, tone: 'danger', href };
  if (latest.state === 'canceled') return { label: `Deploy canceled ${ago(latest.at, now)}`, tone: 'neutral', href };
  return { label: `Deployed ${ago(latest.at, now)}`, tone: 'positive', href };
}

export function buildSitePreview(
  project: Pick<Project, 'name' | 'siteUrl'>,
  info: ProjectSiteInfo | null,
  screenshotUrl: string | null,
  now: Date,
): SitePreviewModel | null {
  const netlify = info?.netlify ?? null;
  const siteUrl = project.siteUrl ?? netlify?.url ?? null;
  let frame: PreviewFrame = { kind: 'none' };
  if (screenshotUrl) frame = { kind: 'image', src: screenshotUrl, source: 'upload' };
  else if (siteUrl && info?.embeddable === true) frame = { kind: 'live', url: siteUrl };
  else if (netlify?.screenshotUrl) frame = { kind: 'image', src: netlify.screenshotUrl, source: 'netlify' };
  if (frame.kind === 'none' && !siteUrl && !netlify) return null;
  return {
    name: project.name,
    frame,
    siteUrl,
    deploy: netlify ? deployLine(netlify, now) : null,
    previews: (netlify?.previews ?? []).slice(0, CARD_PREVIEWS).map((p) => ({ label: `Preview #${p.review}`, href: p.url })),
  };
}
