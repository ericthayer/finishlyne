import type { CaptureDialog } from '../ui/components/capture-dialog.ts';
import type { CreateDetail, CreateProjectDialog } from '../ui/components/create-project-dialog.ts';
import { loadDialog } from '../ui/components/lazy.ts';
import { announceChange } from './changes.ts';
import type { Route } from './router.ts';
import { cloneTemplate, slot } from './templates.ts';

export interface Shell {
  main: HTMLElement;
  /** The side panel's content host. Filled lazily by `onDrawerOpen`. */
  drawer: HTMLElement;
  /** Quick capture, opened with `/` from any screen. */
  capture: CaptureDialog;
  setRoute(route: Route): void;
  /**
   * Lets the current screen filter in place as the header search changes, starting from
   * `initial`. Reset on every route change, after which the search submits to /projects.
   */
  claimSearch(onQuery: (query: string) => void, initial: string): void;
}

export interface ShellOptions {
  signOut(): void;
  /** Saves a new project from the header's New project form; resolves with its name. */
  createProject(detail: CreateDetail): Promise<{ name: string }>;
  /** Called the first time the side panel is open, to load its content. */
  onDrawerOpen?(drawer: HTMLElement): void;
}

const DRAWER_KEY = 'fl-drawer';
/** Below this width the side panel overlays the page instead of pushing it (matches screens.css). */
const OVERLAY_QUERY = '(max-width: 720px)';

function drawerSaved(): boolean {
  try {
    return localStorage.getItem(DRAWER_KEY) !== 'closed';
  } catch {
    return true;
  }
}

