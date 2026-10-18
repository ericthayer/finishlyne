import type { SiteSource } from '../data/site.ts';
import type { PreviewsResult } from '../domain/site.ts';
import type { Project } from '../domain/types.ts';
import { buildSitePreview } from '../state/site-preview-model.ts';
import type { ProjectCard } from '../ui/components/lanes.ts';
import type { SitePreview } from '../ui/components/site-preview.ts';
import '../ui/components/site-preview.ts';

const hasSite = (p: Project): boolean => Boolean(p.siteUrl || p.netlifySiteId || p.screenshotPath);

/**
 * Adds a site preview to each project card in `root` whose project has a site, a Netlify
 * link or a screenshot. Cards are matched by their /p/<slug> link. A failed lookup leaves
 * the cards as they were.
 */
export async function decorateCards(root: HTMLElement, projects: readonly Project[], site: SiteSource, now: Date = new Date()): Promise<void> {
  const bySlug = new Map(projects.filter(hasSite).map((p) => [`/p/${p.slug}`, p]));
  const cards = [...root.querySelectorAll<ProjectCard>('fl-project-card[href]')].flatMap((card) => {
    const project = bySlug.get(card.getAttribute('href') ?? '');
    return project ? [{ card, project }] : [];
  });
  if (!cards.length) return;

  const live = cards.filter(({ project }) => project.siteUrl || project.netlifySiteId).map(({ project }) => project.id);
  const paths = cards.flatMap(({ project }) => (project.screenshotPath ? [project.screenshotPath] : []));
  const empty: PreviewsResult = { netlify: 'not-configured', projects: {} };
  const [info, shots] = await Promise.all([
    live.length ? site.previews(live).catch(() => empty) : empty,
    site.screenshotUrls(paths).catch((): ReadonlyMap<string, string> => new Map()),
  ]);

  for (const { card, project } of cards) {
    if (!card.isConnected) continue;
    const model = buildSitePreview(project, info.projects[project.id] ?? null, project.screenshotPath ? (shots.get(project.screenshotPath) ?? null) : null, now);
    if (!model) continue;
    const node = document.createElement('fl-site-preview') as SitePreview;
    node.model = model;
    card.preview = node;
  }
}
