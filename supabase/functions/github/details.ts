// One repo in depth, fetched live when its row is opened on the GitHub page. Nothing here is
// cached: it is read-only, for one user, and GitHub stays the source of truth (SPEC §7).
import { get, GitHubError } from './app.ts';

interface GhUser {
  login: string;
}

interface GhLabel {
  name: string;
}

interface GhRepo {
  full_name: string;
  html_url: string;
  default_branch: string;
}

interface GhPull {
  number: number;
  title: string;
  html_url: string;
  draft?: boolean;
  updated_at: string;
  user: GhUser | null;
  head: { ref: string };
  requested_reviewers?: GhUser[];
  labels: GhLabel[];
}

interface GhIssue {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  comments: number;
  user: GhUser | null;
  labels: GhLabel[];
  pull_request?: unknown;
}

interface GhPush {
  ref: string;
  after: string;
  timestamp: string;
  actor: GhUser | null;
}

interface GhRelease {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
}

interface GhCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author: { date: string } | null };
}

export interface RepoDetails {
  fullName: string;
  url: string;
  defaultBranch: string;
  pulls: { number: number; title: string; url: string; draft: boolean; author: string; branch: string; reviewers: number; labels: string[]; updatedAt: string }[];
  issues: { number: number; title: string; url: string; author: string; comments: number; labels: string[]; updatedAt: string }[];
  /** Latest push per branch, newest first; agent branches (claude/*, codex/*) show up here. */
  branches: { name: string; sha: string; by: string; at: string }[];
  release: { tag: string; name: string; url: string; publishedAt: string | null } | null;
  lastCommit: { sha: string; message: string; url: string; at: string | null } | null;
}

/** A failed side request (no releases, no activity yet) leaves its part empty instead of failing the page. */
const soft = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch((): T => fallback);

export async function repoDetails(token: string, repoId: number): Promise<RepoDetails> {
  // The installation token only reaches repos granted to it, so this read is the access check.
  const repo = await get<GhRepo>(`/repositories/${repoId}`, token);
  const base = `/repos/${repo.full_name}`;
  const [pulls, issues, pushes, release, commits] = await Promise.all([
    soft(get<GhPull[]>(`${base}/pulls?state=open&sort=updated&direction=desc&per_page=20`, token), []),
    soft(get<GhIssue[]>(`${base}/issues?state=open&sort=updated&per_page=40`, token), []),
    soft(get<GhPush[]>(`${base}/activity?activity_type=push&per_page=40`, token), []),
    get<GhRelease>(`${base}/releases/latest`, token).catch((error: unknown): null => {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }),
    soft(get<GhCommit[]>(`${base}/commits?per_page=1`, token), []),
  ]);

  const seen = new Set<string>();
  const branches: RepoDetails['branches'] = [];
  for (const p of pushes) {
    const name = p.ref.replace(/^refs\/heads\//, '');
    if (seen.has(name)) continue;
    seen.add(name);
    branches.push({ name, sha: p.after.slice(0, 7), by: p.actor?.login ?? '', at: p.timestamp });
    if (branches.length === 8) break;
  }
  const commit = commits[0];

  return {
    fullName: repo.full_name,
    url: repo.html_url,
    defaultBranch: repo.default_branch,
    pulls: pulls.map((p) => ({
      number: p.number,
      title: p.title,
      url: p.html_url,
      draft: p.draft === true,
      author: p.user?.login ?? '',
      branch: p.head.ref,
      reviewers: p.requested_reviewers?.length ?? 0,
      labels: p.labels.map((l) => l.name),
      updatedAt: p.updated_at,
    })),
    issues: issues
      .filter((i) => !i.pull_request)
      .slice(0, 20)
      .map((i) => ({
        number: i.number,
        title: i.title,
        url: i.html_url,
        author: i.user?.login ?? '',
        comments: i.comments,
        labels: i.labels.map((l) => l.name),
        updatedAt: i.updated_at,
      })),
    branches,
    release: release
      ? { tag: release.tag_name, name: release.name || release.tag_name, url: release.html_url, publishedAt: release.published_at }
      : null,
    lastCommit: commit
      ? { sha: commit.sha.slice(0, 7), message: commit.commit.message.split('\n')[0] ?? '', url: commit.html_url, at: commit.commit.author?.date ?? null }
      : null,
  };
}
