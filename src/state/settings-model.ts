import type { GitHubStatus } from '../data/github.ts';
import type { Profile } from '../data/profile.ts';
import type { ProjectListing } from '../data/projects.ts';
import { relativeTime } from './overview-model.ts';

// Settings: who you are and what is connected. Pure, so it is unit-tested.

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

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function buildProfile(profile: Profile, listings: readonly ProjectListing[], now: Date): ProfileView {
  let latest: string | null = null;
  for (const { project } of listings) {
    if (!latest || Date.parse(project.lastProgressAt) > Date.parse(latest)) latest = project.lastProgressAt;
  }
  const facts = [`Using Finishlyne since ${day(profile.since)}`];
  if (latest) facts.push(`last progress ${relativeTime(latest, now)}`);
  return {
    name: profile.name,
    login: profile.login,
    initial: profile.name.slice(0, 1).toUpperCase(),
    avatarUrl: profile.avatarUrl,
    profileUrl: profile.login ? `https://github.com/${encodeURIComponent(profile.login)}` : null,
    facts: facts.join(' · '),
  };
}

/** One line on the GitHub App, from the `github` function's status. */
export function githubConnection(status: GitHubStatus): Exclude<ConnectionView, { kind: 'checking' }> {
  if (status.kind === 'connected') return { kind: 'connected', text: `Connected as ${status.account}` };
  if (status.kind === 'not-installed') return { kind: 'not-connected', text: 'App not installed' };
  return { kind: 'not-connected', text: 'Not set up on the server' };
}
