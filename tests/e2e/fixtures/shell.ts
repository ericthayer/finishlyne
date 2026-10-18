import { showDrawer, type DrawerSource } from '../../../src/app/drawer.ts';
import type { RouteName } from '../../../src/app/router.ts';
import { mountShell, type Shell } from '../../../src/app/shell.ts';
import { showIssues } from '../../../src/app/github-issues.ts';
import type { SiteLoader } from '../../../src/app/site-edit.ts';
import type { GitHubSource } from '../../../src/data/github.ts';
import type { CaptureInput, ProjectListing } from '../../../src/data/projects.ts';
import type { CreateDetail } from '../../../src/ui/components/create-project-dialog.ts';
import { applySavedTheme } from '../../../src/ui/components/theme-toggle.ts';

// Shared fixture shell. The side panel starts closed unless the page URL has `?drawer`,
// so screen tests are not doubled by the panel's own buttons.

const params = new URLSearchParams(location.search);
// index.html applies a remembered light theme before first paint; fixture pages do it here so light-theme tests run in light.
applySavedTheme();
export const FIXTURE_NOW = new Date('2026-10-10T12:00:00Z');

export interface FixtureShellOptions {
  drawer?: DrawerSource;
  capture?: (input: CaptureInput) => Promise<{ name: string }>;
  /** Fills the Issues tab; without it the tab keeps its empty state. */
  github?: GitHubSource;
  /** Gives the side panel's Edit the site fields. */
  site?: SiteLoader;
}

export function fixtureShell(host: HTMLElement, route: RouteName, options: FixtureShellOptions = {}): Shell {
  try {
    localStorage.setItem('fl-drawer', params.has('drawer') ? 'open' : 'closed');
  } catch {
    // Storage blocked: the shell's default applies.
  }
  const { drawer, capture, github, site } = options;
  let issues: { refresh(): Promise<void> } | null = null;
  const onIssues = github && drawer
    ? (panel: HTMLElement): void => {
        if (issues) void issues.refresh();
        else issues = showIssues(panel, github, drawer, () => FIXTURE_NOW);
      }
    : undefined;
  const shell = mountShell(host, { displayName: 'Eric' }, {
    signOut() {},
    createProject: (detail: CreateDetail) => (capture ? capture(detail) : Promise.resolve({ name: detail.name })),
    ...(drawer ? { onDrawerOpen: (panel: HTMLElement) => void showDrawer(panel, drawer, () => FIXTURE_NOW, onIssues, site ?? null) } : {}),
  });
  shell.setRoute({ name: route, params: {} });
  return shell;
}

/** An in-memory side-panel source over `listings`; writes change the listings in place. */
export function drawerSource(listings: ProjectListing[]): DrawerSource {
  const at = (id: string): number => listings.findIndex((l) => l.project.id === id);
  return {
    async listProjects() {
      return listings;
    },
    async listCriteria() {
      return [];
    },
    async loadWipCap() {
      return 3;
    },
    async update(id, input) {
      const l = listings[at(id)];
      if (l) listings[at(id)] = { ...l, platform: input.platform, project: { ...l.project, name: input.name, nextAction: input.nextAction || null } };
    },
    async move(id, input) {
      const l = listings[at(id)];
      if (l) listings[at(id)] = { ...l, project: { ...l.project, status: input.to } };
    },
    async archive(id) {
      const l = listings[at(id)];
      if (l) listings[at(id)] = { ...l, project: { ...l.project, status: 'archived' } };
    },
  };
}
