// One event for "projects changed", so the screen, the side panel and the shell stay in step
// without knowing about each other. Each listener ignores changes it made itself.

export type ChangeOrigin = 'projects' | 'inbox' | 'panel' | 'create' | 'capture' | 'github' | 'settings';

export interface ProjectsChange {
  origin: ChangeOrigin;
  /** What to tell the user, when the listener is the one that should say it. */
  message?: string;
}

const EVENT = 'fl-projects-changed';

export function announceChange(change: ProjectsChange): void {
  document.dispatchEvent(new CustomEvent<ProjectsChange>(EVENT, { detail: change }));
}

/** Subscribes to changes; returns the unsubscribe. */
export function onChange(listener: (change: ProjectsChange) => void): () => void {
  const handle = (event: Event): void => listener((event as CustomEvent<ProjectsChange>).detail);
  document.addEventListener(EVENT, handle);
  return () => document.removeEventListener(EVENT, handle);
}
