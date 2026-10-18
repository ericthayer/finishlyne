import { el } from '../components/dom.ts';
import { formField, type Field } from '../components/form.ts';
import { WIP_CAP_MAX, WIP_CAP_MIN } from '../../domain/project-fields.ts';
import type { StaleThresholds, StaleThresholdsInput } from '../../domain/staleness.ts';
import type { ConnectionView, ProfileView } from '../../state/settings-model.ts';
import { connectionsPanel, profilePanel, settingsPanel } from './settings-profile.ts';
import { thresholdsPanel, type ThresholdsPanel } from './settings-thresholds.ts';

export interface SettingsHandlers {
  onSave(raw: string): void;
  onSaveThresholds(input: StaleThresholdsInput): void;
  onRetry(): void;
}

export interface SettingsScreen {
  root: HTMLElement;
  setLoading(): void;
  setError(message: string): void;
  show(wipCap: number, thresholds: StaleThresholds): void;
  showProfile(view: ProfileView | null): void;
  setGitHub(view: ConnectionView): void;
  invalid(message: string | null): void;
  setSaving(saving: boolean): void;
  /** Says what just happened, visibly and to screen readers. */
  announce(message: string): void;
  thresholds: Omit<ThresholdsPanel, 'root' | 'show'>;
}

const HELP = 'Projects already Active stay Active. The cap only stops Start and Resume past it.';

export function mountSettings(main: HTMLElement, handlers: SettingsHandlers): SettingsScreen {
  const head = el('div', 'fl-pagehead');
  const h1 = el('h1', null, 'Settings');
  h1.id = 'page-title';
  head.append(h1);

  const panel = settingsPanel('Work in progress', 'h-wip', 'Finishing beats starting. Set how many projects can be Active at once.');
  const body = el('div', 'fl-settings__body');
  // Sits beside Save once the form shows; only a save writes to it.
  const status = el('p', 'fl-settings__status');
  status.setAttribute('aria-live', 'polite');
  panel.append(body);

  const profile = el('div', 'fl-settings__summary');
  const stale = thresholdsPanel({ onSave: handlers.onSaveThresholds });
  stale.root.hidden = true;
  const connections = connectionsPanel();
  connections.setGitHub({ kind: 'checking' });

  main.setAttribute('aria-labelledby', 'page-title');
  main.replaceChildren(head, profile, panel, stale.root, connections.root);
  document.title = 'Settings · Finishlyne';

  let field: Field | null = null;
  let save: HTMLButtonElement | null = null;

  return {
    root: panel,
    setLoading() {
      field = null;
      stale.root.hidden = true;
      const box = el('div', 'fl-empty');
      box.setAttribute('aria-busy', 'true');
      box.append(el('p', null, 'Loading your settings…'));
      body.replaceChildren(box);
    },
    setError(message) {
      field = null;
      stale.root.hidden = true;
      const box = el('div', 'fl-empty');
      box.setAttribute('role', 'alert');
      const retry = el('button', 'fl-btn fl-btn--secondary', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', handlers.onRetry);
      box.append(el('h3', null, 'Settings did not load'), el('p', null, message), retry);
      body.replaceChildren(box);
    },
    show(wipCap, thresholds) {
      const f = formField({ name: 'wip-cap', label: 'Active projects at once', help: HELP, value: String(wipCap) });
      f.control.setAttribute('type', 'number');
      f.control.setAttribute('min', String(WIP_CAP_MIN));
      f.control.setAttribute('max', String(WIP_CAP_MAX));
      f.control.inputMode = 'numeric';
      f.control.required = true;
      const form = el('form', 'fl-settings__form');
      form.noValidate = true;
      const button = el('button', 'fl-btn fl-btn--primary', 'Save cap');
      button.type = 'submit';
      const actions = el('div', 'fl-settings__actions');
      actions.append(button, status);
      form.append(f.wrap, actions);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        handlers.onSave(f.control.value);
      });
      field = f;
      save = button;
      body.replaceChildren(form);
      stale.show(thresholds);
      stale.root.hidden = false;
    },
    showProfile(view) {
      profile.replaceChildren(...(view ? [profilePanel(view)] : []));
    },
    setGitHub: connections.setGitHub,
    invalid(message) {
      field?.invalid(message ?? null);
      if (message) {
        status.textContent = '';
        field?.control.focus();
      }
    },
    setSaving(saving) {
      if (save) save.disabled = saving;
    },
    announce(message) {
      status.textContent = message;
    },
    thresholds: { invalid: stale.invalid, setSaving: stale.setSaving, announce: stale.announce },
  };
}
