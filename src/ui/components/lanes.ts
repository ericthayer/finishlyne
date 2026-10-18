import type { ProjectStatus } from '../../domain/types.ts';
import { AttrElement, DataElement, define, el } from './dom.ts';
import { isStatus, staleBadge, statusPill, type StaleLevel } from './status.ts';

/** <fl-wip-lanes cap="3"> · `.projects` = active project names in lane order. */
export class WipLanes extends DataElement<string> {
  static readonly observedAttributes = ['cap'];

  set projects(value: readonly string[]) {
    this.setData(value);
  }
  get projects(): readonly string[] {
    return this.data;
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  protected render(): void {
    const cap = Math.max(1, Number(this.getAttribute('cap')) || 3);
    const used = Math.min(this.data.length, cap);
    const track = el('ol', 'fl-lanes__track');
    track.style.setProperty('--lanes', String(cap));
    track.setAttribute('aria-label', `${used} of ${cap} active lanes in use`);
    for (let i = 0; i < cap; i++) {
      const name = this.data[i];
      const lane = el('li', 'fl-lanes__lane');
      if (name) lane.toggleAttribute('data-filled', true);
      lane.append(el('span', 'fl-sr', `Lane ${i + 1}: ${name ?? 'open'}`));
      track.append(lane);
    }
    const count = el('span', 'fl-lanes__count', `${used}/${cap}`);
    count.setAttribute('aria-hidden', 'true');
    const wrap = el('div', 'fl-lanes');
    wrap.append(track, count);
    this.replaceChildren(wrap);
  }
}

/** <fl-project-card lane name status next days level platform repo href> · no name = open lane. */
export class ProjectCard extends AttrElement {
  static readonly observedAttributes = ['lane', 'name', 'status', 'next', 'days', 'level', 'platform', 'repo', 'href'];
  #preview: HTMLElement | null = null;

  /** A site thumbnail shown under the name; set after the card renders, kept across re-renders. */
  set preview(node: HTMLElement | null) {
    this.#preview = node;
    if (this.isConnected) this.render();
  }

  protected render(): void {
    const lane = this.attr('lane') ? `L${this.attr('lane')}` : '';
    if (!this.attr('name')) {
      const empty = el('article', 'fl-card fl-card--empty');
      empty.append(el('span', 'fl-card__lane', lane), el('p', null, 'Open lane. Start a Ready project to fill it.'));
      this.replaceChildren(empty);
      return;
    }
    const rawStatus = this.attr('status');
    const status: ProjectStatus = isStatus(rawStatus) ? rawStatus : 'active';
    const rawLevel = this.attr('level');
    const level: StaleLevel = rawLevel === 'stale' || rawLevel === 'cold' ? rawLevel : 'fresh';

    const top = el('div', 'fl-card__top');
    top.append(el('span', 'fl-card__lane', lane), statusPill(status));
    const heading = el('h3', 'fl-card__name');
    const link = el('a', null, this.attr('name'));
    link.href = this.attr('href') || '#';
    heading.append(link);
    const next = el('p', 'fl-card__next');
    next.append(el('span', null, 'Next'), document.createTextNode(this.attr('next') || 'Add a next action'));
    const meta = el('div', 'fl-card__meta');
    const where = [this.attr('platform'), this.attr('repo')].filter(Boolean).join(' · ');
    meta.append(staleBadge(level, Number(this.attr('days')) || 0), el('span', 'fl-meta', where));

    const card = el('article', 'fl-card');
    card.append(top, heading);
    if (this.#preview) card.append(this.#preview);
    card.append(next, meta);
    this.replaceChildren(card);
  }
}

define('fl-wip-lanes', WipLanes);
define('fl-project-card', ProjectCard);
