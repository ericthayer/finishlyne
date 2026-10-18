import { platformName } from '../domain/brief.ts';
import { DEFAULT_STALE_THRESHOLDS, staleness, type StaleThresholds } from '../domain/staleness.ts';
import type { ProjectStatus } from '../domain/types.ts';
import type { CriterionRecord, ProjectListing } from '../data/projects.ts';

// Side panel (Committed and Projects tabs). Pure, so it is unit-tested.

export type StaleLevel = 'fresh' | 'stale' | 'cold';

interface CardBase {
  id: string;
  name: string;
  href: string;
  status: ProjectStatus;
  next: string | null;
  days: number;
  level: StaleLevel;
  /** Platform and repo, when known. */
  where: string;
}

export interface CommittedCard extends CardBase {
  lane: number;
  /** One line that pushes toward finishing this project. */
  nudge: string;
}

export interface CommittedView {
  cap: number;
  used: number;
  headline: string;
  cards: CommittedCard[];
}

export type PanelAction = 'edit' | 'start' | 'archive';

export interface PanelCard extends CardBase {
  actions: PanelAction[];
}

function base({ project: p, platform, repo }: ProjectListing, now: Date, t: StaleThresholds): CardBase {
  const s = staleness(p, now, t);
  return {
    id: p.id,
    name: p.name,
    href: `/p/${p.slug}`,
    status: p.status,
    next: p.nextAction,
    days: s.level === 'none' ? 0 : s.days,
    level: s.level === 'stale' || s.level === 'cold' ? s.level : 'fresh',
    where: [platform ? platformName(platform) : null, repo].filter(Boolean).join(' · '),
  };
}

export function nudge(card: CardBase, criteria: readonly CriterionRecord[]): string {
  if (!card.next) return 'Write the next action before anything else.';
  if (card.level === 'cold') return `No progress in ${card.days} days. Do the next action today, or pause it.`;
  if (card.level === 'stale') return `${card.days} days since progress. One small step keeps it moving.`;
  const left = criteria.filter((c) => c.doneAt === null).length;
  if (criteria.length && left === 0) return 'Every finish-line item is done. Ship it.';
  if (criteria.length) return `${left} of ${criteria.length} finish-line items left.`;
  return 'Do the next action, then write the one after it.';
}

function headline(used: number, cap: number): string {
  if (used === 0) return 'Nothing committed. Start one Ready project and see it through.';
  if (used >= cap) return `All ${cap} lanes committed. Finish one before you start another.`;
  return `${used} of ${cap} lanes committed. Finish these before adding more.`;
}

/** Active projects in lane order (focus rank, then longest active), each with a nudge. */
export function buildCommitted(
  listings: readonly ProjectListing[],
  criteria: ReadonlyMap<string, readonly CriterionRecord[]>,
  cap: number,
  now: Date,
  thresholds: StaleThresholds = DEFAULT_STALE_THRESHOLDS,
): CommittedView {
  const active = listings
    .filter((l) => l.project.status === 'active')
    .sort(
      (a, b) =>
        (a.project.focusRank ?? 1e9) - (b.project.focusRank ?? 1e9) ||
        a.project.statusChangedAt.localeCompare(b.project.statusChangedAt),
    );
  const cards = active.map((l, i): CommittedCard => {
    const card = base(l, now, thresholds);
    return { ...card, lane: i + 1, nudge: nudge(card, criteria.get(card.id) ?? []) };
  });
  return { cap, used: cards.length, headline: headline(cards.length, cap), cards };
}

const ORDER: Readonly<Record<ProjectStatus, number>> = { active: 0, paused: 1, ready: 2, idea: 3, shipped: 4, archived: 5 };

/** Open projects, active first, each with the quick actions its status allows. */
export function buildPanelProjects(
  listings: readonly ProjectListing[],
  now: Date,
  thresholds: StaleThresholds = DEFAULT_STALE_THRESHOLDS,
): PanelCard[] {
  return listings
    .filter((l) => ORDER[l.project.status] < ORDER.shipped)
    .sort((a, b) => ORDER[a.project.status] - ORDER[b.project.status] || a.project.name.localeCompare(b.project.name))
    .map((l): PanelCard => ({
      ...base(l, now, thresholds),
      actions: ['edit', ...(l.project.status === 'ready' ? (['start'] as const) : []), 'archive'],
    }));
}
