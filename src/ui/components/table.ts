import type { ProjectStatus } from '../../domain/types.ts';
import { DataElement, define, el, emit } from './dom.ts';
import { staleBadge, statusPill, type StaleLevel } from './status.ts';

/** What a row can do. Each button fires fl-project-action {id, action}. */
export type RowAction = 'edit' | 'start' | 'resume' | 'pause' | 'ship' | 'archive';

const ACTION_LABEL: Readonly<Record<RowAction, string>> = {
  edit: 'Edit',
  start: 'Start',
  resume: 'Resume',
  pause: 'Pause',
  ship: 'Ship',
  archive: 'Archive',
};

export interface ProjectRow {
  /** Project id. Needed for row actions. */
  id?: string;
  /** Buttons under the name, in order. Only shown when `id` is set. */
  actions?: readonly RowAction[];
  name: string;
  key?: string;
  href?: string;
  status: ProjectStatus;
  next?: string;
  platform?: string;
  /** Omit for shipped and archived projects; they show no badge. */
  stale?: { level: StaleLevel; days: number; label?: string };
  updated?: string;
}

const COLUMNS: readonly { label: string; col?: string }[] = [
  { label: 'Project' },
  { label: 'Status' },
  { label: 'Next action', col: 'next' },
  { label: 'Agent', col: 'agent' },
  { label: 'Last progress' },
  { label: 'Updated', col: 'updated' },
];

/** <fl-project-table caption> · `.rows` = ProjectRow[] */
export class ProjectTable extends DataElement<ProjectRow> {
  set rows(value: readonly ProjectRow[]) {
    this.setData(value);
  }
  get rows(): readonly ProjectRow[] {
    return this.data;
  }

  protected render(): void {
    const caption = this.getAttribute('caption') || 'Projects';
    const table = el('table', 'fl-table');
    table.append(el('caption', 'fl-sr', caption));

    const head = el('tr');
    for (const c of COLUMNS) {
      const th = el('th', null, c.label);
      th.scope = 'col';
      if (c.col) th.dataset['col'] = c.col;
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);

    const tbody = el('tbody');
    for (const r of this.data) {
      const name = el('div', 'fl-table__name');
      const link = el('a', null, r.name);
      link.href = r.href ?? '#';
      name.append(link, el('span', null, r.key ?? ''));
      if (r.id && r.actions?.length) {
        const id = r.id;
        const group = el('div', 'fl-table__actions');
        for (const action of r.actions) {
          const button = el('button', 'fl-btn fl-btn--quiet fl-table__action', ACTION_LABEL[action]);
          button.type = 'button';
          button.setAttribute('aria-label', `${ACTION_LABEL[action]} ${r.name}`);
          button.addEventListener('click', () => emit(this, 'fl-project-action', { id, action }));
          group.append(button);
        }
        name.append(group);
      }
      const nameCell = el('td');
      nameCell.append(name);

      const statusCell = el('td');
      statusCell.append(statusPill(r.status));

      const next = el('td', 'fl-table__next', r.next || '—');
      next.dataset['col'] = 'next';
      if (r.next) next.title = r.next;

      const agent = el('td', 'fl-muted', r.platform || '—');
      agent.dataset['col'] = 'agent';

      const progress = el('td');
      if (r.stale) progress.append(staleBadge(r.stale.level, r.stale.days, r.stale.label));
      else progress.textContent = '—';

      const row = el('tr');
      const updated = el('td', 'fl-muted', r.updated ?? '');
      updated.dataset['col'] = 'updated';
      row.append(nameCell, statusCell, next, agent, progress, updated);
      tbody.append(row);
    }
    table.append(thead, tbody);

    const wrap = el('div', 'fl-tablewrap');
    wrap.tabIndex = 0;
    wrap.setAttribute('aria-label', `${caption}, scrollable`);
    wrap.append(table);
    this.replaceChildren(wrap);
  }
}

define('fl-project-table', ProjectTable);
