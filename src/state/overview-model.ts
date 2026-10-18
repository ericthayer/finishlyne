import { PLATFORM_LABELS } from '../domain/brief.ts';
import { DEFAULT_WIP_CAP } from '../domain/lifecycle.ts';
import { DEFAULT_STALE_THRESHOLDS, staleness, type StaleThresholds } from '../domain/staleness.ts';
import type { Project, ProjectEventPayload } from '../domain/types.ts';
import type { StageCount } from '../ui/components/charts.ts';
import type { FeedItem } from '../ui/components/feed.ts';
import type { ProjectRow } from '../ui/components/table.ts';
import type { Tone } from '../ui/components/kpi.ts';
import type { StaleLevel } from '../ui/components/status.ts';
import type { OverviewData } from '../data/overview.ts';

// Turns raw Overview data into what each panel renders. Pure, so it is unit-tested.

export interface KpiModel {
  label: string;
  icon: 'lanes' | 'alert' | 'calendar' | 'shipped';
  value: string;
  unit?: string;
  delta?: string;
  tone?: Tone;
  meta?: string;
}

export interface LaneModel {
  lane: number;
  project?: { name: string; href: string; next: string; level: StaleLevel; days: number; where: string };
}

export interface OverviewModel {
  empty: boolean;
  kpis: KpiModel[];
  cap: number;
  activeNames: string[];
  lanes: LaneModel[];
  stages: StageCount[];
  finish: { shipped: number; archived: number };
  rows: ProjectRow[];
  feed: FeedItem[];
}

const LEVEL_RANK: Readonly<Record<string, number>> = { cold: 0, stale: 1, fresh: 2, none: 3 };

function quarterStart(d: Date, offset = 0): number {
  const q = Math.floor(d.getUTCMonth() / 3) + offset;
  return Date.UTC(d.getUTCFullYear(), q * 3, 1);
}

