import { el, emit, uid } from './dom.ts';
import { enterSideColumn, leaveSideColumn, sideColumnMain } from './side-column.ts';

// Shared pieces for form dialogs. Errors replace the help text, so each field has one description.

export interface FieldOptions {
  name: string;
  label: string;
  help: string;
  multiline?: boolean;
  value?: string;
  rows?: number;
  maxLength?: number;
}

export type FieldControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface Field<C extends FieldControl = HTMLInputElement | HTMLTextAreaElement> {
  wrap: HTMLElement;
  control: C;
  /** Shows `message` in place of the help text; null restores the help text. */
  invalid(message: string | null): void;
  value(): string;
}

export function formField(o: FieldOptions): Field {
  const control = o.multiline ? el('textarea') : el('input');
  if (control instanceof HTMLInputElement) {
    control.type = 'text';
    control.autocomplete = 'off';
  } else if (o.rows) control.rows = o.rows;
  if (o.maxLength) control.maxLength = o.maxLength;
  return wrapField(control, o);
}

export interface SelectOptions extends Omit<FieldOptions, 'multiline' | 'rows' | 'maxLength'> {
  options: readonly { value: string; label: string }[];
}

/** A native <select> with the same label, help and error wiring as formField. */
export function selectField(o: SelectOptions): Field<HTMLSelectElement> {
  const control = el('select');
  for (const opt of o.options) {
    const option = el('option', null, opt.label);
    option.value = opt.value;
    control.append(option);
  }
  return wrapField(control, o);
}

function wrapField<C extends FieldControl>(control: C, o: Pick<FieldOptions, 'name' | 'label' | 'help' | 'value'>): Field<C> {
  const id = `${o.name}-${uid()}`;
  control.id = id;
  control.name = o.name;
  control.value = o.value ?? '';
  const label = el('label', null, o.label);
  label.htmlFor = id;
  const small = el('small', null, o.help);
  small.id = `${id}-help`;
  control.setAttribute('aria-describedby', small.id);
  const wrap = el('div', 'fl-field');
  wrap.append(label, control, small);
  return {
    wrap,
    control,
    invalid(message) {
      if (message) {
        wrap.dataset['invalid'] = '';
        control.setAttribute('aria-invalid', 'true');
        small.textContent = message;
      } else {
        delete wrap.dataset['invalid'];
        control.removeAttribute('aria-invalid');
        small.textContent = o.help;
      }
    },
    value: () => control.value.trim(),
  };
}

export interface DialogContent {
  /** `wide` fills most of the viewport, with the fields in columns. */
  size?: 'wide';
  /** `side` opens beside the page on wide screens, non-modal; smaller screens get the modal. */
  placement?: 'side';
  title: string;
  intro?: string;
  fields: readonly Field<FieldControl>[];
  submitLabel: string;
  danger?: boolean;
}

/**
 * Form dialog that stays open while the caller saves; modal unless `placement: 'side'` fits. Subclasses build the content and
 * validate; the base fires `eventName` with the collected detail and waits for
 * `.close()` (saved) or `.fail(message)` (server said no).
 */
export abstract class FormDialog<T> extends HTMLElement {
  #dialog: HTMLDialogElement | null = null;
  #submit: HTMLButtonElement | null = null;
  #alert: HTMLElement | null = null;

  protected abstract readonly eventName: string;
  /** Validates the fields; returns the detail to fire, or null after marking what is missing. */
  protected abstract collect(): T | null;

  get isOpen(): boolean {
    return this.#dialog?.open ?? false;
  }

  protected present(content: DialogContent): void {
    const id = uid();
    const title = el('h2', null, content.title);
    title.id = `fl-dialog-title-${id}`;
    const alert = el('p', 'fl-dialog__alert');
    alert.setAttribute('role', 'alert');
    const cancel = el('button', 'fl-btn fl-btn--secondary', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => this.close());
    const submit = el('button', `fl-btn ${content.danger ? 'fl-btn--danger' : 'fl-btn--primary'}`, content.submitLabel);
    submit.type = 'submit';
    const actions = el('div', 'fl-dialog__actions');
    actions.append(cancel, submit);

    const form = el('form');
    form.noValidate = true;
    form.append(title);
    if (content.intro) form.append(el('p', 'fl-dialog__intro', content.intro));
    form.append(...content.fields.map((f) => f.wrap), alert, actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      alert.textContent = '';
      const detail = this.collect();
      if (detail === null) {
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
        return;
      }
      submit.disabled = true;
      emit<T>(this, this.eventName, detail);
    });

    const main = content.placement === 'side' ? sideColumnMain() : null;
    const variant = main ? ' fl-dialog--side' : content.size === 'wide' ? ' fl-dialog--wide' : '';
    const dialog = el('dialog', `fl-dialog${variant}`);
    dialog.setAttribute('aria-labelledby', title.id);
    dialog.append(form);
    dialog.addEventListener('close', () => {
      if (this.#dialog === dialog) leaveSideColumn(this);
    });
    this.#dialog?.close();
    this.#dialog = dialog;
    this.#submit = submit;
    this.#alert = alert;
    this.replaceChildren(dialog);
    if (main) {
      // Non-modal: Escape is not built in, so close on it here.
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) this.close();
      });
      enterSideColumn(main, this, (other) => (other as FormDialog<unknown>).close());
      dialog.show();
    } else {
      leaveSideColumn(this);
      dialog.showModal();
    }
    content.fields[0]?.control.focus();
  }

  close(): void {
    this.#dialog?.close();
  }

  /** Shows why the save failed and lets the user try again. */
  fail(message: string): void {
    if (this.#alert) this.#alert.textContent = message;
    if (this.#submit) this.#submit.disabled = false;
  }
}
