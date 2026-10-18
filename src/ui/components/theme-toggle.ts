import { define, el, emit } from './dom.ts';
import { icon } from './icons.ts';

export type Theme = 'dark' | 'light';
const STORAGE_KEY = 'fl-theme';

/** Applies the remembered theme; dark is the default. Call before first paint. */
export function applySavedTheme(root: HTMLElement = document.documentElement): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') root.dataset['theme'] = saved;
  } catch {
    // Storage blocked: stay on the default.
  }
}

/**
 * <fl-theme-toggle [labelled]> · flips data-theme on <html> · fires fl-theme-change {theme}.
 * `labelled` renders a menu row with visible text instead of an icon button. Every toggle on the page stays in sync.
 */
export class ThemeToggle extends HTMLElement {
  #sync: (() => void) | null = null;

  connectedCallback(): void {
    const root = document.documentElement;
    const labelled = this.hasAttribute('labelled');
    const button = el('button', labelled ? null : 'fl-iconbtn');
    button.type = 'button';
    const paint = (): void => {
      const light = root.dataset['theme'] === 'light';
      const name = light ? 'Switch to dark theme' : 'Switch to light theme';
      if (labelled) {
        button.removeAttribute('aria-label');
        button.replaceChildren(icon(light ? 'moon' : 'sun'), name);
      } else {
        button.setAttribute('aria-label', name);
        button.replaceChildren(icon(light ? 'moon' : 'sun'));
      }
    };
    this.#sync = paint;
    document.addEventListener('fl-theme-change', paint);
    button.addEventListener('click', () => {
      const theme: Theme = root.dataset['theme'] === 'light' ? 'dark' : 'light';
      root.dataset['theme'] = theme;
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Storage blocked: the choice lasts for this page only.
      }
      // The document listener repaints every toggle, this one included.
      emit(this, 'fl-theme-change', { theme });
    });
    paint();
    this.replaceChildren(button);
  }

  disconnectedCallback(): void {
    if (this.#sync) document.removeEventListener('fl-theme-change', this.#sync);
    this.#sync = null;
  }
}

define('fl-theme-toggle', ThemeToggle);
