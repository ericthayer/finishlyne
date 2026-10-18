import type { ProjectListing } from '../data/projects.ts';
import type { GitHubItem, GitHubRepo, RepoDetails, RepoLinkRecord } from '../data/github.ts';
import { relativeTime, type KpiModel } from './overview-model.ts';

// The GitHub page: KPI strip, linked repos (opened for live detail) and every repo the App can see.

export interface GitHubKpi extends Omit<KpiModel, 'icon'> {
  icon: 'github' | 'bookmark' | 'commit' | 'alert';
}

export interface LinkedRepo {
  repoId: number;
  fullName: string;
  url: string;
  project: { name: string; href: string };
  /** e.g. "2 open PRs · 1 open issue · pushed 3 hrs ago" */
  summary: string;
}

export interface GitHubPageView {
  kpis: GitHubKpi[];
  linked: LinkedRepo[];
}

const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

export function buildGitHubPage(
  repos: readonly GitHubRepo[],
  links: readonly RepoLinkRecord[],
  items: readonly GitHubItem[],
  listings: readonly ProjectListing[],
  now: Date,
): GitHubPageView {
  const byProject = new Map(listings.map((l) => [l.project.id, l.project]));
  const prs = items.filter((i) => i.kind === 'pr').length;
  const issues = items.length - prs;
  const projects = new Set(links.map((l) => l.projectId)).size;
  const hidden = repos.filter((r) => r.private).length;

  const linked = links
    .map((l): LinkedRepo => {
      const own = items.filter((i) => i.repoLinkId === l.id);
      const p = byProject.get(l.projectId);
      const open = own.filter((i) => i.kind === 'pr').length;
      return {
        repoId: l.githubRepoId,
        fullName: l.fullName,
        url: repos.find((r) => r.id === l.githubRepoId)?.url ?? `https://github.com/${l.fullName}`,
        project: { name: p?.name ?? 'Unknown project', href: p ? `/p/${p.slug}` : '/projects' },
        summary: [
          plural(open, 'open PR'),
          plural(own.length - open, 'open issue'),
          l.lastPushAt ? `pushed ${relativeTime(l.lastPushAt, now)}` : 'no pushes yet',
        ].join(' · '),
      };
    })
    .sort((a, b) => a.project.name.localeCompare(b.project.name) || a.fullName.localeCompare(b.fullName));

  return {
    kpis: [
      { label: 'Repositories', icon: 'github', value: String(repos.length), meta: hidden ? `${hidden} private` : 'All public' },
      { label: 'Linked', icon: 'bookmark', value: String(links.length), meta: `to ${plural(projects, 'project')}` },
      { label: 'Open PRs', icon: 'commit', value: String(prs), meta: 'On linked repos' },
      { label: 'Open issues', icon: 'alert', value: String(issues), meta: 'On linked repos' },
    ],
    linked,
  };
}

export interface DetailEntry {
  title: string;
  href: string;
  /** `#12` */
  key: string;
  meta: string;
  tags: string[];
}

export interface DetailView {
  /** "Latest release v0.4.0 · 2 days ago" or null */
  release: { label: string; href: string } | null;
  /** "a1b2c3d Fix the drawer · 3 hrs ago on main" */
  commit: { label: string; href: string } | null;
  pulls: DetailEntry[];
  issues: DetailEntry[];
  branches: { name: string; meta: string; href: string }[];
}

export function buildDetail(d: RepoDetails, now: Date): DetailView {
  const when = (iso: string | null): string => (iso ? relativeTime(iso, now) : 'date unknown');
  return {
    release: d.release ? { label: `${d.release.name} · ${when(d.release.publishedAt)}`, href: d.release.url } : null,
    commit: d.lastCommit
      ? { label: `${d.lastCommit.sha} ${d.lastCommit.message} · ${when(d.lastCommit.at)} on ${d.defaultBranch}`, href: d.lastCommit.url }
      : null,
    pulls: d.pulls.map((p) => ({
      title: p.title,
      href: p.url,
      key: `#${p.number}`,
      meta: [p.branch, p.author && `by ${p.author}`, p.reviewers ? plural(p.reviewers, 'reviewer') + ' requested' : '', `updated ${when(p.updatedAt)}`]
        .filter(Boolean)
        .join(' · '),
      tags: [...(p.draft ? ['Draft'] : []), ...p.labels],
    })),
    issues: d.issues.map((i) => ({
      title: i.title,
      href: i.url,
      key: `#${i.number}`,
      meta: [i.author && `by ${i.author}`, i.comments ? plural(i.comments, 'comment') : '', `updated ${when(i.updatedAt)}`].filter(Boolean).join(' · '),
      tags: i.labels,
    })),
    branches: d.branches.map((b) => ({
      name: b.name,
      meta: [b.sha, b.by && `by ${b.by}`, when(b.at)].filter(Boolean).join(' · '),
      href: `https://github.com/${d.fullName}/tree/${b.name.split('/').map(encodeURIComponent).join('/')}`,
    })),
  };
}
