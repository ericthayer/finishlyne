import '../styles/site-preview.css';
import type { NetlifySitesResult, SiteChange } from '../../domain/site.ts';
import { formField, selectField, type Field, type FieldControl } from './form.ts';

// Site URL, Netlify site and screenshot for the edit dialog.

export interface SiteSubject {
  siteUrl: string;
  netlifySiteId: string;
  hasScreenshot: boolean;
  /** Sites for the picker; resolves after the dialog opens. */
  netlifySites: Promise<NetlifySitesResult>;
}

export interface SiteFields {
  readonly fields: readonly Field<FieldControl>[];
  check(): boolean;
  value(): SiteChange;
}

const NETLIFY_HELP = 'Shows the latest deploy and deploy previews. Leave the site URL blank to use this site’s URL.';
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 20 * 1024 * 1024;

export function siteFields(subject: SiteSubject): SiteFields {
  const url = formField({
    name: 'site-url',
    label: 'Site URL (optional)',
    help: 'The live site, starting with https://. Shown as the project’s thumbnail when the site allows it.',
    value: subject.siteUrl,
  });
  url.control.setAttribute('type', 'url');

  const netlify = selectField({
    name: 'netlify-site',
    label: 'Netlify site (optional)',
    help: 'Loading your Netlify sites…',
    value: subject.netlifySiteId,
    options: subject.netlifySiteId
      ? [{ value: '', label: 'None' }, { value: subject.netlifySiteId, label: 'Linked site' }]
      : [{ value: '', label: 'None' }],
  });
  netlify.control.value = subject.netlifySiteId;
  const netlifyHelp = netlify.wrap.querySelector('small');
  const setHelp = (text: string): void => {
    if (netlifyHelp) netlifyHelp.textContent = text;
  };
  subject.netlifySites.then(
    ({ netlify: status, sites }) => {
      if (status !== 'connected') {
        netlify.control.disabled = !subject.netlifySiteId;
        setHelp(status === 'not-yours' ? 'The Netlify token on the server belongs to another account.' : 'Netlify isn’t connected yet. Add a Netlify token to link a site.');
        return;
      }
      const keep = netlify.control.value;
      const options = [{ value: '', label: 'None' }, ...sites.map((s) => ({ value: s.id, label: s.name }))];
      netlify.control.replaceChildren(
        ...options.map((o) => {
          const option = document.createElement('option');
          option.value = o.value;
          option.textContent = o.label;
          return option;
        }),
      );
      netlify.control.value = keep;
      setHelp(NETLIFY_HELP);
    },
    () => setHelp('Netlify sites did not load. The current link is kept.'),
  );

  const file = formField({
    name: 'screenshot',
    label: subject.hasScreenshot ? 'Replace screenshot (optional)' : 'Screenshot (optional)',
    help: 'PNG, JPEG or WebP. Shown instead of the live site.',
  });
  file.control.setAttribute('type', 'file');
  file.control.setAttribute('accept', IMAGE_TYPES.join(','));

  const current = subject.hasScreenshot
    ? selectField({
        name: 'screenshot-current',
        label: 'Current screenshot',
        help: 'Remove it to show the live site again.',
        value: 'keep',
        options: [
          { value: 'keep', label: 'Keep' },
          { value: 'remove', label: 'Remove' },
        ],
      })
    : null;

  const picked = (): File | null => (file.control instanceof HTMLInputElement ? (file.control.files?.[0] ?? null) : null);

  return {
    fields: current ? [url, netlify, file, current] : [url, netlify, file],
    check() {
      const u = url.value();
      const urlError = u && !/^https:\/\/\S+$/i.test(u) ? 'Use a full link that starts with https://.' : null;
      url.invalid(urlError);
      const f = picked();
      const fileError = f && !IMAGE_TYPES.includes(f.type) ? 'Pick a PNG, JPEG or WebP image.' : f && f.size > MAX_BYTES ? 'Pick an image under 20 MB.' : null;
      file.invalid(fileError);
      return !urlError && !fileError;
    },
    value() {
      const f = picked();
      return {
        siteUrl: url.value(),
        netlifySiteId: netlify.control.value,
        screenshot: f ? { kind: 'replace', file: f } : current?.value() === 'remove' ? { kind: 'remove' } : { kind: 'keep' },
      };
    },
  };
}
