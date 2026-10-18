import type { ProjectsRepo } from '../data/projects.ts';
import { DEFAULT_STALE_THRESHOLDS } from '../domain/staleness.ts';
import { buildInbox, type InboxItem } from '../state/inbox-model.ts';
import { loadDialog } from '../ui/components/lazy.ts';
import type { ArchiveDetail } from '../ui/components/archive-dialog.ts';
import type { TriageDetail } from '../ui/components/inbox-list.ts';
import type { PromoteDetail } from '../ui/components/promote-dialog.ts';
import { mountInbox } from '../ui/screens/inbox.ts';
import { wireCapture } from './capture.ts';
import { announceChange, onChange } from './changes.ts';
import { saveError } from './errors.ts';

export interface InboxController {
  /** Reloads the list, e.g. after a capture from the global dialog. */
  refresh(): Promise<void>;
}

/** Mounts the Inbox into `main` and runs capture and triage against `repo`. */
export function showInbox(main: HTMLElement, repo: ProjectsRepo, now: () => Date = () => new Date()): InboxController {
  const screen = mountInbox(main);
  let items: InboxItem[] = [];
  let loaded = false;
  let generation = 0;

  const refresh = async (): Promise<void> => {
    const mine = ++generation;
    if (!loaded) screen.setLoading();
    try {
      const [ideas, thresholds] = await Promise.all([
        repo.listIdeas(),
        repo.loadStaleThresholds().catch(() => DEFAULT_STALE_THRESHOLDS),
      ]);
      const model = buildInbox(ideas, now(), thresholds);
      if (mine !== generation || !main.contains(screen.capture)) return;
      items = model.items;
      loaded = true;
      screen.setItems(model);
    } catch (error) {
      if (mine !== generation) return;
      loaded = false;
      screen.setError(error instanceof Error ? error.message : String(error), () => void refresh());
    }
  };

  wireCapture(screen.capture, repo, () => {
    announceChange({ origin: 'inbox' });
    void refresh();
  });
  const stop = onChange((change) => {
    if (!main.contains(screen.capture)) return stop();
    if (change.origin !== 'inbox') void refresh();
  });

  let lastIndex = 0;
  screen.root.addEventListener('fl-triage', (event) => {
    const { id, move } = (event as CustomEvent<TriageDetail>).detail;
    const index = items.findIndex((i) => i.id === id);
    const item = items[index];
    if (!item) return;
    lastIndex = index;
    if (move === 'promote') void loadDialog('fl-promote-dialog').then(() => screen.promote.edit(item));
    else void loadDialog('fl-archive-dialog').then(() => screen.archive.confirm(item));
  });

  const settle = async (message: string): Promise<void> => {
    screen.announce(message);
    announceChange({ origin: 'inbox' });
    await refresh();
    screen.focusAfterMove(lastIndex);
  };

  screen.promote.addEventListener('fl-promote-submit', (event) => {
    const { id, ...input } = (event as CustomEvent<PromoteDetail>).detail;
    const name = items.find((i) => i.id === id)?.name ?? 'Project';
    repo.promote(id, input).then(
      () => {
        screen.promote.close();
        void settle(`“${name}” moved to Ready.`);
      },
      (error: unknown) => screen.promote.fail(saveError(error, 'ready')),
    );
  });

  screen.archive.addEventListener('fl-archive-submit', (event) => {
    const { id, reason } = (event as CustomEvent<ArchiveDetail>).detail;
    const name = items.find((i) => i.id === id)?.name ?? 'Project';
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
