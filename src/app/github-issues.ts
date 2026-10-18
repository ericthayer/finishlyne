import type { GitHubSource } from '../data/github.ts';
import type { ProjectsRepo } from '../data/projects.ts';
import { buildIssues, needsSync } from '../state/github-model.ts';
import { mountIssues } from '../ui/screens/github-issues.ts';

export interface IssuesController {
  /** Repaints from the cache, then syncs with GitHub when a link is older than 15 minutes. */
  refresh(): Promise<void>;
}

/** Fills the side panel's Issues tab. Shows cached data first; a sync repaints when it lands. */
export function showIssues(
  panel: HTMLElement,
  github: GitHubSource,
  projects: Pick<ProjectsRepo, 'listProjects'>,
  now: () => Date = () => new Date(),
): IssuesController {
  const render = mountIssues(panel);
  let syncing = false;
  let loaded = false;
  let generation = 0;

  const paint = async (note = ''): Promise<boolean> => {
    const mine = ++generation;
    const [links, items, listings] = await Promise.all([github.links(), github.items(), projects.listProjects()]);
    if (mine !== generation) return false;
    if (!links.length) {
      const status = await github.status().catch(() => null);
      if (mine !== generation) return false;
      render({ kind: status?.kind === 'connected' ? 'no-links' : 'not-connected' });
      return false;
    }
    render({ kind: 'ready', view: buildIssues(links, items, listings, now()), syncing, note, onSync: () => void sync() });
    return needsSync(links, now());
  };

  const sync = async (): Promise<void> => {
    if (syncing) return;
    syncing = true;
    await paint().catch(() => false);
    let note = '';
    try {
      await github.sync();
    } catch (error) {
      note = `Sync failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    syncing = false;
    await paint(note).catch(() => false);
  };

  const refresh = async (): Promise<void> => {
    if (!loaded) render({ kind: 'loading' });
    try {
      const stale = await paint();
      loaded = true;
      if (stale) await sync();
    } catch (error) {
      render({ kind: 'error', message: error instanceof Error ? error.message : String(error), retry: () => void refresh() });
    }
  };

  void refresh();
  return { refresh };
}
