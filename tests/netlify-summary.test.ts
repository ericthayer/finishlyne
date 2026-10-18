import { describe, expect, it } from 'vitest';
import { canEmbed, deployState, summarize, type NfDeploy, type NfSite } from '../supabase/functions/netlify/summary.ts';

const ORIGIN = 'https://finishlyne.netlify.app';
const h = (init: Record<string, string>): Headers => new Headers(init);

describe('canEmbed', () => {
  it('allows pages that send no framing headers', () => {
    expect(canEmbed(200, h({}), ORIGIN)).toBe(true);
  });

  it('blocks X-Frame-Options DENY or SAMEORIGIN, and errors like a password wall', () => {
    expect(canEmbed(200, h({ 'x-frame-options': 'DENY' }), ORIGIN)).toBe(false);
    expect(canEmbed(200, h({ 'x-frame-options': 'SAMEORIGIN' }), ORIGIN)).toBe(false);
    expect(canEmbed(401, h({}), ORIGIN)).toBe(false);
  });

  it('reads CSP frame-ancestors ahead of X-Frame-Options', () => {
    const csp = (v: string): Headers => h({ 'content-security-policy': `default-src 'self'; frame-ancestors ${v}`, 'x-frame-options': 'DENY' });
    expect(canEmbed(200, csp("'self'"), ORIGIN)).toBe(false);
    expect(canEmbed(200, csp("'none'"), ORIGIN)).toBe(false);
    expect(canEmbed(200, csp('*'), ORIGIN)).toBe(true);
    expect(canEmbed(200, csp('https:'), ORIGIN)).toBe(true);
    expect(canEmbed(200, csp('https://*.netlify.app'), 'https://deploy-preview-9--finishlyne.netlify.app')).toBe(true);
    expect(canEmbed(200, csp('https://finishlyne.netlify.app'), ORIGIN)).toBe(true);
    expect(canEmbed(200, csp('https://other.dev'), ORIGIN)).toBe(false);
  });
});

describe('summarize', () => {
  const site: NfSite = {
    id: 's1',
    name: 'tharness',
    url: 'http://tharness.netlify.app',
    admin_url: 'https://app.netlify.com/projects/tharness',
    screenshot_url: 'https://d33wubrfki0l68.cloudfront.net/shot.png',
  };
  const deploy = (d: Partial<NfDeploy>): NfDeploy => ({ state: 'ready', context: 'production', created_at: '2026-10-17T10:00:00Z', ...d });

  it('takes the newest production deploy, building or not, and https links', () => {
    const s = summarize(site, [
      deploy({ state: 'building', created_at: '2026-10-18T01:00:00Z' }),
      deploy({ published_at: '2026-10-17T10:02:00Z', deploy_ssl_url: 'https://abc--tharness.netlify.app' }),
    ]);
    expect(s.url).toBe('https://tharness.netlify.app');
    expect(s.latest).toEqual({ state: 'building', at: '2026-10-18T01:00:00Z', url: 'https://tharness.netlify.app', branch: null, error: null });
    expect(s.screenshotUrl).toContain('shot.png');
  });

  it('lists the newest ready preview per pull request, newest first', () => {
    const preview = (review: number, at: string, state = 'ready'): NfDeploy =>
      deploy({ context: 'deploy-preview', review_id: review, created_at: at, state, deploy_ssl_url: `https://deploy-preview-${review}--tharness.netlify.app`, title: `PR ${review}` });
    const s = summarize(site, [preview(8, '2026-10-18T03:00:00Z', 'error'), preview(7, '2026-10-18T02:00:00Z'), preview(7, '2026-10-17T02:00:00Z'), preview(6, '2026-10-16T00:00:00Z')]);
    expect(s.previews.map((p) => [p.review, p.at])).toEqual([
      [7, '2026-10-18T02:00:00Z'],
      [6, '2026-10-16T00:00:00Z'],
    ]);
    expect(s.latest).toBeNull();
  });

  it('maps Netlify deploy states onto four', () => {
    expect(['ready', 'error', 'enqueued', 'uploading', 'canceled'].map(deployState)).toEqual(['ready', 'error', 'building', 'building', 'canceled']);
  });
});
