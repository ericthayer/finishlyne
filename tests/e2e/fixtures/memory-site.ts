import type { SiteSource } from '../../../src/data/site.ts';
import type { NetlifySitesResult, PreviewsResult, SiteChange } from '../../../src/domain/site.ts';

// In-memory SiteSource for fixture pages. The "live" site is a local page so the frame loads offline.

export const LIVE_URL = '/tests/e2e/fixtures/site-frame.html';
export const SHOT =
  'data:image/svg+xml,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" fill="#1e1f23"/><rect x="12" y="12" width="80" height="10" fill="#9a9fa9"/></svg>');

export interface MemorySite extends SiteSource {
  readonly saved: { id: string; change: SiteChange }[];
}

export function memorySite(previews: PreviewsResult, sites: NetlifySitesResult): MemorySite {
  const saved: { id: string; change: SiteChange }[] = [];
  return {
    saved,
    async previews() {
      return previews;
    },
    async netlifySites() {
      return sites;
    },
    async screenshotUrls(paths) {
      return new Map(paths.map((p) => [p, SHOT]));
    },
    async save(project, change) {
      saved.push({ id: project.id, change });
    },
  };
}
