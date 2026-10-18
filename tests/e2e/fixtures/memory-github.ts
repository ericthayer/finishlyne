import type { GitHubItem, GitHubRepo, GitHubSource, GitHubStatus, RepoLinkRecord } from '../../../src/data/github.ts';

// In-memory GitHubSource for fixture pages. `?github=not-installed` or `not-configured` changes the
// connection state; `?fail=link` makes linking answer like the server would.

const SYNCED = '2026-10-10T11:56:00Z';

export const FIXTURE_REPOS: GitHubRepo[] = [
  { id: 101, fullName: 'ericthayer/finishline', url: 'https://github.com/ericthayer/finishline', private: false, pushedAt: '2026-10-10T09:00:00Z' },
  { id: 102, fullName: 'ericthayer/devlog', url: 'https://github.com/ericthayer/devlog', private: true, pushedAt: '2026-10-02T09:00:00Z' },
];

export function memoryGitHub(mode: string | null, fail: string | null, linked: RepoLinkRecord[] = []): GitHubSource {
  const links = [...linked];
  const items: GitHubItem[] = links.length
    ? [
        { repoLinkId: links[0]?.id ?? '', number: 12, kind: 'pr', title: 'Sync repos from the GitHub App', updatedAt: '2026-10-10T10:00:00Z' },
        { repoLinkId: links[0]?.id ?? '', number: 8, kind: 'issue', title: 'Stale badge ignores agent branches', updatedAt: '2026-10-09T10:00:00Z' },
      ]
    : [];
  let n = 0;
  const status: GitHubStatus =
    mode === 'not-installed' ? { kind: 'not-installed', installUrl: 'https://github.com/apps/finishlyne/installations/new' }
    : mode === 'not-configured' ? { kind: 'not-configured', missing: ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY'] }
    : { kind: 'connected', account: 'ericthayer', manageUrl: 'https://github.com/settings/installations/1' };
  return {
    async status() {
      return status;
    },
    async repos() {
      return FIXTURE_REPOS;
    },
    async links() {
      return links.map((l) => ({ ...l }));
    },
    async items() {
      return items;
    },
    async link(projectId, repoId) {
      if (fail === 'link') throw new Error('The Finishlyne App cannot see that repository.');
      const repo = FIXTURE_REPOS.find((r) => r.id === repoId);
      if (!repo) throw new Error('Unknown repo');
      const at = links.findIndex((l) => l.githubRepoId === repoId);
      if (at >= 0) links.splice(at, 1);
      links.push({ id: `link-${++n}`, projectId, githubRepoId: repoId, fullName: repo.fullName, lastPushAt: repo.pushedAt, lastSyncedAt: SYNCED });
    },
    async unlink(linkId) {
      const at = links.findIndex((l) => l.id === linkId);
      if (at >= 0) links.splice(at, 1);
    },
    async sync() {
      for (const l of links) l.lastSyncedAt = SYNCED;
    },
  };
}
