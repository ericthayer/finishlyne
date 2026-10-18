import { describe, expect, it } from 'vitest';
import type { NetlifySummary, ProjectSiteInfo } from '../src/domain/site.ts';
import { ago, buildSitePreview } from '../src/state/site-preview-model.ts';

const NOW = new Date('2026-10-18T12:00:00Z');
const netlify = (over: Partial<NetlifySummary> = {}): NetlifySummary => ({
  siteId: 's',
  name: 'tharness',
  url: 'https://tharness.netlify.app',
  adminUrl: 'https://app.netlify.com/projects/tharness',
  screenshotUrl: 'https://cdn.netlify/shot.png',
  latest: { state: 'ready', at: '2026-10-18T10:00:00Z', url: 'https://tharness.netlify.app', branch: 'main', error: null },
  previews: [
    { review: 9, title: null, url: 'https://deploy-preview-9--tharness.netlify.app', prUrl: null, at: '2026-10-18T09:00:00Z' },
    { review: 8, title: null, url: 'https://deploy-preview-8--tharness.netlify.app', prUrl: null, at: '2026-10-17T09:00:00Z' },
    { review: 7, title: null, url: 'https://deploy-preview-7--tharness.netlify.app', prUrl: null, at: '2026-10-16T09:00:00Z' },
  ],
  ...over,
});
const info = (embeddable: boolean | null, n: NetlifySummary | null = null): ProjectSiteInfo => ({ embeddable, netlify: n });

describe('buildSitePreview', () => {
  it('prefers the uploaded screenshot over everything else', () => {
    const m = buildSitePreview({ name: 'T', siteUrl: 'https://t.dev' }, info(true, netlify()), 'https://signed/shot', NOW);
    expect(m?.frame).toEqual({ kind: 'image', src: 'https://signed/shot', source: 'upload' });
    expect(m?.siteUrl).toBe('https://t.dev');
  });

  it('frames the live site only when it allows framing, else falls back to Netlify’s screenshot', () => {
    expect(buildSitePreview({ name: 'T', siteUrl: null }, info(true, netlify()), null, NOW)?.frame).toEqual({ kind: 'live', url: 'https://tharness.netlify.app' });
    expect(buildSitePreview({ name: 'T', siteUrl: null }, info(false, netlify()), null, NOW)?.frame).toEqual({
      kind: 'image',
      src: 'https://cdn.netlify/shot.png',
      source: 'netlify',
    });
    expect(buildSitePreview({ name: 'T', siteUrl: 'https://t.dev' }, info(false), null, NOW)?.frame).toEqual({ kind: 'none' });
  });

  it('describes the latest deploy and keeps the two newest previews', () => {
    const m = buildSitePreview({ name: 'T', siteUrl: null }, info(null, netlify()), null, NOW);
    expect(m?.deploy).toEqual({ label: 'Deployed 2h ago', tone: 'positive', href: 'https://app.netlify.com/projects/tharness/deploys' });
    expect(m?.previews.map((p) => p.label)).toEqual(['Preview #9', 'Preview #8']);
    const failed = netlify({ latest: { state: 'error', at: '2026-10-15T12:00:00Z', url: '', branch: null, error: 'Build failed' } });
    expect(buildSitePreview({ name: 'T', siteUrl: null }, info(null, failed), null, NOW)?.deploy?.tone).toBe('danger');
  });

  it('shows nothing for a project with no site at all', () => {
    expect(buildSitePreview({ name: 'T', siteUrl: null }, null, null, NOW)).toBeNull();
  });
});

describe('ago', () => {
  it('reads minutes, hours, then days', () => {
    expect(ago('2026-10-18T11:59:40Z', NOW)).toBe('just now');
    expect(ago('2026-10-18T11:15:00Z', NOW)).toBe('45m ago');
    expect(ago('2026-10-17T00:00:00Z', NOW)).toBe('36h ago');
    expect(ago('2026-10-10T12:00:00Z', NOW)).toBe('8d ago');
  });
});
