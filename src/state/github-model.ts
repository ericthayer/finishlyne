import type { ProjectListing } from '../data/projects.ts';
import type { GitHubItem, GitHubRepo, RepoLinkRecord } from '../data/github.ts';
import type { ProjectStatus } from '../domain/types.ts';
import { relativeTime } from './overview-model.ts';

// GitHub views: the side panel's Issues tab and the GitHub page's repo list. Pure, so it is unit-tested.

/** Opening the Issues tab refreshes links older than this (SPEC §7). */
export const SYNC_AFTER_MS = 15 * 60_000;

export function needsSync(links: readonly RepoLinkRecord[], now: Date): boolean {
  return links.some((l) => !l.lastSyncedAt || now.getTime() - Date.parse(l.lastSyncedAt) > SYNC_AFTER_MS);
}

export interface IssueEntry {
  kind: 'issue' | 'pr';
  title: string;
  href: string;
  /** `#12` */
  key: string;
  meta: string;
}

export interface IssueGroup {
  projectId: string;
  name: string;
  href: string;
  repos: { fullName: string; href: string }[];
  /** e.g. "2 open PRs · 1 open issue · pushed 3 hrs ago" */
  summary: string;
  prs: IssueEntry[];
  issues: IssueEntry[];
}

export interface IssuesView {
  groups: IssueGroup[];
  /** "Synced 4 min ago", from the oldest link; null before the first sync. */
  synced: string | null;
}

const RANK: Readonly<Record<ProjectStatus, number>> = { active: 0, ready: 1, paused: 2, idea: 3, shipped: 4, archived: 5 };

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

export function itemHref(fullName: string, item: Pick<GitHubItem, 'kind' | 'number'>): string {
  return `https://github.com/${fullName}/${item.kind === 'pr' ? 'pull' : 'issues'}/${item.number}`;
}

export function buildIssues(
  links: readonly RepoLinkRecord[],
  items: readonly GitHubItem[],
  listings: readonly ProjectListing[],
  now: Date,
): IssuesView {
  const byLink = new Map(links.map((l) => [l.id, l]));
  const groups: (IssueGroup & { rank: number })[] = [];
  for (const listing of listings) {
    const own = links.filter((l) => l.projectId === listing.project.id);
    if (!own.length) continue;
    const ids = new Set(own.map((l) => l.id));
    const entries = items
      .filter((i) => ids.has(i.repoLinkId))
      .map((i): IssueEntry => {
        const repo = byLink.get(i.repoLinkId)?.fullName ?? '';
        return { kind: i.kind, title: i.title, href: itemHref(repo, i), key: `#${i.number}`, meta: `${repo} · updated ${relativeTime(i.updatedAt, now)}` };
      });
    const prs = entries.filter((e) => e.kind === 'pr');
    const issues = entries.filter((e) => e.kind === 'issue');
    const pushes = own.map((l) => l.lastPushAt).filter((t): t is string => t !== null).sort();
    const last = pushes.at(-1);
    groups.push({
      projectId: listing.project.id,
      name: listing.project.name,
      href: `/p/${listing.project.slug}`,
      repos: own.map((l) => ({ fullName: l.fullName, href: `https://github.com/${l.fullName}` })),
      summary: [plural(prs.length, 'open PR'), plural(issues.length, 'open issue'), last ? `pushed ${relativeTime(last, now)}` : 'no pushes yet'].join(' · '),
      prs,
      issues,
      rank: RANK[listing.project.status],
    });
  }
  groups.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return { groups: groups.map(({ rank: _rank, ...g }) => g), synced: syncedLabel(links, now) };
}

/** "Synced 4 min ago", from the oldest link; null before the first sync. */
export function syncedLabel(links: readonly RepoLinkRecord[], now: Date): string | null {
  const synced = links.map((l) => l.lastSyncedAt).filter((t): t is string => t !== null).sort()[0];
  return synced ? `Synced ${relativeTime(synced, now)}` : null;
}

export interface RepoRow {
  id: number;
  fullName: string;
  url: string;
  private: boolean;
  archived: boolean;
  description: string | null;
  /** "TypeScript · 3 open · Pushed 2 days ago" */
  facts: string;
  /** The link to move or remove; null when the repo is not linked. */
  linkId: string | null;
  /** '' when not linked. */
  projectId: string;
}

export function buildRepoRows(repos: readonly GitHubRepo[], links: readonly RepoLinkRecord[], now: Date): RepoRow[] {
  return repos.map((r) => {
    const link = links.find((l) => l.githubRepoId === r.id) ?? null;
    return {
      id: r.id,
      fullName: r.fullName,
      url: r.url,
      private: r.private,
      archived: r.archived,
      description: r.description,
      facts: [r.language, r.openCount ? `${r.openCount} open` : '', r.pushedAt ? `Pushed ${relativeTime(r.pushedAt, now)}` : 'No pushes yet']
        .filter(Boolean)
        .join(' · '),
      linkId: link?.id ?? null,
      projectId: link?.projectId ?? '',
    };
  });
}

/** Projects a repo can be linked to: everything not archived, plus whatever it is linked to now. */
export function projectChoices(listings: readonly ProjectListing[], linkedTo: string): { value: string; label: string }[] {
  return listings
    .filter((l) => l.project.status !== 'archived' || l.project.id === linkedTo)
    .map((l) => ({ value: l.project.id, label: l.project.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
