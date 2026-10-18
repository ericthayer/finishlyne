import type { Backend } from './client.ts';

// GitHub, read-only. The `github` Edge Function talks to GitHub with installation tokens;
// this module never holds a GitHub token. Cached links and items are read through RLS.

export type GitHubStatus =
  | { kind: 'not-configured'; missing: string[] }
  | { kind: 'not-installed'; installUrl: string }
  | { kind: 'connected'; account: string; manageUrl: string };

/** A repo the Finishlyne App can see. */
export interface GitHubRepo {
  id: number;
  fullName: string;
  url: string;
  private: boolean;
  pushedAt: string | null;
  description: string | null;
  language: string | null;
  archived: boolean;
  /** Open issues plus open PRs, as GitHub counts them. */
  openCount: number;
}

/** One repo in depth, fetched live from GitHub when its row is opened on the GitHub page. */
export interface RepoDetails {
  fullName: string;
  url: string;
  defaultBranch: string;
  pulls: { number: number; title: string; url: string; draft: boolean; author: string; branch: string; reviewers: number; labels: string[]; updatedAt: string }[];
  issues: { number: number; title: string; url: string; author: string; comments: number; labels: string[]; updatedAt: string }[];
  /** Latest push per branch, newest first. */
  branches: { name: string; sha: string; by: string; at: string }[];
  release: { tag: string; name: string; url: string; publishedAt: string | null } | null;
  lastCommit: { sha: string; message: string; url: string; at: string | null } | null;
}

export interface RepoLinkRecord {
  id: string;
  projectId: string;
  githubRepoId: number;
  fullName: string;
  lastPushAt: string | null;
  lastSyncedAt: string | null;
}

/** An open issue or pull request on a linked repo, as last synced. */
export interface GitHubItem {
  repoLinkId: string;
  number: number;
  kind: 'issue' | 'pr';
  title: string;
  updatedAt: string;
}

/** The seam the GitHub page and the side panel talk to. Supabase in the app, in-memory in e2e fixtures. */
export interface GitHubSource {
  status(): Promise<GitHubStatus>;
  repos(): Promise<GitHubRepo[]>;
  details(repoId: number): Promise<RepoDetails>;
  links(): Promise<RepoLinkRecord[]>;
  items(): Promise<GitHubItem[]>;
  /** Links the repo to one project (moving it off any other) and syncs it. */
  link(projectId: string, repoId: number): Promise<void>;
  unlink(linkId: string): Promise<void>;
  /** Refreshes every linked repo from GitHub. */
  sync(): Promise<void>;
}

interface LinkRow {
  id: string;
  project_id: string;
  github_repo_id: number;
  full_name: string;
  last_push_at: string | null;
  last_synced_at: string | null;
}

interface ItemRow {
  repo_link_id: string;
  number: number;
  kind: 'issue' | 'pr';
  title: string;
  updated_at: string;
}

const fail = (error: { message: string }): never => {
  throw new Error(error.message);
};

export function supabaseGitHub(backend: Backend): GitHubSource {
  const { db } = backend;
  return {
    status: () => backend.invoke<GitHubStatus>('github', { action: 'status' }),
    async repos() {
      const out = await backend.invoke<{ repos?: GitHubRepo[] } & Partial<GitHubStatus>>('github', { action: 'repos' });
      return out.repos ?? [];
    },
    details: (repoId) => backend.invoke<RepoDetails>('github', { action: 'details', repoId }),
    async links() {
      const { data, error } = await db
        .from('repo_links')
        .select('id, project_id, github_repo_id, full_name, last_push_at, last_synced_at')
        .order('linked_at');
      if (error) fail(error);
      return ((data ?? []) as LinkRow[]).map((r) => ({
        id: r.id,
        projectId: r.project_id,
        githubRepoId: r.github_repo_id,
        fullName: r.full_name,
        lastPushAt: r.last_push_at,
        lastSyncedAt: r.last_synced_at,
      }));
    },
    async items() {
      const { data, error } = await db
        .from('issue_links')
        .select('repo_link_id, number, kind, title, updated_at')
        .eq('state', 'open')
        .order('updated_at', { ascending: false });
      if (error) fail(error);
      return ((data ?? []) as ItemRow[]).map((r) => ({
        repoLinkId: r.repo_link_id,
        number: r.number,
        kind: r.kind,
        title: r.title,
        updatedAt: r.updated_at,
      }));
    },
    async link(projectId, repoId) {
      await backend.invoke('github', { action: 'link', projectId, repoId });
    },
    async unlink(linkId) {
      const { error } = await db.from('repo_links').delete().eq('id', linkId);
      if (error) fail(error);
    },
    async sync() {
      await backend.invoke('github', { action: 'sync' });
    },
  };
}
