// Domain types. Mirrors supabase/migrations; see docs/SPEC.md §3.

export const PROJECT_STATUSES = ['idea', 'ready', 'active', 'paused', 'shipped', 'archived'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const OPEN_STATUSES: readonly ProjectStatus[] = ['idea', 'ready', 'active', 'paused'];

export const AGENT_PLATFORMS = [
  'claude_code',
  'claude_ai',
  'codex',
  'google_ai_studio',
  'bolt',
  'lovable',
  'v0',
  'cursor',
  'replit',
  'other',
] as const;
export type AgentPlatformId = (typeof AGENT_PLATFORMS)[number];

/** ISO-8601 timestamp, e.g. 2026-10-10T11:26:31Z */
export type Timestamp = string;
/** Calendar date, YYYY-MM-DD */
export type CalendarDate = string;

export interface Project {
  id: string;
  slug: string;
  name: string;
  outcome: string | null;
  summary: string | null;
  status: ProjectStatus;
  statusChangedAt: Timestamp;
  nextAction: string | null;
  agentInstructions: string | null;
  focusRank: number | null;
  reviewOn: CalendarDate | null;
  lastReviewedAt: Timestamp | null;
  lastProgressAt: Timestamp;
  shippedAt: Timestamp | null;
  shippedUrl: string | null;
  /** The live site to preview, https only. */
  siteUrl: string | null;
  /** The linked Netlify site; its data comes from the netlify Edge Function. */
  netlifySiteId: string | null;
  /** Uploaded screenshot in the project-screenshots bucket: <user id>/<project id>/<timestamp>. */
  screenshotPath: string | null;
  archivedAt: Timestamp | null;
  archivedReason: string | null;
  tags: readonly string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ShipCriterion {
  id: string;
  projectId: string;
  text: string;
  doneAt: Timestamp | null;
  position: number;
}

export interface Decision {
  id: string;
  projectId: string;
  text: string;
  rationale: string | null;
  supersededBy: string | null;
  createdAt: Timestamp;
}

export type BlockerKind = 'decision' | 'technical' | 'external';

export interface Blocker {
  id: string;
  projectId: string;
  text: string;
  kind: BlockerKind;
  resolvedAt: Timestamp | null;
  createdAt: Timestamp;
}

export type PlatformRole = 'origin' | 'current' | 'past';

export interface ProjectPlatform {
  projectId: string;
  platform: AgentPlatformId;
  label: string | null;
  url: string | null;
  role: PlatformRole;
  lastUsedAt: Timestamp | null;
}

/** The platform a project is on now, as the create and edit forms set it. */
export interface PlatformLink {
  platform: AgentPlatformId;
  /** Required for 'other'; null for every listed platform. */
  label: string | null;
  /** https:// deep link into the platform, when set. */
  url: string | null;
}

export interface Checkpoint {
  id: string;
  projectId: string;
  platform: AgentPlatformId | null;
  summary: string;
  nextActionSet: string;
  createdAt: Timestamp;
}

export interface RepoLink {
  id: string;
  projectId: string;
  githubRepoId: number;
  fullName: string;
  defaultBranch: string;
  trackedBranch: string | null;
  installationId: number;
  lastPushAt: Timestamp | null;
  lastSyncedAt: Timestamp | null;
  linkedAt: Timestamp;
}

export interface CommitSummary {
  sha: string;
  message: string;
  committedAt: Timestamp;
}

export type ProjectEventPayload =
  | { type: 'status_changed'; from: ProjectStatus; to: ProjectStatus }
  | { type: 'next_action_completed'; text: string }
  | { type: 'checkpoint_added'; checkpointId: string }
  | { type: 'ship_criterion_done'; criterionId: string }
  | { type: 'reviewed' }
  | { type: 'github_push'; repoLinkId: string; branch: string; sha: string }
  | { type: 'github_pr_merged'; repoLinkId: string; number: number };

export type ProjectEventType = ProjectEventPayload['type'];

export interface ProjectEvent {
  id: string;
  projectId: string;
  occurredAt: Timestamp;
  source: 'user' | 'github';
  payload: ProjectEventPayload;
}
