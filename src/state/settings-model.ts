import type { GitHubStatus } from '../data/github.ts';
import type { Profile } from '../data/profile.ts';
import type { ProjectListing } from '../data/projects.ts';
import type { ProjectStatus } from '../domain/types.ts';
import { relativeTime, type KpiModel } from './overview-model.ts';

// Settings: who you are, how your projects stand, what is connected. Pure, so it is unit-tested.

export interface SettingsKpi extends Omit<KpiModel, 'icon'> {
  icon: 'lanes' | 'shipped' | 'bookmark' | 'inbox';
}

export interface ProfileView {
  name: string;
  login: string | null;
  initial: string;
  avatarUrl: string | null;
  profileUrl: string | null;
  /** e.g. "Using Finishlyne since Oct 10, 2026 · last progress 2 days ago" */
  facts: string;
}

export type ConnectionView =
  | { kind: 'checking' }
  | { kind: 'connected'; text: string }
  | { kind: 'not-connected'; text: string }
  | { kind: 'unknown'; text: string };

export interface SettingsView {
  profile: ProfileView | null;
  kpis: SettingsKpi[];
}

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function buildSettings(
  profile: Profile | null,
  listings: readonly ProjectListing[],
  cap: number,
  now: Date,
): SettingsView {
  const count = (s: ProjectStatus): number => listings.filter((l) => l.project.status === s).length;
  const [active, ready, paused, ideas, shipped, archived] = (
    ['active', 'ready', 'paused', 'idea', 'shipped', 'archived'] as const
  ).map(count) as [number, number, number, number, number, number];

  let latest: string | null = null;
  for (const { project } of listings) {
    if (!latest || Date.parse(project.lastProgressAt) > Date.parse(latest)) latest = project.lastProgressAt;
  }

  const kpis: SettingsKpi[] = [
    { label: 'Active', icon: 'lanes', value: String(active), unit: `/${cap}`, meta: active >= cap ? 'cap reached' : `${cap - active} open` },
    { label: 'Shipped', icon: 'shipped', value: String(shipped), meta: `${archived} archived` },
    { label: 'Ready or paused', icon: 'bookmark', value: String(ready + paused), meta: `${ready} ready · ${paused} paused` },
    { label: 'Ideas', icon: 'inbox', value: String(ideas), meta: 'in the Inbox' },
  ];

  if (!profile) return { profile: null, kpis };
  const facts = [`Using Finishlyne since ${day(profile.since)}`];
  if (latest) facts.push(`last progress ${relativeTime(latest, now)}`);
  return {
    profile: {
      name: profile.name,
      login: profile.login,
      initial: profile.name.slice(0, 1).toUpperCase(),
      avatarUrl: profile.avatarUrl,
      profileUrl: profile.login ? `https://github.com/${encodeURIComponent(profile.login)}` : null,
      facts: facts.join(' · '),
    },
    kpis,
  };
}

/** One line on the GitHub App, from the `github` function's status. */
export function githubConnection(status: GitHubStatus): Exclude<ConnectionView, { kind: 'checking' }> {
  if (status.kind === 'connected') return { kind: 'connected', text: `Connected as ${status.account}` };
  if (status.kind === 'not-installed') return { kind: 'not-connected', text: 'App not installed' };
  return { kind: 'not-connected', text: 'Not set up on the server' };
}
