import { describe, expect, it } from 'vitest';
import type { ProjectListing } from '../src/data/projects.ts';
import { DEFAULT_STATUSES, filterProjects, toProjectRows } from '../src/state/projects-model.ts';
import { project } from './fixtures.ts';

const listing = (overrides: Parameters<typeof project>[0], extra: Partial<ProjectListing> = {}): ProjectListing => ({
  project: project(overrides),
  platform: null,
  repo: null,
  ...extra,
});

const all: ProjectListing[] = [
  listing({ id: 'a', slug: 'devlog', name: 'DevLog', status: 'active' }, { platform: { platform: 'claude_code', label: null, url: null }, repo: 'ericthayer/devlog' }),
  listing({ id: 'b', slug: 'univia', name: 'Univia', status: 'ready', lastProgressAt: '2026-10-01T12:00:00Z' }),
  listing({ id: 'c', name: 'Stacker', status: 'paused', reviewOn: '2026-09-01' }),
  listing({ id: 'd', name: 'Portfolio v3', status: 'shipped', shippedAt: '2026-10-03T00:00:00Z' }),
  listing({ id: 'e', name: 'Old idea', status: 'archived', archivedReason: 'Superseded' }),
];

describe('filterProjects', () => {
  it('hides shipped and archived projects by default', () => {
    const names = filterProjects(all, { query: '', statuses: DEFAULT_STATUSES }).map((l) => l.project.name);
    expect(names).toEqual(['DevLog', 'Univia', 'Stacker']);
  });

  it('searches names case-insensitively and ignores surrounding space', () => {
    const names = filterProjects(all, { query: '  DEV ', statuses: DEFAULT_STATUSES }).map((l) => l.project.name);
    expect(names).toEqual(['DevLog']);
  });

  it('shows a status only when it is selected, and can search across closed projects', () => {
    const shipped = new Set(['shipped'] as const);
    expect(filterProjects(all, { query: '', statuses: shipped }).map((l) => l.project.name)).toEqual(['Portfolio v3']);
    expect(filterProjects(all, { query: 'old', statuses: new Set(['archived'] as const) }).map((l) => l.project.name)).toEqual(['Old idea']);
    expect(filterProjects(all, { query: 'old', statuses: DEFAULT_STATUSES })).toEqual([]);
  });

  it('returns nothing when no status is selected', () => {
    expect(filterProjects(all, { query: '', statuses: new Set() })).toEqual([]);
  });
});

describe('toProjectRows', () => {
  const now = new Date('2026-10-10T12:00:00Z');

  it('sorts by name and labels platform and repo', () => {
    const rows = toProjectRows(all, now);
    expect(rows.map((r) => r.name)).toEqual(['DevLog', 'Old idea', 'Portfolio v3', 'Stacker', 'Univia']);
    expect(rows[0]).toMatchObject({ key: 'ericthayer/devlog', platform: 'Claude Code', platformId: 'claude_code', href: '/p/devlog' });
  });

  it('falls back to the slug when there is no repo, and omits an absent platform', () => {
    const univia = toProjectRows(all, now).find((r) => r.name === 'Univia');
    expect(univia).toMatchObject({ key: 'univia', href: '/p/univia', status: 'ready', stale: { level: 'fresh', days: 9 } });
    expect(univia).not.toHaveProperty('platform');
    expect(univia).not.toHaveProperty('platformId');
  });

  it('marks paused projects past their review date', () => {
    const stacker = toProjectRows(all, now).find((r) => r.name === 'Stacker');
    expect(stacker?.stale).toMatchObject({ level: 'cold', label: 'past review date' });
  });

  it('never badges closed projects', () => {
    const shipped = toProjectRows(all, now).find((r) => r.name === 'Portfolio v3');
    expect(shipped).not.toHaveProperty('stale');
  });
});

describe('rowActions', () => {
  it('offers the one forward move each status allows, and Archive while the project is open', async () => {
    const { rowActions } = await import('../src/state/projects-model.ts');
    expect(rowActions('idea')).toEqual(['edit', 'archive']);
    expect(rowActions('ready')).toEqual(['edit', 'start', 'archive']);
    expect(rowActions('active')).toEqual(['edit', 'pause', 'ship', 'archive']);
    expect(rowActions('paused')).toEqual(['edit', 'resume', 'archive']);
    expect(rowActions('shipped')).toEqual(['edit']);
    expect(rowActions('archived')).toEqual(['edit']);
  });
});
