import { el } from '../components/dom.ts';
import type { RepoRow } from '../../state/github-model.ts';
import type { GitHubPageView, LinkedRepo } from '../../state/github-page-model.ts';
import { external, repoList, type LinkHandler } from './github-repos.ts';

// /github: connection, a KPI strip, linked repos opened for live detail, and every repo the App can see.

export type GitHubPageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not-configured'; missing: string[] }
  | { kind: 'not-installed'; installUrl: string }
  | {
      kind: 'connected';
      account: string;
      manageUrl: string;
      synced: string | null;
      view: GitHubPageView;
      rows: RepoRow[];
      choices: (row: RepoRow) => { value: string; label: string }[];
    };

export interface GitHubPageHandlers {
  onLink: LinkHandler;
  onRetry(): void;
  onSync(): void;
  /** A linked repo was opened for the first time; fill `body` with its detail. */
  onOpen(repo: LinkedRepo, body: HTMLElement): void;
}

export interface GitHubPageScreen {
  root: HTMLElement;
  render(state: GitHubPageState): void;
  announce(message: string): void;
  setSyncing(syncing: boolean): void;
  /** Repaints the KPIs and linked repos only, so focus in the repo list survives a link change. */
  update(view: GitHubPageView, synced: string | null): void;
}

function panel(title: string, id: string): { section: HTMLElement; head: HTMLElement } {
  const section = el('section', 'fl-panel');
  section.setAttribute('aria-labelledby', id);
  const head = el('div', 'fl-panel__head');
  const h2 = el('h2', null, title);
  h2.id = id;
  head.append(h2);
  section.append(head);
  return { section, head };
}

function box(role: 'alert' | null, ...children: (Node | string)[]): HTMLElement {
  const b = el('section', 'fl-panel fl-empty');
  if (role) b.setAttribute('role', role);
  b.append(...children);
  return b;
}

function kpiStrip(view: GitHubPageView): HTMLElement {
  const kpis = el('section', 'fl-panel fl-panel--flush fl-kpis');
  kpis.setAttribute('aria-label', 'At a glance');
  const grid = el('div', 'fl-kpis__grid');
  for (const k of view.kpis) {
    const cell = document.createElement('fl-kpi');
    for (const [name, value] of Object.entries(k)) if (value !== undefined) cell.setAttribute(name, String(value));
    grid.append(cell);
  }
  kpis.append(grid);
  return kpis;
}

function linkedPanel(view: GitHubPageView, onOpen: GitHubPageHandlers['onOpen']): HTMLElement {
  const linked = panel('Linked repos', 'h-linked');
  if (view.linked.length) {
    const list = el('ul', 'fl-github__linkedlist');
    list.setAttribute('aria-label', `${view.linked.length} linked repositories`);
    list.append(...view.linked.map((r) => linkedItem(r, onOpen)));
    linked.section.append(list);
  } else {
    linked.section.append(el('p', 'fl-muted', 'Pick a project for a repo below. Its pull requests, issues and pushes show up here and in the side panel.'));
  }
  return linked.section;
}

function linkedItem(repo: LinkedRepo, onOpen: GitHubPageHandlers['onOpen']): HTMLLIElement {
  const li = el('li');
  const details = el('details', 'fl-github__linked');
  details.dataset['repo'] = String(repo.repoId);
  const summary = el('summary');
  const name = el('span', 'fl-github__title', repo.fullName);
  summary.append(name, el('small', 'fl-github__sum', `${repo.project.name} · ${repo.summary}`));
  const links = el('p', 'fl-github__links');
  const project = el('a', 'fl-link', `Open ${repo.project.name}`);
  project.href = repo.project.href;
  links.append(project, external(repo.url, 'View on GitHub', 'fl-link'));
  const body = el('div', 'fl-github__detail');
  details.append(summary, links, body);
  let opened = false;
  details.addEventListener('toggle', () => {
    if (!details.open || opened) return;
    opened = true;
    onOpen(repo, body);
  });
  li.append(details);
  return li;
}

