import type {
  AgentPlatformId,
  Project,
  ProjectEventPayload,
  ProjectStatus,
} from '../domain/types.ts';
import type { Backend } from './client.ts';

// Reads everything the Overview needs in parallel. RLS scopes every query to the signed-in user.

export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  outcome: string | null;
  summary: string | null;
  status: ProjectStatus;
  status_changed_at: string;
  next_action: string | null;
  agent_instructions: string | null;
  focus_rank: number | null;
  review_on: string | null;
  last_reviewed_at: string | null;
  last_progress_at: string;
  shipped_at: string | null;
  shipped_url: string | null;
  site_url: string | null;
  netlify_site_id: string | null;
  screenshot_path: string | null;
  archived_at: string | null;
  archived_reason: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface OverviewData {
  projects: Project[];
  /** Current platform per project id. */
  platforms: ReadonlyMap<string, AgentPlatformId>;
  /** First linked repo full name per project id. */
  repos: ReadonlyMap<string, string>;
  events: { projectId: string; occurredAt: string; source: 'user' | 'github'; payload: ProjectEventPayload }[];
}

export function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    outcome: r.outcome,
    summary: r.summary,
    status: r.status,
    statusChangedAt: r.status_changed_at,
    nextAction: r.next_action,
    agentInstructions: r.agent_instructions,
    focusRank: r.focus_rank,
    reviewOn: r.review_on,
    lastReviewedAt: r.last_reviewed_at,
    lastProgressAt: r.last_progress_at,
    shippedAt: r.shipped_at,
    shippedUrl: r.shipped_url,
    siteUrl: r.site_url ?? null,
    netlifySiteId: r.netlify_site_id ?? null,
    screenshotPath: r.screenshot_path ?? null,
    archivedAt: r.archived_at,
    archivedReason: r.archived_reason,
    tags: r.tags,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const EVENT_LIMIT = 12;

export async function loadOverview(backend: Backend): Promise<OverviewData> {
  const [projects, platforms, repos, events] = await Promise.all([
    backend.db.from('projects').select('*').order('updated_at', { ascending: false }),
    backend.db.from('project_platforms').select('project_id, platform').eq('role', 'current'),
    backend.db.from('repo_links').select('project_id, full_name').order('linked_at'),
    backend.db
      .from('project_events')
      .select('project_id, occurred_at, source, payload')
      .order('occurred_at', { ascending: false })
      .limit(EVENT_LIMIT),
  ]);
  const failed = [projects, platforms, repos, events].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);

  const platformMap = new Map<string, AgentPlatformId>();
  for (const p of (platforms.data ?? []) as { project_id: string; platform: AgentPlatformId }[]) {
    platformMap.set(p.project_id, p.platform);
  }
  const repoMap = new Map<string, string>();
  for (const r of (repos.data ?? []) as { project_id: string; full_name: string }[]) {
    if (!repoMap.has(r.project_id)) repoMap.set(r.project_id, r.full_name);
  }
  const eventRows = (events.data ?? []) as {
    project_id: string;
    occurred_at: string;
    source: 'user' | 'github';
    payload: ProjectEventPayload;
  }[];

  return {
    projects: ((projects.data ?? []) as ProjectRow[]).map(toProject),
    platforms: platformMap,
    repos: repoMap,
    events: eventRows.map((e) => ({
      projectId: e.project_id,
      occurredAt: e.occurred_at,
      source: e.source,
      payload: e.payload,
    })),
  };
}
