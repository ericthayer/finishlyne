import { el } from './dom.ts';

// Wide screens show an editor as a column beside the page instead of over it. The page's
// nodes (everything in main but the page head) move into `.fl-main__content`, the editor's
// host sits beside them in `.fl-main__split`, and both move back when the editor closes.

const WIDE = '(min-width: 900px)';

interface Placed {
  host: HTMLElement;
  home: ParentNode | null;
  next: Node | null;
  stopFit: () => void;
}

let placed: Placed | null = null;

/** The page's main region when the window is wide enough for a side column, else null. */
export function sideColumnMain(): HTMLElement | null {
  if (!matchMedia(WIDE).matches) return null;
  return document.querySelector<HTMLElement>('main.fl-main');
}

/** Moves `host` into a column beside the page. Call `leaveSideColumn(host)` when it closes. */
export function enterSideColumn(main: HTMLElement, host: HTMLElement, closeOther: (other: HTMLElement) => void): void {
  if (placed && placed.host !== host) {
    const other = placed.host;
    leaveSideColumn(other);
    closeOther(other);
  }
  const home = placed ? null : { home: host.parentNode, next: host.nextSibling };

  let split = main.querySelector<HTMLElement>(':scope > .fl-main__split');
  if (!split) {
    const content = el('div', 'fl-main__content');
    content.append(...[...main.children].filter((child) => !child.matches('.fl-pagehead')));
    split = el('div', 'fl-main__split');
    split.append(content);
    main.append(split);
  }
  split.append(host);
  if (home) placed = { host, ...home, stopFit: fitToMain(main, host) };
}

/** Puts the page and `host` back where they were. A no-op when `host` is not in a side column. */
export function leaveSideColumn(host: HTMLElement): void {
  if (placed?.host !== host) return;
  const { home, next, stopFit } = placed;
  placed = null;
  stopFit();
  const split = host.closest<HTMLElement>('.fl-main__split');
  const content = split?.querySelector(':scope > .fl-main__content');
  if (split && content) split.replaceWith(...content.childNodes);
  if (home?.isConnected) home.insertBefore(host, next?.parentNode === home ? next : null);
  else host.remove();
}

/**
 * Caps the column at the room left between its top and the bottom of main's view, so Save
 * stays on screen; the form scrolls inside. Kept current as the window resizes.
 */
function fitToMain(main: HTMLElement, host: HTMLElement): () => void {
  let frame = 0;
  const measure = (): void => {
    const split = host.closest<HTMLElement>('.fl-main__split');
    if (!split) return;
    const bottom = main.getBoundingClientRect().bottom - parseFloat(getComputedStyle(main).paddingBottom);
    const top = Math.max(split.getBoundingClientRect().top, main.getBoundingClientRect().top);
    host.style.setProperty('--fl-side-height', `${Math.max(240, bottom - top)}px`);
  };
  const fit = (): void => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  };
  // Measure now, before the dialog shows, so focusing its first field never scrolls the page.
  measure();
  const observer = new ResizeObserver(fit);
  observer.observe(main);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    host.style.removeProperty('--fl-side-height');
  };
}
