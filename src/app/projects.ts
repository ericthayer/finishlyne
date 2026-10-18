import type { ProjectListing, ProjectsRepo } from '../data/projects.ts';
import { saveSiteFields, siteSubjectFor, type SiteLoader } from './site-edit.ts';
import { explainGate } from '../domain/gates.ts';
import { checkTransition, defaultReviewOn, DEFAULT_WIP_CAP } from '../domain/lifecycle.ts';
import {
  DEFAULT_STATUSES,
  filterProjects,
  toProjectRows,
  type ProjectFilter,
} from '../state/projects-model.ts';
import { loadDialog } from '../ui/components/lazy.ts';
import type { ArchiveDetail } from '../ui/components/archive-dialog.ts';
import type { EditDetail } from '../ui/components/edit-project-dialog.ts';
import type { PauseDetail } from '../ui/components/pause-project-dialog.ts';
import type { ShipDetail } from '../ui/components/ship-project-dialog.ts';
import type { RowAction } from '../ui/components/table.ts';
import { mountProjects } from '../ui/screens/projects.ts';
import type { ProjectStatus } from '../domain/types.ts';
import { announceChange, onChange } from './changes.ts';
import { saveError } from './errors.ts';

export interface ProjectsController {
  refresh(): Promise<void>;
}

export type ProjectsSource = Pick<ProjectsRepo, 'listProjects' | 'update' | 'move' | 'archive' | 'listCriteria' | 'ship' | 'loadWipCap'>;

/** The header search, claimed by this screen so it filters in place. */
export type ClaimSearch = (onQuery: (query: string) => void, initial: string) => void;

/**
 * Mounts the Projects list into `main`. `initialQuery` comes from the header search (`?q=`).
 * With `site`, Edit also sets the project's site URL, Netlify site and screenshot.
 */
