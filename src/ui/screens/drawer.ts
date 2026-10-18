import '../components/lanes.ts';
import type { ArchiveDialog } from '../components/archive-dialog.ts';
import { el } from '../components/dom.ts';
import type { EditProjectDialog } from '../components/edit-project-dialog.ts';
import { icon } from '../components/icons.ts';
import { tabs } from '../components/tabs.ts';
import type { CommittedView, PanelAction, PanelCard } from '../../state/drawer-model.ts';

// The side panel: Committed, Projects and Issues tabs. Data and actions live in app/drawer.ts.

export type DrawerTab = 'committed' | 'projects' | 'issues';

export interface DrawerScreen {
  edit: EditProjectDialog;
  archive: ArchiveDialog;
  setLoading(): void;
  setError(message: string, retry: () => void): void;
  show(committed: CommittedView, projects: readonly PanelCard[]): void;
  /** Says what just happened, visibly and to screen readers. */
  announce(message: string): void;
}

const TAB_KEY = 'fl-drawer-tab';
const ACTION_LABEL: Readonly<Record<PanelAction, string>> = { edit: 'Edit', start: 'Start', archive: 'Archive' };

function savedTab(): DrawerTab {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved === 'committed' || saved === 'projects' || saved === 'issues') return saved;
  } catch {
    // Storage blocked: start on Committed.
  }
  return 'committed';
}

function card(c: { name: string; href: string; status: string; next: string | null; days: number; level: string; where: string }, lane?: number): HTMLElement {
  const node = document.createElement('fl-project-card');
  if (lane) node.setAttribute('lane', String(lane));
  node.setAttribute('name', c.name);
  node.setAttribute('href', c.href);
  node.setAttribute('status', c.status);
  node.setAttribute('next', c.next ?? '');
  node.setAttribute('days', String(c.days));
  node.setAttribute('level', c.level);
  node.setAttribute('platform', c.where);
  return node;
}

function empty(title: string, body: string): HTMLElement {
  const box = el('div', 'fl-empty fl-drawer__empty');
  box.append(el('h3', null, title), el('p', null, body));
  return box;
}

/** `onIssues` runs each time the Issues tab is shown; without it the tab keeps its empty state. */
export function mountDrawer(
  host: HTMLElement,
  onAction: (id: string, action: PanelAction) => void,
  onIssues?: (panel: HTMLElement) => void,
): DrawerScreen {
  let issuesPanel: HTMLElement | null = null;
  const status = el('p', 'fl-drawer__status');
  status.setAttribute('aria-live', 'polite');
  const ui = tabs<DrawerTab>(
    [
      { key: 'committed', label: 'Committed' },
      { key: 'projects', label: 'Projects' },
      { key: 'issues', label: 'Issues' },
    ],
    savedTab(),
    (key) => {
      if (key === 'issues' && issuesPanel) onIssues?.(issuesPanel);
      try {
        localStorage.setItem(TAB_KEY, key);
      } catch {
        // Storage blocked: the tab lasts for this page only.
      }
    },
  );
  const committed = ui.panels.get('committed');
  const projects = ui.panels.get('projects');
  const issues = ui.panels.get('issues');
  if (!committed || !projects || !issues) throw new Error('Missing drawer tabs');
  issues.replaceChildren(
    empty('No issues yet', 'GitHub issues assigned to you show up here once a project has a linked repo.'),
  );
  issuesPanel = issues;
  if (savedTab() === 'issues') onIssues?.(issues);

  projects.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-action]') : null;
    const id = button?.closest<HTMLElement>('[data-id]')?.dataset['id'];
    const action = button?.dataset['action'];
    if (id && (action === 'edit' || action === 'start' || action === 'archive')) onAction(id, action);
  });

  const edit = document.createElement('fl-edit-project-dialog') as EditProjectDialog;
  const archive = document.createElement('fl-archive-dialog') as ArchiveDialog;
  const wrap = el('div', 'fl-drawer__inner');
  wrap.append(ui.list, status, committed, projects, issues);
  host.replaceChildren(wrap, edit, archive);

  const busy = (panel: HTMLElement, message: string): void => {
    const box = el('div', 'fl-empty fl-drawer__empty');
    box.setAttribute('aria-busy', 'true');
    box.append(el('p', null, message));
    panel.replaceChildren(box);
  };

  return {
    edit,
    archive,
    announce(message) {
      status.textContent = message;
    },
    setLoading() {
      busy(committed, 'Loading…');
      busy(projects, 'Loading…');
    },
    setError(message, retry) {
      for (const panel of [committed, projects]) {
        const box = el('div', 'fl-empty fl-drawer__empty');
        box.setAttribute('role', 'alert');
        const again = el('button', 'fl-btn fl-btn--secondary', 'Try again');
        again.type = 'button';
        again.addEventListener('click', retry);
        box.append(el('p', null, `The side panel did not load. ${message}`), again);
        panel.replaceChildren(box);
      }
    },
    show(view, cards) {
      const lead = el('p', 'fl-drawer__lead', view.headline);
      if (!view.cards.length) {
        committed.replaceChildren(lead);
      } else {
        const list = el('ol', 'fl-drawer__list');
        list.setAttribute('aria-label', `${view.used} of ${view.cap} committed projects`);
        for (const c of view.cards) {
          const li = el('li', 'fl-commit');
          const note = el('p', 'fl-commit__nudge');
          note.dataset['level'] = c.level;
          note.append(icon(c.level === 'fresh' ? 'arrow' : 'alert'), document.createTextNode(c.nudge));
          li.append(card(c, c.lane), note);
          list.append(li);
        }
        committed.replaceChildren(lead, list);
      }

      if (!cards.length) {
        projects.replaceChildren(empty('No open projects', 'Capture an idea with New project to get started.'));
        return;
      }
      const grid = el('ul', 'fl-drawer__grid');
      grid.setAttribute('aria-label', `${cards.length} open projects`);
      for (const c of cards) {
        const li = el('li', 'fl-drawer__project');
        li.dataset['id'] = c.id;
        const row = el('div', 'fl-drawer__actions');
        for (const action of c.actions) {
          const button = el('button', 'fl-btn fl-btn--quiet fl-table__action', ACTION_LABEL[action]);
          button.type = 'button';
          button.dataset['action'] = action;
          button.setAttribute('aria-label', `${ACTION_LABEL[action]} ${c.name}`);
          row.append(button);
        }
        li.append(card(c), row);
        grid.append(li);
      }
      projects.replaceChildren(grid);
    },
  };
}
