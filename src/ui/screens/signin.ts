import { cloneTemplate, slot } from '../../app/templates.ts';

/** Renders the sign-in screen. `onSignIn` resolves to an error message, or null when redirecting. */
export function renderSignIn(host: HTMLElement, onSignIn: () => Promise<string | null>, initialError?: string): void {
  const fragment = cloneTemplate('tpl-signin');
  const error = slot(fragment, 'error');
  if (initialError) error.textContent = initialError;
  const button = fragment.querySelector<HTMLButtonElement>('[data-action="sign-in"]');
  button?.addEventListener('click', async () => {
    button.disabled = true;
    error.textContent = '';
    const message = await onSignIn();
    if (message) {
      error.textContent = `Sign-in failed: ${message}`;
      button.disabled = false;
    }
  });
  host.replaceChildren(fragment);
  document.title = 'Sign in · Finishlyne';
  // The stage is decoration; signed-in sessions never load it.
  void import('../components/lane-field.ts');
}
