import type { Idea } from '../data/projects.ts';
import { DEFAULT_STALE_THRESHOLDS, staleness, type StaleThresholds } from '../domain/staleness.ts';
import type { StaleLevel } from '../ui/components/status.ts';
import { relativeTime } from './overview-model.ts';

// Turns ideas into Inbox rows. Pure, so it is unit-tested.

export interface InboxItem {
  id: string;
  name: string;
  summary: string | null;
  /** "Captured 3 days ago" */
  captured: string;
  /** Only when the idea is past triage age (SPEC §6); fresh ideas carry no badge. */
  stale?: { level: StaleLevel; days: number };
  /** Prefill for the Promote dialog. */
  outcome: string;
  nextAction: string;
  criteria: string[];
}

export interface InboxModel {
  items: InboxItem[];
  staleCount: number;
}

export function buildInbox(
  ideas: readonly Idea[],
  now: Date,
  thresholds: StaleThresholds = DEFAULT_STALE_THRESHOLDS,
): InboxModel {
  const items = [...ideas]
    .sort((a, b) => b.project.createdAt.localeCompare(a.project.createdAt))
    .map(({ project: p, criteria }): InboxItem => {
      const s = staleness(p, now, thresholds);
      const captured = relativeTime(p.createdAt, now);
      return {
        id: p.id,
        name: p.name,
        summary: p.summary,
        captured: /^[A-Z]/.test(captured) ? `Captured on ${captured}` : `Captured ${captured}`,
        ...(s.level === 'stale' || s.level === 'cold' ? { stale: { level: s.level, days: s.days } } : {}),
        outcome: p.outcome ?? '',
        nextAction: p.nextAction ?? '',
        criteria: [...criteria].sort((a, b) => a.position - b.position).map((c) => c.text),
      };
    });
  return { items, staleCount: items.filter((i) => i.stale).length };
}
