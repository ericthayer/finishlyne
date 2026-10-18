// History API router with a tiny path matcher (`/p/:slug`). No dependency.

export type RouteName = 'overview' | 'projects' | 'project' | 'inbox' | 'archive' | 'activity' | 'settings' | 'github' | 'not-found';

export interface Route {
  name: RouteName;
  params: Readonly<Record<string, string>>;
}

const TABLE: readonly [RouteName, string][] = [
  ['overview', '/'],
  ['projects', '/projects'],
  ['project', '/p/:slug'],
  ['inbox', '/inbox'],
  ['archive', '/archive'],
  ['activity', '/activity'],
  ['settings', '/settings'],
  ['github', '/github'],
];

export function match(pathname: string): Route {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  for (const [name, pattern] of TABLE) {
    const want = pattern.split('/').filter(Boolean);
    if (want.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const ok = want.every((seg, i) => {
      const got = parts[i] ?? '';
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = decodeURIComponent(got);
        return got !== '';
      }
      return seg === got;
    });
    if (ok) return { name, params };
  }
  return { name: 'not-found', params: {} };
}

/** Calls `onRoute` now and on every navigation; same-origin link clicks are handled in place. */
export function startRouter(onRoute: (route: Route) => void): (path: string) => void {
  const go = (path: string): void => {
    if (path !== location.pathname) history.pushState(null, '', path);
    onRoute(match(location.pathname));
  };
  addEventListener('popstate', () => onRoute(match(location.pathname)));
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[href]');
    if (!(link instanceof HTMLAnchorElement) || link.target || link.origin !== location.origin) return;
    event.preventDefault();
    go(link.pathname);
  });
  onRoute(match(location.pathname));
  return go;
}
