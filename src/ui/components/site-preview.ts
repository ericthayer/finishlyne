import '../styles/site-preview.css';
import type { SitePreviewModel } from '../../state/site-preview-model.ts';
import { define, el } from './dom.ts';

// The live site renders at desktop width and is scaled down to the frame.
const LIVE_WIDTH = 1280;

/**
 * <fl-site-preview> · `.model` = SitePreviewModel. A thumbnail of the project's site
 * (screenshot or framed live page, never interactive) and a caption with the live link,
 * the latest Netlify deploy and recent deploy previews. Renders nothing for a null model.
 */
export class SitePreview extends HTMLElement {
  #model: SitePreviewModel | null = null;
  #resize: ResizeObserver | null = null;

  set model(value: SitePreviewModel | null) {
    this.#model = value;
    if (this.isConnected) this.#render();
  }
  get model(): SitePreviewModel | null {
    return this.#model;
  }

  connectedCallback(): void {
    this.#render();
  }

  disconnectedCallback(): void {
    this.#resize?.disconnect();
    this.#resize = null;
  }

  #render(): void {
    this.#resize?.disconnect();
    this.#resize = null;
    const m = this.#model;
    if (!m) {
      this.replaceChildren();
      return;
    }
    const figure = el('figure', 'fl-site');
    if (m.frame.kind !== 'none') figure.append(this.#frame(m));
    const caption = el('figcaption', 'fl-site__meta');
    if (m.siteUrl) caption.append(external(m.siteUrl, 'Live site', `${m.name} live site`));
    if (m.deploy) {
      const deploy = external(m.deploy.href, m.deploy.label, `${m.deploy.label}, Netlify deploys for ${m.name}`, 'fl-tag');
      deploy.dataset['tone'] = m.deploy.tone;
      caption.append(deploy);
    }
    for (const p of m.previews) caption.append(external(p.href, p.label, `${p.label} of ${m.name}`));
    if (caption.childElementCount) figure.append(caption);
    this.replaceChildren(figure);
  }

  #frame(m: SitePreviewModel): HTMLElement {
    const frame = el('div', 'fl-site__frame');
    // A thumbnail only: no focus, no pointer, nothing for a screen reader to step into.
    frame.inert = true;
    if (m.frame.kind === 'image') {
      const img = el('img');
      img.src = m.frame.src;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      frame.append(img);
    } else if (m.frame.kind === 'live') {
      const iframe = el('iframe');
      iframe.src = m.frame.url;
      iframe.title = `Live preview of ${m.name}`;
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer';
      iframe.tabIndex = -1;
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      frame.dataset['live'] = '';
      frame.append(iframe);
      this.#resize = new ResizeObserver(([entry]) => {
        if (entry) frame.style.setProperty('--fl-site-scale', String(entry.contentRect.width / LIVE_WIDTH));
      });
      this.#resize.observe(frame);
    }
    return frame;
  }
}

function external(href: string, text: string, label: string, className?: string): HTMLAnchorElement {
  const a = el('a', className ?? null, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.setAttribute('aria-label', `${label} (opens in a new tab)`);
  return a;
}

define('fl-site-preview', SitePreview);
