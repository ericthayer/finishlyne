import { describe, expect, it } from 'vitest';
import type { GitHubItem, RepoLinkRecord } from '../src/data/github.ts';
import type { ProjectListing } from '../src/data/projects.ts';
import { buildIssues, buildRepoRows, itemHref, needsSync, projectChoices } from '../src/state/github-model.ts';
import { project } from './fixtures.ts';

const NOW = new Date('2026-10-10T12:00:00Z');

function listing(overrides: Parameters<typeof project>[0]): ProjectListing {
  return { project: project(overrides), platform: null, repo: null };
}

function link(overrides: Partial<RepoLinkRecord> = {}): RepoLinkRecord {
  return {
    id: 'l1',
    projectId: 'p1',
    githubRepoId: 101,
    fullName: 'ericthayer/finishlyne',
    lastPushAt: '2026-10-10T09:00:00Z',
    lastSyncedAt: '2026-10-10T11:56:00Z',
    ...overrides,
  };
}

function item(overrides: Partial<GitHubItem> = {}): GitHubItem {
  return { repoLinkId: 'l1', number: 7, kind: 'issue', title: 'Fix it', updatedAt: '2026-10-10T10:00:00Z', ...overrides };
}

describe('needsSync', () => {
  it('syncs links never synced or synced more than 15 minutes ago', () => {
    expect(needsSync([link()], NOW)).toBe(false);
    expect(needsSync([link({ lastSyncedAt: null })], NOW)).toBe(true);
    expect(needsSync([link({ lastSyncedAt: '2026-10-10T11:44:00Z' })], NOW)).toBe(true);
    expect(needsSync([], NOW)).toBe(false);
  });
});

describe('buildIssues', () => {
  it('groups open PRs before issues per project, active projects first', () => {
    const view = buildIssues(
      [link(), link({ id: 'l2', projectId: 'p2', githubRepoId: 102, fullName: 'ericthayer/other', lastPushAt: null })],
      [item(), item({ number: 9, kind: 'pr', title: 'Add sync' }), item({ repoLinkId: 'l2', number: 1 })],
      [listing({ id: 'p2', name: 'Alpha', slug: 'alpha', status: 'active' }), listing({ status: 'paused' }), listing({ id: 'p3', name: 'No repo' })],
      NOW,
    );
    expect(view.synced).toBe('Synced 4 min ago');
    expect(view.groups.map((g) => g.name)).toEqual(['Alpha', 'Finishline']);
    const [, finish] = view.groups;
    expect(finish?.summary).toBe('1 open PR · 1 open issue · pushed 3 hrs ago');
    expect(finish?.prs).toEqual([
      { kind: 'pr', title: 'Add sync', href: 'https://github.com/ericthayer/finishlyne/pull/9', key: '#9', meta: 'ericthayer/finishlyne · updated 2 hrs ago' },
    ]);
    expect(finish?.issues.map((i) => i.href)).toEqual(['https://github.com/ericthayer/finishlyne/issues/7']);
    expect(view.groups[0]?.summary).toBe('0 open PRs · 1 open issue · no pushes yet');
  });

  it('says nothing about sync time before the first sync', () => {
    expect(buildIssues([link({ lastSyncedAt: null })], [], [listing({})], NOW).synced).toBeNull();
  });
});

describe('repo rows', () => {
  it('marks which project each repo is linked to', () => {
    const rows = buildRepoRows(
      [
        { id: 101, fullName: 'ericthayer/finishlyne', url: 'https://github.com/ericthayer/finishlyne', private: false, pushedAt: '2026-10-09T12:00:00Z' },
        { id: 102, fullName: 'ericthayer/other', url: 'https://github.com/ericthayer/other', private: true, pushedAt: null },
      ],
      [link()],
      NOW,
    );
    expect(rows.map((r) => [r.fullName, r.projectId, r.linkId, r.pushed])).toEqual([
      ['ericthayer/finishlyne', 'p1', 'l1', 'Pushed 1 day ago'],
      ['ericthayer/other', '', null, 'No pushes yet'],
    ]);
  });

  it('offers projects that are not archived, unless the repo is linked to one', () => {
    const all = [listing({ name: 'Beta' }), listing({ id: 'p2', name: 'Alpha', status: 'archived' })];
    expect(projectChoices(all, '').map((c) => c.label)).toEqual(['Beta']);
    expect(projectChoices(all, 'p2').map((c) => c.label)).toEqual(['Alpha', 'Beta']);
  });

  it('builds GitHub URLs for PRs and issues', () => {
    expect(itemHref('a/b', { kind: 'pr', number: 3 })).toBe('https://github.com/a/b/pull/3');
  });
});
