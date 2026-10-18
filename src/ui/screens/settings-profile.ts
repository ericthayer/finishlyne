import { el } from '../components/dom.ts';
import type { ConnectionView, ProfileView } from '../../state/settings-model.ts';

// Settings building blocks: a titled panel, who you are, and what is connected.

/** A Settings card: title in the shared panel head, an optional muted intro, then content. */
export function settingsPanel(title: string, id: string, intro?: string): HTMLElement {
  const section = el('section', 'fl-panel fl-settings__panel');
  section.setAttribute('aria-labelledby', id);
  const head = el('div', 'fl-panel__head');
  const h2 = el('h2', null, title);
  h2.id = id;
  head.append(h2);
  section.append(head);
  if (intro) section.append(el('p', 'fl-muted fl-settings__intro', intro));
  return section;
}

function external(href: string, text: string, className: string): HTMLAnchorElement {
  const a = el('a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

export function profilePanel(view: ProfileView): HTMLElement {
  const section = el('section', 'fl-panel fl-profile');
  section.setAttribute('aria-labelledby', 'h-profile');
  let avatar: HTMLElement;
  if (view.avatarUrl) {
    const img = el('img', 'fl-profile__avatar');
    img.src = view.avatarUrl;
    img.alt = '';
    img.width = 64;
    img.height = 64;
    img.decoding = 'async';
    avatar = img;
  } else {
    avatar = el('span', 'fl-avatar fl-profile__avatar', view.initial);
    avatar.setAttribute('aria-hidden', 'true');
  }
  const who = el('div', 'fl-profile__who');
  const h2 = el('h2', null, view.name);
  h2.id = 'h-profile';
  who.append(h2);
  if (view.login) who.append(el('p', 'fl-profile__login', `@${view.login}`));
  who.append(el('p', 'fl-profile__facts', view.facts));
  section.append(avatar, who);
  if (view.profileUrl) section.append(external(view.profileUrl, 'GitHub profile', 'fl-btn fl-btn--secondary fl-profile__link'));
  return section;
}

export interface ConnectionsPanel {
  root: HTMLElement;
  setGitHub(view: ConnectionView): void;
}

const TONE: Readonly<Record<ConnectionView['kind'], string | null>> = {
  checking: null,
  connected: 'positive',
  'not-connected': 'warning',
  unknown: 'danger',
};

export function connectionsPanel(): ConnectionsPanel {
  const section = settingsPanel('Connections', 'h-connections');
  const list = el('ul', 'fl-connections');
  const item = el('li', 'fl-connections__item');
  const name = el('span', 'fl-connections__name', 'GitHub App');
  const state = el('span', 'fl-tag');
  const status = el('span', 'fl-connections__status');
  status.setAttribute('aria-live', 'polite');
  status.append(state);
  const manage = el('a', 'fl-link', 'Open the GitHub page');
  manage.href = '/github';
  item.append(name, status, manage);
  list.append(item);
  section.append(list);
  return {
    root: section,
    setGitHub(view) {
      state.textContent = view.kind === 'checking' ? 'Checking…' : view.text;
      const tone = TONE[view.kind];
      if (tone) state.dataset['tone'] = tone;
      else delete state.dataset['tone'];
    },
  };
}
