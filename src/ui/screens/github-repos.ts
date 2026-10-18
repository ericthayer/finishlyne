import { el, uid } from '../components/dom.ts';
import type { RepoRow } from '../../state/github-model.ts';

// GitHub page → All repositories: every repo the App can see, each with a picker for its project.

export type LinkHandler = (row: RepoRow, projectId: string) => Promise<boolean>;

export const external = (href: string, text: string, className: string | null = null): HTMLAnchorElement => {
  const a = el('a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
};

function repoItem(row: RepoRow, choices: { value: string; label: string }[], onLink: LinkHandler): HTMLLIElement {
  const li = el('li', 'fl-github__repo');
  const about = el('div', 'fl-github__about');
  const name = el('p', 'fl-github__name');
  name.append(external(row.url, row.fullName, 'fl-link'));
  if (row.private) name.append(el('span', 'fl-tag', 'Private'));
  if (row.archived) name.append(el('span', 'fl-tag', 'Archived'));
  about.append(name);
  if (row.description) about.append(el('p', 'fl-github__desc', row.description));
  about.append(el('small', null, row.facts));

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

export function repoList(rows: readonly RepoRow[], choices: (row: RepoRow) => { value: string; label: string }[], onLink: LinkHandler): HTMLElement {
  if (!rows.length) {
    const box = el('div', 'fl-empty');
    box.append(el('p', null, 'The App cannot see any repos yet. Choose some on GitHub, then reload.'));
    return box;
  }
  const list = el('ul', 'fl-list fl-github__repos');
  list.setAttribute('aria-label', `${rows.length} repositories`);
  list.append(...rows.map((row) => repoItem(row, choices(row), onLink)));
  return list;
}