export function mountGitHubPage(main: HTMLElement, handlers: GitHubPageHandlers): GitHubPageScreen {
  const head = el('div', 'fl-pagehead');
  const h1 = el('h1', null, 'GitHub');
  h1.id = 'page-title';
  head.append(h1);

  const conn = el('section', 'fl-panel fl-github__conn');
  conn.setAttribute('aria-label', 'Connection');
  const line = el('p', 'fl-github__line');
  const status = el('p', 'fl-github__status');
  status.setAttribute('aria-live', 'polite');
  const tools = el('div', 'fl-panel__tools');
  const sync = el('button', 'fl-btn fl-btn--secondary', 'Sync now');
  sync.type = 'button';
  sync.addEventListener('click', () => {
    if (sync.getAttribute('aria-disabled') !== 'true') handlers.onSync();
  });
  const manage = external('#', 'Choose repositories on GitHub', 'fl-link');
  tools.append(manage, sync);
  const who = el('div', 'fl-github__who');
  who.append(line, status);
  const connHead = el('div', 'fl-panel__head');
  connHead.append(who, tools);
  conn.append(connHead);

  const body = el('div', 'fl-dash');
  const root = el('div', 'fl-github');
  root.append(conn, body);
  main.setAttribute('aria-labelledby', 'page-title');
  main.replaceChildren(head, root);
  document.title = 'GitHub · Finishlyne';

  let account = '';
  let kpis: HTMLElement | null = null;
  let linked: HTMLElement | null = null;
  const setLine = (synced: string | null): void => {
    line.textContent = [`Connected as ${account}`, synced].filter(Boolean).join(' · ');
  };

  return {
    root,
    update(view, synced) {
      if (!kpis || !linked) return;
      const nextKpis = kpiStrip(view);
      const nextLinked = linkedPanel(view, handlers.onOpen);
      // Repos left open stay open, and reload their detail.
      const open = new Set([...linked.querySelectorAll<HTMLDetailsElement>('details[open]')].map((d) => d.dataset['repo']));
      for (const d of nextLinked.querySelectorAll<HTMLDetailsElement>('details')) d.open = open.has(d.dataset['repo']);
      kpis.replaceWith(nextKpis);
      linked.replaceWith(nextLinked);
      kpis = nextKpis;
      linked = nextLinked;
      setLine(synced);
    },
    announce(message) {
      status.textContent = message;
    },
    setSyncing(syncing) {
      sync.setAttribute('aria-disabled', String(syncing));
    },
    render(state) {
      conn.hidden = state.kind !== 'connected';
      if (state.kind === 'loading') {
        const b = box(null, el('p', null, 'Checking GitHub…'));
        b.setAttribute('aria-busy', 'true');
        body.replaceChildren(b);
      } else if (state.kind === 'error') {
        const retry = el('button', 'fl-btn fl-btn--secondary', 'Try again');
        retry.type = 'button';
        retry.addEventListener('click', handlers.onRetry);
        body.replaceChildren(box('alert', el('h2', null, 'GitHub did not answer'), el('p', null, state.message), retry));
      } else if (state.kind === 'not-configured') {
        body.replaceChildren(
          box(
            null,
            el('h2', null, 'GitHub is not set up yet'),
            el('p', null, `The server is missing ${state.missing.join(' and ')}. Add them under Supabase → Edge Functions → Secrets, then reload.`),
          ),
        );
      } else if (state.kind === 'not-installed') {
        body.replaceChildren(
          box(
            null,
            el('h2', null, 'Install the Finishlyne App'),
            el('p', null, 'Read-only. Pick the repos Finishlyne may read; nothing is written back to GitHub. You can change the list any time.'),
            external(state.installUrl, 'Install on GitHub', 'fl-btn fl-btn--primary'),
          ),
        );
      } else {
        account = state.account;
        manage.href = state.manageUrl;
        const all = panel('All repositories', 'h-repos');
        all.section.append(repoList(state.rows, state.choices, handlers.onLink));
        kpis = kpiStrip(state.view);
        linked = linkedPanel(state.view, handlers.onOpen);
        body.replaceChildren(kpis, linked, all.section);
        setLine(state.synced);
      }
    },
  };
}