export function showProjects(
  main: HTMLElement,
  repo: ProjectsSource,
  initialQuery: string,
  claimSearch: ClaimSearch,
  now: () => Date = () => new Date(),
  site: SiteLoader | null = null,
): ProjectsController {
  let filter: ProjectFilter = { query: initialQuery, statuses: DEFAULT_STATUSES };
  let listings: ProjectListing[] = [];
  let loaded = false;
  let generation = 0;
  let wipCap = DEFAULT_WIP_CAP;

  const paint = (): void => {
    if (!loaded) return;
    const shown = filterProjects(listings, filter);
    screen.show({
      total: listings.length,
      rows: toProjectRows(shown, now()),
      filter,
      filtered: shown.length !== listings.length,
    });
  };

  const refresh = async (): Promise<void> => {
    const mine = ++generation;
    if (!loaded) screen.setLoading();
    try {
      // A failed settings read keeps the last known cap; the database still enforces the real one.
      const [next, cap] = await Promise.all([repo.listProjects(), repo.loadWipCap().catch(() => wipCap)]);
      if (mine !== generation || !main.contains(screen.root)) return;
      listings = next;
      wipCap = cap;
      loaded = true;
      paint();
    } catch (error) {
      if (mine !== generation) return;
      screen.setError(error instanceof Error ? error.message : String(error));
    }
  };

  const find = (id: string): ProjectListing | undefined => listings.find((l) => l.project.id === id);

  // Start and Resume check the gates here, so a full lane explains itself before any write.
  // The database re-checks every gate; this only saves a round trip and gives the same copy.
  const start = (id: string, name: string, listing: ProjectListing): void => {
    const activeCount = listings.filter((l) => l.project.status === 'active').length;
    const check = checkTransition(listing.project, 'active', { activeCount, wipCap, shipCriteria: [] });
    if (!check.ok) {
      screen.announce(check.failures.map((f) => explainGate(f, 'active')).join(' '));
      return;
    }
    repo.move(id, { to: 'active' }).then(
      () => void settle(`“${name}” is Active.`),
      (error: unknown) => screen.announce(saveError(error, 'active')),
    );
  };

  const screen = mountProjects(main, {
    onAction(id: string, action: RowAction) {
      const listing = find(id);
      if (!listing) return;
      const { project } = listing;
      if (action === 'edit') {
        const subject = siteSubjectFor(project, site);
        void loadDialog('fl-edit-project-dialog').then(() =>
          screen.edit.edit({
            id,
            name: project.name,
            status: project.status,
            summary: project.summary ?? '',
            outcome: project.outcome ?? '',
            nextAction: project.nextAction ?? '',
            platform: listing.platform,
            ...(subject && { site: subject }),
          }),
        );
      } else if (action === 'start' || action === 'resume') {
        start(id, project.name, listing);
      } else if (action === 'pause') {
        void loadDialog('fl-pause-project-dialog').then(() =>
          screen.pause.pause({
            id,
            name: project.name,
            nextAction: project.nextAction ?? '',
            reviewOn: defaultReviewOn(now()),
            today: defaultReviewOn(now(), 0),
          }),
        );
      } else if (action === 'ship') {
        Promise.all([repo.listCriteria(id), loadDialog('fl-ship-project-dialog')]).then(
          ([criteria]) => screen.ship.ship({ id, name: project.name, criteria }),
          (error: unknown) => screen.announce(saveError(error, 'shipped')),
        );
      } else {
        void loadDialog('fl-archive-dialog').then(() => screen.archive.confirm({ id, name: project.name }));
      }
    },
    onToggle(status: ProjectStatus) {
      const statuses = new Set(filter.statuses);
      if (statuses.has(status)) statuses.delete(status);
      else statuses.add(status);
      filter = { ...filter, statuses };
      paint();
    },
    onReset() {
      filter = { query: '', statuses: DEFAULT_STATUSES };
      claimSearch(onQuery, '');
      paint();
    },
    onRetry() {
      void refresh();
    },
  });

  const onQuery = (query: string): void => {
    filter = { ...filter, query };
    paint();
  };
  claimSearch(onQuery, initialQuery);

  // A save reloads the list and then moves focus to it, because the dialog's opener may be gone.
  const settle = async (message: string, origin: 'projects' | 'create' = 'projects'): Promise<void> => {
    screen.announce(message);
    if (origin === 'projects') announceChange({ origin });
    await refresh();
    screen.focusList();
  };

  // New project lives in the header; the side panel edits too. Both report here.
  const stop = onChange((change) => {
    if (!main.contains(screen.root)) return stop();
    if (change.origin === 'create') void settle(change.message ?? '', 'create');
    else if (change.origin !== 'projects') void refresh();
  });

  const nameOf = (id: string): string => find(id)?.project.name ?? 'Project';

  screen.edit.addEventListener('fl-project-edit-submit', (event) => {
    const { id, site: siteChange, ...input } = (event as CustomEvent<EditDetail>).detail;
    const before = find(id)?.project;
    repo.update(id, input).then(() => saveSiteFields(before, siteChange, site)).then(
      () => {
        screen.edit.close();
        void settle(`“${input.name}” saved.`);
      },
      (error: unknown) => screen.edit.fail(saveError(error)),
    );
  });

  screen.pause.addEventListener('fl-project-pause-submit', (event) => {
    const { id, checkpointSummary, nextAction, reviewOn } = (event as CustomEvent<PauseDetail>).detail;
    const name = nameOf(id);
    repo.move(id, { to: 'paused', checkpointSummary, nextAction, reviewOn }).then(
      () => {
        screen.pause.close();
        void settle(`“${name}” paused.`);
      },
      (error: unknown) => screen.pause.fail(saveError(error, 'paused')),
    );
  });

  screen.ship.addEventListener('fl-project-ship-submit', (event) => {
    const { id, ...input } = (event as CustomEvent<ShipDetail>).detail;
    const name = nameOf(id);
    repo.ship(id, input).then(
      () => {
        screen.ship.close();
        void settle(`“${name}” shipped.`);
      },
      (error: unknown) => screen.ship.fail(saveError(error, 'shipped')),
    );
  });

  screen.archive.addEventListener('fl-archive-submit', (event) => {
    const { id, reason } = (event as CustomEvent<ArchiveDetail>).detail;
    const name = nameOf(id);
    repo.archive(id, reason).then(
      () => {
        screen.archive.close();
        void settle(`“${name}” archived.`);
      },
      (error: unknown) => screen.archive.fail(saveError(error, 'archived')),
    );
  });

  void refresh();
  return { refresh };
}