/** Mounts the app shell (rail, main, side panel, account menu) into `host`. */
export function mountShell(host: HTMLElement, user: { displayName: string }, options: ShellOptions): Shell {
  const fragment = cloneTemplate('tpl-shell');
  const body = slot(fragment, 'body');
  const main = slot(fragment, 'main');
  const panel = slot(fragment, 'drawer');
  const drawer = slot(fragment, 'drawer-content');
  const scrim = slot(fragment, 'drawer-scrim');
  const rail = fragment.querySelector<HTMLElement>('.fl-rail');
  const capture = slot<CaptureDialog>(fragment, 'capture');
  const create = slot<CreateProjectDialog>(fragment, 'create');
  const account = slot(fragment, 'account');

  const avatar = slot<HTMLButtonElement>(fragment, 'avatar');
  avatar.textContent = user.displayName.slice(0, 1).toUpperCase();
  avatar.setAttribute('aria-label', `Account: ${user.displayName}`);
  avatar.setAttribute('aria-expanded', 'false');
  slot(fragment, 'account-name').textContent = user.displayName;
  slot(fragment, 'version').textContent = `Finishlyne v${__APP_VERSION__}`;
  account.addEventListener('toggle', (event) => {
    avatar.setAttribute('aria-expanded', String((event as ToggleEvent).newState === 'open'));
  });
  // Links route in place, so close the menu ourselves once one is chosen.
  account.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a, button')) account.hidePopover();
  });
  account.querySelector('[data-action="sign-out"]')?.addEventListener('click', () => options.signOut());
  const links = [...fragment.querySelectorAll<HTMLAnchorElement>('a[data-route]')];

  const bar = cloneTemplate('tpl-pagebar');
  const search = bar.querySelector('form');
  const actions = bar.querySelector<HTMLElement>('.fl-pagebar__actions');
  const toggle = bar.querySelector<HTMLButtonElement>('[data-action="drawer"]');
  if (!search || !actions || !toggle) throw new Error('Missing page bar');
  const input = search.querySelector('input');
  let onQuery: ((query: string) => void) | null = null;
  search.addEventListener('submit', (event) => {
    if (onQuery) event.preventDefault();
  });
  input?.addEventListener('input', () => onQuery?.(input.value));

  actions.querySelector('[data-action="new-project"]')?.addEventListener('click', () => {
    void loadDialog('fl-create-project-dialog').then(() => create.open());
  });
  create.addEventListener('fl-project-create-submit', (event) => {
    options.createProject((event as CustomEvent<CreateDetail>).detail).then(
      ({ name }) => {
        create.close();
        announceChange({ origin: 'create', message: `“${name}” added as an idea.` });
      },
      (error: unknown) => create.fail(`That didn't save. ${error instanceof Error ? error.message : String(error)}`),
    );
  });

  // Wide screens: the panel pushes main over and is remembered. Phones: it overlays the page
  // like a sheet, always starts closed, and closes with its own button, Escape or a tap outside.
  const narrow = matchMedia(OVERLAY_QUERY);
  let loaded = false;
  let isOpen = false;
  const setDrawer = (open: boolean, remember: boolean): void => {
    const overlay = open && narrow.matches;
    const hadFocus = panel.contains(document.activeElement);
    isOpen = open;
    body.dataset['drawer'] = open ? 'open' : 'closed';
    panel.inert = !open;
    scrim.hidden = !overlay;
    main.inert = overlay;
    if (rail) rail.inert = overlay;
    toggle.setAttribute('aria-expanded', String(open));
    if (overlay) panel.querySelector<HTMLElement>('[data-action="drawer-close"]')?.focus();
    else if (!open && hadFocus) toggle.focus();
    if (remember && !narrow.matches) {
      try {
        localStorage.setItem(DRAWER_KEY, open ? 'open' : 'closed');
      } catch {
        // Storage blocked: the choice lasts for this page only.
      }
    }
    if (open && !loaded) {
      loaded = true;
      options.onDrawerOpen?.(drawer);
    }
  };
  toggle.addEventListener('click', () => setDrawer(!isOpen, true));
  panel.querySelector('[data-action="drawer-close"]')?.addEventListener('click', () => setDrawer(false, true));
  scrim.addEventListener('click', () => setDrawer(false, false));
  // A link in the overlay routes in place; close the sheet so the new page shows.
  drawer.addEventListener('click', (event) => {
    if (narrow.matches && event.target instanceof Element && event.target.closest('a[href]')) setDrawer(false, false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen || !narrow.matches || event.defaultPrevented) return;
    if (document.querySelector('dialog[open], :popover-open')) return;
    setDrawer(false, false);
  });
  narrow.addEventListener('change', () => setDrawer(isOpen && !narrow.matches, false));

  host.replaceChildren(fragment);
  setDrawer(drawerSaved() && !narrow.matches, false);
  placeBar(main, search, actions);

  return {
    main,
    drawer,
    capture,
    setRoute(route) {
      onQuery = null;
      if (input && route.name !== 'projects') input.value = '';
      for (const link of links) {
        const current = (link.dataset['route'] ?? '').split(' ').includes(route.name);
        if (current) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    },
    claimSearch(handler, initial) {
      onQuery = handler;
      if (input) input.value = initial;
    },
  };
}

/**
 * One header for every screen: title, then search, then the screen's own tools followed by
 * New project and the side-panel toggle. Screens render their title (and any tools) into
 * `.fl-pagehead`; screens replace `main` wholesale, so the same nodes are re-placed after
 * each render and keep what was typed.
 */
function placeBar(main: HTMLElement, search: HTMLFormElement, actions: HTMLElement): void {
  const place = (): void => {
    const head = main.querySelector(':scope > .fl-pagehead');
    const title = head?.querySelector(':scope > h1');
    if (!head || !title) return;
    if (search.parentElement !== head) title.after(search);
    let tools = head.querySelector<HTMLElement>(':scope > .fl-pagehead__tools');
    if (!tools) {
      tools = document.createElement('div');
      tools.className = 'fl-pagehead__tools';
      head.append(tools);
    }
    if (actions.parentElement !== tools || tools.lastElementChild !== actions) tools.append(actions);
  };
  new MutationObserver(place).observe(main, { childList: true });
  place();
}
