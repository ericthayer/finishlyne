import { el } from '../components/dom.ts';
import { formField, type Field } from '../components/form.ts';
import {
  DEFAULT_STALE_THRESHOLDS,
  STALE_DAYS_MAX,
  STALE_DAYS_MIN,
  type StaleThresholds,
  type StaleThresholdsInput,
} from '../../domain/staleness.ts';
import { settingsPanel } from './settings-profile.ts';

// Stale and cold day counts (SPEC §6), grouped by status.

type Key = keyof StaleThresholds;

const GROUPS: readonly { legend: string; fields: readonly { key: Key; label: string; help: string }[] }[] = [
  {
    legend: 'Active',
    fields: [
      { key: 'activeStaleDays', label: 'Stale after', help: 'days without progress' },
      { key: 'activeColdDays', label: 'Cold after', help: 'asks: pause or archive?' },
    ],
  },
  {
    legend: 'Ready',
    fields: [
      { key: 'readyStaleDays', label: 'Stale after', help: 'days since moved or reviewed' },
      { key: 'readyColdDays', label: 'Cold after', help: 'asks: start or demote?' },
    ],
  },
  { legend: 'Paused', fields: [{ key: 'pausedColdDays', label: 'Cold after', help: 'days past its review date' }] },
  { legend: 'Idea', fields: [{ key: 'ideaStaleDays', label: 'Stale after', help: 'days since captured or reviewed' }] },
];

export interface ThresholdsHandlers {
  onSave(input: StaleThresholdsInput): void;
}

export interface ThresholdsPanel {
  root: HTMLElement;
  show(t: StaleThresholds): void;
  invalid(key: Key | null, message?: string): void;
  setSaving(saving: boolean): void;
  announce(message: string): void;
}

export function thresholdsPanel(handlers: ThresholdsHandlers): ThresholdsPanel {
  const section = settingsPanel(
    'Stale and cold',
    'h-stale',
    'How long before a project shows as stale, then cold and asks for a decision. Overview, Projects, the Inbox and the side panel all use these.',
  );
  const form = el('form', 'fl-settings__thresholds');
  form.noValidate = true;
  const fields = new Map<Key, Field>();
  const grid = el('div', 'fl-settings__groups');
  for (const group of GROUPS) {
    const set = el('fieldset', 'fl-settings__group');
    set.append(el('legend', null, group.legend));
    for (const f of group.fields) {
      const field = formField({ name: f.key, label: f.label, help: `${f.help} · default ${DEFAULT_STALE_THRESHOLDS[f.key]}` });
      field.control.setAttribute('type', 'number');
      field.control.setAttribute('min', String(STALE_DAYS_MIN));
      field.control.setAttribute('max', String(STALE_DAYS_MAX));
      field.control.inputMode = 'numeric';
      field.control.required = true;
      fields.set(f.key, field);
      set.append(field.wrap);
    }
    grid.append(set);
  }
  const save = el('button', 'fl-btn fl-btn--primary', 'Save thresholds');
  save.type = 'submit';
  const status = el('p', 'fl-settings__status');
  status.setAttribute('aria-live', 'polite');
  const actions = el('div', 'fl-settings__actions');
  actions.append(save, status);
  form.append(grid, actions);
  section.append(form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = {} as Record<Key, string>;
    for (const [key, field] of fields) input[key] = field.control.value;
    handlers.onSave(input);
  });

  return {
    root: section,
    show(t) {
      for (const [key, field] of fields) field.control.value = String(t[key]);
    },
    invalid(key, message) {
      for (const [k, field] of fields) field.invalid(k === key ? (message ?? null) : null);
      if (key) {
        status.textContent = '';
        fields.get(key)?.control.focus();
      }
    },
    setSaving(saving) {
      save.disabled = saving;
    },
    announce(message) {
      status.textContent = message;
    },
  };
}
