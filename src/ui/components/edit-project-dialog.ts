import { checkProjectFields } from '../../domain/project-fields.ts';
import type { SiteChange } from '../../domain/site.ts';
import type { PlatformLink, ProjectStatus } from '../../domain/types.ts';
import { define } from './dom.ts';
import { FormDialog, type Field } from './form.ts';
import { platformFields, type PlatformFields } from './platform-fields.ts';
import { nameField, nextActionField, outcomeField, summaryField } from './project-fields.ts';
import { siteFields, type SiteFields, type SiteSubject } from './site-fields.ts';

export interface EditSubject {
  id: string;
  name: string;
  status: ProjectStatus;
  summary: string;
  outcome: string;
  nextAction: string;
  platform: PlatformLink | null;
  /** Site preview fields; left out where the caller can't save them. */
  site?: SiteSubject;
}

export interface EditDetail {
  id: string;
  name: string;
  summary: string;
  outcome: string;
  nextAction: string;
  platform: PlatformLink | null;
  /** Null when the dialog didn't offer site fields. */
  site: SiteChange | null;
}

/**
 * <fl-edit-project-dialog> · `.edit(subject)` · changes the words on a project. Status is not
 * editable here. Fires fl-project-edit-submit {id, name, summary, outcome, nextAction, platform, site}.
 */
export class EditProjectDialog extends FormDialog<EditDetail> {
  protected readonly eventName = 'fl-project-edit-submit';
  #id = '';
  #status: ProjectStatus = 'idea';
  #name: Field | null = null;
  #summary: Field | null = null;
  #outcome: Field | null = null;
  #next: Field | null = null;
  #platform: PlatformFields | null = null;
  #site: SiteFields | null = null;

  edit(subject: EditSubject): void {
    this.#id = subject.id;
    this.#status = subject.status;
    this.#name = nameField(subject.name);
    this.#summary = summaryField(subject.summary);
    this.#outcome = outcomeField(subject.outcome);
    this.#next = nextActionField(subject.nextAction);
    this.#platform = platformFields(subject.platform);
    this.#site = subject.site ? siteFields(subject.site) : null;
    this.present({
      size: 'wide',
      title: `Edit “${subject.name}”`,
      intro: this.#site
        ? 'Changes the words, the platform and the site preview. Status moves through Promote and Archive in the Inbox.'
        : 'Changes the words and the platform. Status moves through Promote and Archive in the Inbox.',
      fields: [this.#name, this.#summary, this.#outcome, this.#next, ...this.#platform.fields, ...(this.#site?.fields ?? [])],
      submitLabel: 'Save changes',
    });
  }

  protected collect(): EditDetail | null {
    const name = this.#name;
    const summary = this.#summary;
    const outcome = this.#outcome;
    const next = this.#next;
    const platform = this.#platform;
    if (!name || !summary || !outcome || !next || !platform) return null;
    const checks = checkProjectFields(this.#status, { name: name.value(), nextAction: next.value() });
    name.invalid(checks.name);
    next.invalid(checks.nextAction);
    const platformOk = platform.check();
    const siteOk = this.#site?.check() ?? true;
    if (checks.name || checks.nextAction || !platformOk || !siteOk) return null;
    return {
      id: this.#id,
      name: name.value(),
      summary: summary.value(),
      outcome: outcome.value(),
      nextAction: next.value(),
      platform: platform.value(),
      site: this.#site?.value() ?? null,
    };
  }
}

define('fl-edit-project-dialog', EditProjectDialog);
