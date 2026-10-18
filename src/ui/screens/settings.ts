import { el } from '../components/dom.ts';
import { formField, type Field } from '../components/form.ts';
import { WIP_CAP_MAX, WIP_CAP_MIN } from '../../domain/project-fields.ts';
import type { ConnectionView, SettingsView } from '../../state/settings-model.ts';
import { connectionsPanel, kpiStrip, profilePanel } from './settings-profile.ts';

export interface SettingsHandlers {
  onSave(raw: string): void;
  onRetry(): void;
}

export interface SettingsScreen {
  root: HTMLElement;
  setLoading(): void;
  setError(message: string): void;
  show(wipCap: number): void;
  /** Profile and project stats above the settings. */
  showSummary(view: SettingsView): void;
  setGitHub(view: ConnectionView): void;
  invalid(message: string | null): void;
  setSaving(saving: boolean): void;
  /** Says what just happened, visibly and to screen readers. */
  announce(message: string): void;
}

const HELP = 'Projects already Active stay Active. The cap only stops Start and Resume past it.';

export function mountSettings(main: HTMLElement, handlers: SettingsHandlers): SettingsScreen {
  const head = el('div', 'fl-pagehead');
  const h1 = el('h1', null, 'Settings');
  h1.id = 'page-title';
  head.append(h1);

  const panel = el('section', 'fl-panel');
  panel.setAttribute('aria-labelledby', 'h-wip');
  const h2 = el('h2', null, 'Work in progress');
  h2.id = 'h-wip';
  const intro = el('p', 'fl-muted', 'Finishing beats starting. Set how many projects can be Active at once.');
  const status = el('p', 'fl-settings__status');
  status.setAttribute('aria-live', 'polite');
  const body = el('div', 'fl-settings__body');
  panel.append(h2, intro, status, body);

  const summary = el('div', 'fl-settings__summary');
  const connections = connectionsPanel();
  connections.setGitHub({ kind: 'checking' });

  main.setAttribute('aria-labelledby', 'page-title');
  main.replaceChildren(head, summary, connections.root, panel);
  document.title = 'Settings · Finishlyne';

  let field: Field | null = null;
  let save: HTMLButtonElement | null = null;

  return {
    root: panel,
    setLoading() {
      field = null;
      const box = el('div', 'fl-empty');
      box.setAttribute('aria-busy', 'true');
      box.append(el('p', null, 'Loading your settings…'));
      body.replaceChildren(box);
    },
    setError(message) {
      field = null;
      const box = el('div', 'fl-empty');
      box.setAttribute('role', 'alert');
      const retry = el('button', 'fl-btn fl-btn--secondary', 'Try again');
      retry.type = 'button';
      retry.addEventListener('click', handlers.onRetry);
      box.append(el('h3', null, 'Settings did not load'), el('p', null, message), retry);
      body.replaceChildren(box);
    },
    show(wipCap) {
      const f = formField({ name: 'wip-cap', label: 'Active projects at once', help: HELP, value: String(wipCap) });
      f.control.setAttribute('type', 'number');
      f.control.setAttribute('min', String(WIP_CAP_MIN));
      f.control.setAttribute('max', String(WIP_CAP_MAX));
      f.control.inputMode = 'numeric';
      f.control.required = true;
      const form = el('form', 'fl-settings__form');
      form.noValidate = true;
      const button = el('button', 'fl-btn fl-btn--primary', 'Save');
      button.type = 'submit';
      form.append(f.wrap, button);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        handlers.onSave(f.control.value);
      });
      field = f;
      save = button;
      body.replaceChildren(form);
    },
    showSummary(view) {
      const parts: HTMLElement[] = [];
      if (view.profile) parts.push(profilePanel(view.profile));
      parts.push(kpiStrip(view.kpis));
      summary.replaceChildren(...parts);
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
  };
}

