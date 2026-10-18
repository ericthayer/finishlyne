import { el } from '../components/dom.ts';
import { icon } from '../components/icons.ts';
import type { IssueEntry, IssueGroup, IssuesView } from '../../state/github-model.ts';

// The side panel's Issues tab: open PRs and issues per project with a linked repo. Data in app/github-issues.ts.

export type IssuesState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; retry: () => void }
  | { kind: 'not-connected' }
  | { kind: 'no-links' }
  | { kind: 'ready'; view: IssuesView; syncing: boolean; note: string; onSync: () => void };

function empty(title: string, body: string, link?: { href: string; label: string }): HTMLElement {
  const box = el('div', 'fl-empty fl-drawer__empty');
  box.append(el('h3', null, title), el('p', null, body));
  if (link) {
    const a = el('a', 'fl-btn fl-btn--secondary', link.label);
    a.href = link.href;
    box.append(a);
  }
  return box;
}

const external = (a: HTMLAnchorElement): HTMLAnchorElement => {
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
};

function entry(e: IssueEntry): HTMLLIElement {
  const li = el('li');
  const title = el('p', 'fl-feed__title');
  const a = external(el('a', null, e.title));
  a.href = e.href;
  a.setAttribute('aria-label', `${e.kind === 'pr' ? 'Pull request' : 'Issue'} ${e.key}: ${e.title} (opens GitHub)`);
  title.append(a);
  const body = el('div');
  body.append(title, el('p', 'fl-feed__meta', e.meta));
  li.append(icon(e.kind === 'pr' ? 'commit' : 'alert'), body, el('span', 'fl-feed__key', e.key));
  return li;
}

function group(g: IssueGroup): HTMLElement {
  const section = el('section', 'fl-section fl-issues__group');
  const h3 = el('h3', 'fl-issues__name');
  const name = el('a', null, g.name);
  name.href = g.href;
  h3.append(name);
  const repos = el('p', 'fl-issues__repos');
  for (const r of g.repos) {
    const a = external(el('a', 'fl-link', r.fullName));
    a.href = r.href;
    repos.append(a);
  }
  section.append(h3, repos, el('p', 'fl-feed__meta', g.summary));
  const entries = [...g.prs, ...g.issues];
  if (entries.length) {
    const list = el('ol', 'fl-feed');
    list.setAttribute('aria-label', `Open work on ${g.name}`);
    list.append(...entries.map(entry));
    section.append(list);
  }
  return section;
}

/** Mounts the tab's content into `panel`; the status line and Sync button persist across renders, so focus and announcements survive. */
export function mountIssues(panel: HTMLElement): (state: IssuesState) => void {
  const head = el('div', 'fl-issues__head');
  const status = el('p', 'fl-drawer__status');
  status.setAttribute('aria-live', 'polite');
  const sync = el('button', 'fl-btn fl-btn--quiet', 'Sync now');
  sync.type = 'button';
  let onSync: (() => void) | null = null;
  sync.addEventListener('click', () => {
    if (sync.getAttribute('aria-disabled') !== 'true') onSync?.();
  });
  head.append(status, sync);
  const body = el('div', 'fl-issues');
  panel.replaceChildren(head, body);

  return (state) => {
    head.hidden = state.kind !== 'ready';
    if (state.kind === 'loading') {
      const box = el('div', 'fl-empty fl-drawer__empty');
      box.setAttribute('aria-busy', 'true');
      box.append(el('p', null, 'Loading GitHub…'));
      body.replaceChildren(box);
    } else if (state.kind === 'error') {
      const box = el('div', 'fl-empty fl-drawer__empty');
      box.setAttribute('role', 'alert');
      const again = el('button', 'fl-btn fl-btn--secondary', 'Try again');
      again.type = 'button';
      again.addEventListener('click', state.retry);
      box.append(el('p', null, `GitHub did not load. ${state.message}`), again);
      body.replaceChildren(box);
    } else if (state.kind === 'not-connected') {
      body.replaceChildren(
        empty('GitHub is not connected', 'Install the Finishlyne App on your account to see pull requests and issues here.', {
          href: '/github',
          label: 'Open GitHub',
        }),
      );
    } else if (state.kind === 'no-links') {
      body.replaceChildren(
        empty('No linked repos', 'Link a repo to a project on the GitHub page, and its open pull requests and issues show up here.', {
          href: '/github',
          label: 'Link a repo',
        }),
      );
    } else {
      onSync = state.onSync;
      status.textContent = state.syncing ? 'Syncing with GitHub…' : state.note || state.view.synced || '';
      sync.setAttribute('aria-disabled', String(state.syncing));
      body.replaceChildren(...state.view.groups.map(group));
    }
  };
}