export function relativeTime(iso: string, now: Date): string {
  const minutes = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function feedItem(payload: ProjectEventPayload, name: string): Omit<FeedItem, 'meta' | 'key'> {
  switch (payload.type) {
    case 'status_changed':
      if (payload.to === 'shipped') return { kind: 'shipped', title: `Shipped ${name}` };
      if (payload.to === 'paused') return { kind: 'paused', title: `Paused ${name}` };
      return { kind: 'status', title: `${name} moved to ${payload.to[0]?.toUpperCase()}${payload.to.slice(1)}` };
    case 'checkpoint_added':
      return { kind: 'checkpoint', title: `Checkpoint on ${name}` };
    case 'next_action_completed':
      return { kind: 'checkpoint', title: `Done: ${payload.text}` };
    case 'ship_criterion_done':
      return { kind: 'checkpoint', title: `Ship criterion met on ${name}` };
    case 'reviewed':
      return { kind: 'status', title: `Reviewed ${name}, still right` };
    case 'github_push':
      return { kind: 'push', title: `Pushed to ${payload.branch}` };
    case 'github_pr_merged':
      return { kind: 'push', title: `Merged PR #${payload.number}` };
  }
}

export function buildOverview(
  data: OverviewData,
  now: Date,
  cap = DEFAULT_WIP_CAP,
  thresholds: StaleThresholds = DEFAULT_STALE_THRESHOLDS,
): OverviewModel {
  const { projects } = data;
  const byId = new Map(projects.map((p) => [p.id, p]));
  const open = projects.filter((p) => p.status !== 'shipped' && p.status !== 'archived');
  const graded = open.map((p) => ({ p, s: staleness(p, now, thresholds) }));
  const where = (p: Project): string => {
    const platform = data.platforms.get(p.id);
    return [platform ? PLATFORM_LABELS[platform] : null, data.repos.get(p.id)].filter(Boolean).join(' · ');
  };
  const today = now.toISOString().slice(0, 10);

  const active = graded
    .filter(({ p }) => p.status === 'active')
    .sort((a, b) => (a.p.focusRank ?? 1e9) - (b.p.focusRank ?? 1e9) || a.p.statusChangedAt.localeCompare(b.p.statusChangedAt));
  const stale = graded.filter(({ s }) => s.level === 'stale' || s.level === 'cold');
  const cold = stale.filter(({ s }) => s.level === 'cold').length;
  const reviewDue = open.filter((p) => p.status === 'paused' && p.reviewOn !== null && p.reviewOn <= today).length;
  const shippedIn = (from: number, to: number): number =>
    projects.filter((p) => p.shippedAt && Date.parse(p.shippedAt) >= from && Date.parse(p.shippedAt) < to).length;
  const thisQuarter = shippedIn(quarterStart(now), Number.POSITIVE_INFINITY);
  const lastQuarter = shippedIn(quarterStart(now, -1), quarterStart(now));
  const diff = thisQuarter - lastQuarter;
  const openLanes = Math.max(cap - active.length, 0);

  const kpis: KpiModel[] = [
    {
      label: 'Active',
      icon: 'lanes',
      value: String(active.length),
      unit: `/${cap}`,
      meta: openLanes ? `${openLanes} lane${openLanes === 1 ? '' : 's'} open` : 'All lanes full',
    },
    cold
      ? { label: 'Going stale', icon: 'alert', value: String(stale.length), delta: `${cold} cold`, tone: 'danger' }
      : { label: 'Going stale', icon: 'alert', value: String(stale.length), meta: stale.length ? 'none cold yet' : 'all fresh' },
    { label: 'Review due', icon: 'calendar', value: String(reviewDue), meta: 'paused, past review date' },
    {
      label: 'Shipped this quarter',
      icon: 'shipped',
      value: String(thisQuarter),
      ...(diff !== 0
        ? { delta: `${diff > 0 ? '+' : ''}${diff} vs last`, tone: diff > 0 ? ('positive' as const) : ('warning' as const) }
        : { meta: 'same as last quarter' }),
    },
  ];

  const lanes: LaneModel[] = Array.from({ length: cap }, (_, i) => {
    const entry = active[i];
    if (!entry) return { lane: i + 1 };
    const s = entry.s;
    return {
      lane: i + 1,
      project: {
        name: entry.p.name,
        href: `/p/${entry.p.slug}`,
        next: entry.p.nextAction ?? '',
        level: s.level === 'none' ? 'fresh' : s.level,
        days: s.level === 'none' ? 0 : s.days,
        where: where(entry.p),
      },
    };
  });

  const count = (status: Project['status']): number => projects.filter((p) => p.status === status).length;
  const stages: StageCount[] = (['idea', 'ready', 'active', 'paused', 'shipped'] as const).map((status) => ({
    status,
    count: count(status),
  }));

  const rows: ProjectRow[] = [...graded]
    .sort(
      (a, b) =>
        (LEVEL_RANK[a.s.level] ?? 3) - (LEVEL_RANK[b.s.level] ?? 3) ||
        ('days' in b.s ? b.s.days : 0) - ('days' in a.s ? a.s.days : 0),
    )
    .map(({ p, s }) => {
      const platform = data.platforms.get(p.id);
      const repo = data.repos.get(p.id);
      return {
        name: p.name,
        key: repo ?? p.slug,
        href: `/p/${p.slug}`,
        status: p.status,
        ...(p.nextAction ? { next: p.nextAction } : {}),
        ...(platform ? { platform: PLATFORM_LABELS[platform], platformId: platform } : {}),
        ...(s.level !== 'none'
          ? { stale: { level: s.level, days: s.days, ...(p.status === 'paused' ? { label: s.days < 0 ? 'until review' : 'past review date' } : {}) } }
          : {}),
        updated: relativeTime(p.updatedAt, now),
      };
    });

  const feed: FeedItem[] = data.events.map((e) => {
    const project = byId.get(e.projectId);
    const name = project?.name ?? 'a project';
    return {
      ...feedItem(e.payload, name),
      meta: `${relativeTime(e.occurredAt, now)} · ${e.source === 'github' ? 'GitHub' : 'You'}`,
      key: project?.slug ?? '',
    };
  });

  return {
    empty: projects.length === 0,
    kpis,
    cap,
    activeNames: active.map(({ p }) => p.name),
    lanes,
    stages,
    finish: { shipped: count('shipped'), archived: count('archived') },
    rows,
    feed,
  };
}
