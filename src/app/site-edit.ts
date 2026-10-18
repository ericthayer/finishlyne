import type { SiteSource } from '../data/site.ts';
import type { SiteChange } from '../domain/site.ts';
import type { Project } from '../domain/types.ts';
import type { SiteSubject } from '../ui/components/site-fields.ts';

// Site fields behave the same wherever Edit opens: the Projects list, the side panel, or any
// other entry point. Each one passes the same loader and saves through these helpers.

/** Loads the site client on first use. */
export type SiteLoader = () => Promise<SiteSource>;

/** The site fields for one project's edit dialog; undefined when the screen has no site client. */
export function siteSubjectFor(project: Project, site: SiteLoader | null): SiteSubject | undefined {
  if (!site) return undefined;
  return {
    siteUrl: project.siteUrl ?? '',
    netlifySiteId: project.netlifySiteId ?? '',
    hasScreenshot: project.screenshotPath !== null,
    netlifySites: site().then((client) => client.netlifySites()),
  };
}

/** Saves the site fields after the words. A no-op when the dialog didn't offer them. */
export async function saveSiteFields(project: Project | undefined, change: SiteChange | null, site: SiteLoader | null): Promise<void> {
  if (!site || !change || !project) return;
  await (await site()).save(project, change);
}
