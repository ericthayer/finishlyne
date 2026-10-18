import type { CriterionRecord, ProjectListing, ProjectsRepo } from '../data/projects.ts';
import { explainGate } from '../domain/gates.ts';
import { checkTransition, DEFAULT_WIP_CAP } from '../domain/lifecycle.ts';
import { DEFAULT_STALE_THRESHOLDS } from '../domain/staleness.ts';
import { buildCommitted, buildPanelProjects, type PanelAction } from '../state/drawer-model.ts';
import type { ArchiveDetail } from '../ui/components/archive-dialog.ts';
import type { EditDetail } from '../ui/components/edit-project-dialog.ts';
import { loadDialog } from '../ui/components/lazy.ts';
import { mountDrawer } from '../ui/screens/drawer.ts';
import { announceChange, onChange } from './changes.ts';
import { saveError } from './errors.ts';
import { saveSiteFields, siteSubjectFor, type SiteLoader } from './site-edit.ts';

export type DrawerSource = Pick<ProjectsRepo, 'listProjects' | 'listCriteria' | 'loadWipCap' | 'loadStaleThresholds' | 'update' | 'move' | 'archive'>;

export interface DrawerController {
  refresh(): Promise<void>;
}

/** Fills the side panel and keeps it current. Quick actions write through `repo`. */
export function showDrawer(
  host: HTMLElement,
  repo: DrawerSource,
  now: () => Date = () => new Date(),
  onIssues?: (panel: HTMLElement) => void,
  site: SiteLoader | null = null,
): DrawerController {
  let listings: ProjectListing[] = [];
  let wipCap = DEFAULT_WIP_CAP;
  let generation = 0;
  let loaded = false;

  const refresh = async (): Promise<void> => {
    const mine = ++generation;
    if (!loaded) screen.setLoading();
    try {
      const [next, cap, thresholds] = await Promise.all([
        repo.listProjects(),
        repo.loadWipCap().catch(() => wipCap),
        repo.loadStaleThresholds().catch(() => DEFAULT_STALE_THRESHOLDS),
      ]);
      const active = next.filter((l) => l.project.status === 'active');
      const lists = await Promise.all(active.map((l) => repo.listCriteria(l.project.id).catch((): CriterionRecord[] => [])));
      if (mine !== generation) return;
      const criteria = new Map(active.map((l, i) => [l.project.id, lists[i] ?? []]));
      listings = next;
      wipCap = cap;
      loaded = true;
      screen.show(buildCommitted(next, criteria, cap, now(), thresholds), buildPanelProjects(next, now(), thresholds));
    } catch (error) {
      if (mine === generation) screen.setError(error instanceof Error ? error.message : String(error), () => void refresh());
    }
  };

  const settle = (message: string): void => {
    screen.announce(message);
    announceChange({ origin: 'panel' });
    void refresh();
  };

  const act = (id: string, action: PanelAction): void => {
    const listing = listings.find((l) => l.project.id === id);
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
    } else if (action === 'archive') {
      void loadDialog('fl-archive-dialog').then(() => screen.archive.confirm({ id, name: project.name }));
    } else {
      // Same gate check as the Projects list, so a full lane explains itself before any write.
      const activeCount = listings.filter((l) => l.project.status === 'active').length;
      const check = checkTransition(project, 'active', { activeCount, wipCap, shipCriteria: [] });
      if (!check.ok) {
        screen.announce(check.failures.map((f) => explainGate(f, 'active')).join(' '));
        return;
      }
      repo.move(id, { to: 'active' }).then(
        () => settle(`“${project.name}” is Active.`),
        (error: unknown) => screen.announce(saveError(error, 'active')),
      );
    }
  };

  const screen = mountDrawer(host, act, onIssues);

  screen.edit.addEventListener('fl-project-edit-submit', (event) => {
    const { id, site: siteChange, ...input } = (event as CustomEvent<EditDetail>).detail;
    const before = listings.find((l) => l.project.id === id)?.project;
    repo.update(id, input).then(() => saveSiteFields(before, siteChange, site)).then(
      () => {
        screen.edit.close();
        settle(`“${input.name}” saved.`);
      },
      (error: unknown) => screen.edit.fail(saveError(error)),
    );
  });

  screen.archive.addEventListener('fl-archive-submit', (event) => {
    const { id, reason } = (event as CustomEvent<ArchiveDetail>).detail;
    const name = listings.find((l) => l.project.id === id)?.project.name ?? 'Project';
    repo.archive(id, reason).then(
      () => {
        screen.archive.close();
        settle(`“${name}” archived.`);
      },
      (error: unknown) => screen.archive.fail(saveError(error, 'archived')),
    );
  });

  onChange((change) => {
    if (change.origin !== 'panel') void refresh();
  });

  void refresh();
  return { refresh };
}
