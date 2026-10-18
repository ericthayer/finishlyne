import { el } from '../components/dom.ts';
import { icon } from '../components/icons.ts';
import type { DetailEntry, DetailView } from '../../state/github-page-model.ts';
import { external } from './github-repos.ts';

// The body of one opened linked repo on the GitHub page: release, last commit, PRs, issues, branches.

export type DetailState = { kind: 'loading' } | { kind: 'error'; message: string; retry: () => void } | { kind: 'ready'; view: DetailView };

function entry(e: DetailEntry, kind: 'Pull request' | 'Issue'): HTMLLIElement {
  const li = el('li');
  const title = el('p', 'fl-feed__title');
  const a = external(e.href, e.title);
  a.setAttribute('aria-label', `${kind} ${e.key}: ${e.title} (opens GitHub)`);
  title.append(a);
  const body = el('div');
  body.append(title, el('p', 'fl-feed__meta', e.meta));
  if (e.tags.length) {
    const tags = el('p', 'fl-github__tags');
    tags.append(...e.tags.map((t) => el('span', 'fl-tag', t)));
    body.append(tags);
  }
  li.append(icon(kind === 'Pull request' ? 'commit' : 'alert'), body, el('span', 'fl-feed__key', e.key));
  return li;
}

function section(title: string, count: number, content: HTMLElement | null, none: string): HTMLElement {
  const s = el('section', 'fl-section fl-github__part');
  s.append(el('h3', null, `${title} (${count})`));
  s.append(content ?? el('p', 'fl-muted', none));
  return s;
}

function ready(v: DetailView, name: string): HTMLElement[] {
  const facts = el('ul', 'fl-list fl-github__facts');
  facts.setAttribute('aria-label', `Latest on ${name}`);
  const fact = (label: string, link: { label: string; href: string } | null, none: string): HTMLLIElement => {
    const li = el('li');
    li.append(el('small', null, label));
    li.append(link ? external(link.href, link.label, 'fl-link') : el('span', 'fl-muted', none));
    return li;
  };
  facts.append(fact('Latest release', v.release, 'No releases yet'), fact('Last commit', v.commit, 'No commits yet'));

  const list = (items: DetailEntry[], kind: 'Pull request' | 'Issue', label: string): HTMLElement | null => {
    if (!items.length) return null;
    const ol = el('ol', 'fl-feed');
    ol.setAttribute('aria-label', label);
    ol.append(...items.map((e) => entry(e, kind)));
    return ol;
  };

  let branches: HTMLElement | null = null;
  if (v.branches.length) {
    branches = el('ul', 'fl-list');
    branches.setAttribute('aria-label', `Recent branches on ${name}`);
    branches.append(
      ...v.branches.map((b) => {
        const li = el('li');
        const code = el('code');
        code.append(external(b.href, b.name, 'fl-link'));
        li.append(code, el('small', null, b.meta));
        return li;
      }),
    );
  }

  // Open work on the left, release and pushes beside it when there is room.
  const work = el('div', 'fl-github__col');
  work.append(
    section('Pull requests', v.pulls.length, list(v.pulls, 'Pull request', `Open pull requests on ${name}`), 'No open pull requests.'),
    section('Issues', v.issues.length, list(v.issues, 'Issue', `Open issues on ${name}`), 'No open issues.'),
  );
  const side = el('div', 'fl-github__col');
  side.append(facts, section('Recent pushes', v.branches.length, branches, 'No recent pushes.'));
  return [work, side];
}

export function renderDetail(body: HTMLElement, name: string, state: DetailState): void {
  body.removeAttribute('aria-busy');
  if (state.kind === 'loading') {
    body.setAttribute('aria-busy', 'true');
    body.replaceChildren(el('p', 'fl-muted', `Loading ${name} from GitHub…`));
  } else if (state.kind === 'error') {
    const box = el('div', 'fl-empty');
    box.setAttribute('role', 'alert');
    const again = el('button', 'fl-btn fl-btn--secondary', 'Try again');
    again.type = 'button';
    again.addEventListener('click', state.retry);
    box.append(el('p', null, `${name} did not load. ${state.message}`), again);
    body.replaceChildren(box);
  } else {
    body.replaceChildren(...ready(state.view, name));
  }
}
