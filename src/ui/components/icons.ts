import { AttrElement, define, svgEl } from './dom.ts';

// 24×24 stroke icons, 1.5px, round caps. Drawn for Finishline; no icon font.
const CIRCLE = 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z';

export const ICONS = {
  overview: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',
  projects: 'M3 7.5l9-4.5 9 4.5-9 4.5z M3 12l9 4.5 9-4.5 M3 16.5l9 4.5 9-4.5',
  inbox: 'M3 13h5l1.5 3h5l1.5-3h5 M5.5 5h13L21 13v6H3v-6z',
  resume: `${CIRCLE} M10 8.5v7l5.5-3.5z`,
  shipped: 'M5 21V4 M5 4h12l-2.5 4L17 12H5',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  settings: 'M4 7h9 M17 7h3 M15 5v4 M4 17h3 M11 17h9 M9 15v4',
  sun: 'M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  search: 'M11 4a7 7 0 1 1 0 14a7 7 0 1 1 0-14z M20 20l-4-4',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z M10 20.5a2 2 0 0 0 4 0',
  help: `${CIRCLE} M9.6 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2.9-1.2 1.8 M12 17h.01`,
  plus: 'M12 5v14 M5 12h14',
  close: 'M6 6l12 12 M18 6L6 18',
  export: 'M12 15V4 M8 8l4-4 4 4 M5 14v6h14v-6',
  share: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  filter: 'M4 6h16 M7 12h10 M10 18h4',
  lanes: 'M4 5v14 M9.3 5v14 M14.7 5v14 M20 5v14',
  alert: 'M12 4l9 16H3z M12 10v4 M12 17h.01',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  bookmark: 'M6.5 3.5h11v17l-5.5-4-5.5 4z',
  commit: 'M12 9a3 3 0 1 1 0 6a3 3 0 1 1 0-6z M3 12h6 M15 12h6',
  checkCircle: `${CIRCLE} M8 12.5l2.8 2.8L16 9.5`,
  pauseCircle: `${CIRCLE} M10 9v6 M14 9v6`,
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  logout: 'M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10',
  panelRight: 'M4 4h16v16H4z M14.5 4v16 M17 8.5h.01 M17 12h.01',
  github:
    'M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21',
} as const;

export type IconName = keyof typeof ICONS;

export function isIconName(name: string): name is IconName {
  return Object.hasOwn(ICONS, name);
}

/** <fl-icon name="search"> · decorative; name the control that holds it. */
export class Icon extends AttrElement {
  static readonly observedAttributes = ['name'];

  protected render(): void {
    const name = this.attr('name');
    const svg = svgEl('svg', {
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': name === 'more' ? 2.5 : 1.5,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    svg.append(svgEl('path', { d: isIconName(name) ? ICONS[name] : '' }));
    this.replaceChildren(svg);
  }
}

export function icon(name: IconName): HTMLElement {
  const node = document.createElement('fl-icon');
  node.setAttribute('name', name);
  return node;
}

define('fl-icon', Icon);
