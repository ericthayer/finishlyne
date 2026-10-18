import { describe, expect, it } from 'vitest';
import { toProfile } from '../src/data/profile.ts';
import { buildSettings, githubConnection } from '../src/state/settings-model.ts';
import type { ProjectStatus } from '../src/domain/types.ts';
import { project } from './fixtures.ts';

const NOW = new Date('2026-10-10T12:00:00Z');
const listing = (status: ProjectStatus, lastProgressAt = '2026-10-01T12:00:00Z') => ({
  project: project({ status, lastProgressAt }),
  platform: null,
  repo: null,
});
const PROFILE = { name: 'Eric Thayer', login: 'ericthayer', avatarUrl: null, since: '2026-10-10T08:00:00Z' };

describe('buildSettings', () => {
  it('counts projects by state against the cap', () => {
    const view = buildSettings(PROFILE, [listing('active'), listing('ready'), listing('paused'), listing('shipped'), listing('archived'), listing('idea')], 3, NOW);
    expect(view.kpis.map((k) => [k.label, k.value, k.unit ?? null, k.meta])).toEqual([
      ['Active', '1', '/3', '2 open'],
      ['Shipped', '1', null, '1 archived'],
      ['Ready or paused', '2', null, '1 ready · 1 paused'],
      ['Ideas', '1', null, 'in the Inbox'],
    ]);
  });

  it('says when the cap is reached', () => {
    const view = buildSettings(PROFILE, [listing('active'), listing('active')], 2, NOW);
    expect(view.kpis[0]?.meta).toBe('cap reached');
  });

  it('describes the profile with the latest progress', () => {
    const view = buildSettings(PROFILE, [listing('active', '2026-10-08T12:00:00Z'), listing('idea', '2026-10-02T12:00:00Z')], 3, NOW);
    expect(view.profile).toEqual({
      name: 'Eric Thayer',
      login: 'ericthayer',
      initial: 'E',
      avatarUrl: null,
      profileUrl: 'https://github.com/ericthayer',
      facts: 'Using Finishlyne since Oct 10, 2026 · last progress 2 days ago',
    });
  });

  it('leaves out last progress with no projects, and the profile when signed out', () => {
    expect(buildSettings(PROFILE, [], 3, NOW).profile?.facts).toBe('Using Finishlyne since Oct 10, 2026');
    expect(buildSettings(null, [], 3, NOW).profile).toBeNull();
  });
});

describe('toProfile', () => {
  it('reads the GitHub identity Supabase stores', () => {
    const p = toProfile({
      user_metadata: { full_name: 'Eric Thayer', user_name: 'ericthayer', avatar_url: 'https://avatars.githubusercontent.com/u/2737007?v=4' },
      email: 'e@example.com',
      created_at: '2026-10-10T08:00:00Z',
    });
    expect(p).toEqual({ name: 'Eric Thayer', login: 'ericthayer', avatarUrl: 'https://avatars.githubusercontent.com/u/2737007?v=4', since: '2026-10-10T08:00:00Z' });
  });

  it('falls back to the login and drops a non-https avatar', () => {
    const p = toProfile({ user_metadata: { user_name: 'ericthayer', avatar_url: 'javascript:alert(1)' }, created_at: '2026-10-10T08:00:00Z' });
    expect(p.name).toBe('ericthayer');
    expect(p.avatarUrl).toBeNull();
  });
});

describe('githubConnection', () => {
  it('maps the function status to one line', () => {
    expect(githubConnection({ kind: 'connected', account: 'ericthayer', manageUrl: '' })).toEqual({ kind: 'connected', text: 'Connected as ericthayer' });
    expect(githubConnection({ kind: 'not-installed', installUrl: '' }).text).toBe('App not installed');
    expect(githubConnection({ kind: 'not-configured', missing: [] }).text).toBe('Not set up on the server');
  });
});
