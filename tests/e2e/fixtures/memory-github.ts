import type { GitHubItem, GitHubRepo, GitHubSource, GitHubStatus, RepoDetails, RepoLinkRecord } from '../../../src/data/github.ts';

// In-memory GitHubSource for fixture pages. `?github=not-installed` or `not-configured` changes the
// connection state; `?fail=link` makes linking answer like the server would, `?fail=details` fails repo detail.

const SYNCED = '2026-10-10T11:56:00Z';

export const FIXTURE_REPOS: GitHubRepo[] = [
  {
    id: 101,
    fullName: 'ericthayer/finishline',
    url: 'https://github.com/ericthayer/finishline',
    private: false,
    pushedAt: '2026-10-10T09:00:00Z',
    description: 'Side projects, finished.',
    language: 'TypeScript',
    archived: false,
    openCount: 2,
  },
  {
    id: 102,
    fullName: 'ericthayer/devlog',
    url: 'https://github.com/ericthayer/devlog',
    private: true,
    pushedAt: '2026-10-02T09:00:00Z',
    description: null,
    language: null,
    archived: false,
    openCount: 0,
  },
];

const DETAILS: RepoDetails = {
  fullName: 'ericthayer/finishline',
  url: 'https://github.com/ericthayer/finishline',
  defaultBranch: 'main',
  pulls: [
    {
      number: 12,
      title: 'Sync repos from the GitHub App',
      url: 'https://github.com/ericthayer/finishline/pull/12',
      draft: true,
      author: 'claude',
      branch: 'claude/github-sync',
      reviewers: 1,
      labels: ['feature'],
      updatedAt: '2026-10-10T10:00:00Z',
    },
  ],
  issues: [
    {
      number: 8,
      title: 'Stale badge ignores agent branches',
      url: 'https://github.com/ericthayer/finishline/issues/8',
      author: 'ericthayer',
      comments: 3,
      labels: ['bug'],
      updatedAt: '2026-10-09T10:00:00Z',
    },
  ],
  branches: [
    { name: 'claude/github-sync', sha: 'a1b2c3d', by: 'claude', at: '2026-10-10T09:00:00Z' },
    { name: 'main', sha: '9f8e7d6', by: 'ericthayer', at: '2026-10-09T12:00:00Z' },
  ],
  release: { tag: 'v0.4.0', name: 'v0.4.0', url: 'https://github.com/ericthayer/finishline/releases/tag/v0.4.0', publishedAt: '2026-10-08T12:00:00Z' },
  lastCommit: { sha: '9f8e7d6', message: 'feat: shell v2', url: 'https://github.com/ericthayer/finishline/commit/9f8e7d6', at: '2026-10-09T12:00:00Z' },
};

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
    async details(repoId) {
      if (fail === 'details') throw new Error('GitHub /repositories answered 500');
      const repo = FIXTURE_REPOS.find((r) => r.id === repoId);
      return repo?.id === 101 ? DETAILS : { ...DETAILS, fullName: repo?.fullName ?? '', pulls: [], issues: [], branches: [], release: null, lastCommit: null };
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
