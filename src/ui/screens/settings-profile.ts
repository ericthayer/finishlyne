import { el } from '../components/dom.ts';
import type { ConnectionView, ProfileView, SettingsKpi } from '../../state/settings-model.ts';

// The top of Settings: who you are, how your projects stand, and what is connected.

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

export function kpiStrip(kpis: readonly SettingsKpi[]): HTMLElement {
  const section = el('section', 'fl-panel fl-panel--flush fl-kpis');
  section.setAttribute('aria-label', 'Your projects');
  const grid = el('div', 'fl-kpis__grid');
  for (const k of kpis) {
    const cell = document.createElement('fl-kpi');
    for (const [name, value] of Object.entries(k)) if (value !== undefined) cell.setAttribute(name, String(value));
    grid.append(cell);
  }
  section.append(grid);
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
  const section = el('section', 'fl-panel');
  section.setAttribute('aria-labelledby', 'h-connections');
  const h2 = el('h2', null, 'Connections');
  h2.id = 'h-connections';
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
  section.append(h2, list);
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
