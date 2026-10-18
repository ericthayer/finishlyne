import { el, uid } from '../components/dom.ts';
import type { RepoRow } from '../../state/github-model.ts';

// Settings → GitHub: connection state, and the repos the App can see with the project each is linked to.

export type GitHubSettingsState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not-configured'; missing: string[] }
  | { kind: 'not-installed'; installUrl: string }
  | {
      kind: 'connected';
      account: string;
      manageUrl: string;
      rows: RepoRow[];
      choices: (row: RepoRow) => { value: string; label: string }[];
    };

export interface GitHubSettingsHandlers {
  /** `projectId` '' unlinks. Resolves false when the save failed, so the picker goes back. */
  onLink(row: RepoRow, projectId: string): Promise<boolean>;
  onRetry(): void;
}

export interface GitHubSettingsScreen {
  root: HTMLElement;
  render(state: GitHubSettingsState): void;
  announce(message: string): void;
}

const external = (href: string, text: string, className: string | null = null): HTMLAnchorElement => {
  const a = el('a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
};

function repoItem(row: RepoRow, choices: { value: string; label: string }[], onLink: GitHubSettingsHandlers['onLink']): HTMLLIElement {
  const li = el('li', 'fl-github__repo');
  const about = el('div', 'fl-github__about');
  const name = el('p', 'fl-github__name');
  name.append(external(row.url, row.fullName, 'fl-link'));
  if (row.private) name.append(el('span', 'fl-tag', 'Private'));
  about.append(name, el('small', null, row.pushed));

  const field = el('div', 'fl-field fl-github__pick');
  const id = `repo-${row.id}-${uid()}`;
  const label = el('label', null, 'Project');
  label.htmlFor = id;
  const select = el('select');
  select.id = id;
  select.setAttribute('aria-label', `Project for ${row.fullName}`);
  for (const c of [{ value: '', label: 'Not linked' }, ...choices]) {
    const option = el('option', null, c.label);
    option.value = c.value;
    select.append(option);
  }
  select.value = row.projectId;
  // The list is not re-rendered after a save, so focus stays on this picker.
  let saved = row.projectId;
  select.addEventListener('change', () => {
    const next = select.value;
    select.setAttribute('aria-busy', 'true');
    void onLink({ ...row, projectId: saved }, next).then((ok) => {
      select.removeAttribute('aria-busy');
      if (ok) saved = next;
      else select.value = saved;
    });
  });
  field.append(label, select);
  li.append(about, field);
  return li;
}

export function mountGitHubSettings(handlers: GitHubSettingsHandlers): GitHubSettingsScreen {
  const panel = el('section', 'fl-panel');
  panel.setAttribute('aria-labelledby', 'h-github');
  const h2 = el('h2', null, 'GitHub');
  h2.id = 'h-github';
  const intro = el('p', 'fl-muted', 'Read-only. Linked repos bring their open pull requests, issues and pushes into Finishlyne. Nothing is written back to GitHub.');
  const status = el('p', 'fl-github__status');
  status.setAttribute('aria-live', 'polite');
  const body = el('div', 'fl-settings__body');
  panel.append(h2, intro, status, body);

  const box = (role: 'alert' | null, ...children: (Node | string)[]): HTMLElement => {
    const b = el('div', 'fl-empty');
    if (role) b.setAttribute('role', role);
    b.append(...children);
    return b;
  };

  return {
    root: panel,
    announce(message) {
      status.textContent = message;
    },
    render(state) {
      if (state.kind === 'loading') {
        const b = box(null, el('p', null, 'Checking GitHub…'));
        b.setAttribute('aria-busy', 'true');
        body.replaceChildren(b);
      } else if (state.kind === 'error') {
        const retry = el('button', 'fl-btn fl-btn--secondary', 'Try again');
        retry.type = 'button';
        retry.addEventListener('click', handlers.onRetry);
        body.replaceChildren(box('alert', el('h3', null, 'GitHub did not answer'), el('p', null, state.message), retry));
      } else if (state.kind === 'not-configured') {
        body.replaceChildren(
          box(
            null,
            el('h3', null, 'GitHub is not set up yet'),
            el('p', null, `The server is missing ${state.missing.join(' and ')}. Add them under Supabase → Edge Functions → Secrets, then reload.`),
          ),
        );
      } else if (state.kind === 'not-installed') {
        body.replaceChildren(
          box(
            null,
            el('h3', null, 'Install the Finishlyne App'),
            el('p', null, 'Pick the repos Finishlyne may read. You can change the list any time on GitHub.'),
            external(state.installUrl, 'Install on GitHub', 'fl-btn fl-btn--primary'),
          ),
        );
      } else {
        const head = el('div', 'fl-github__head');
        head.append(el('p', null, `Connected as ${state.account}.`), external(state.manageUrl, 'Choose repositories on GitHub', 'fl-link'));
        if (!state.rows.length) {
          body.replaceChildren(head, box(null, el('p', null, 'The App cannot see any repos yet. Choose some on GitHub, then reload.')));
          return;
        }
        const list = el('ul', 'fl-list fl-github__repos');
        list.setAttribute('aria-label', `${state.rows.length} repositories`);
        list.append(...state.rows.map((row) => repoItem(row, state.choices(row), handlers.onLink)));
        body.replaceChildren(head, list);
      }
    },
  };
}
