import type { Project } from '../src/domain/index.ts';

export function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    slug: 'finishline',
    name: 'Finishline',
    outcome: 'A personal command center that gets projects shipped',
    summary: 'Tracks projects born from agentic development',
    status: 'idea',
    statusChangedAt: '2026-10-01T12:00:00Z',
    nextAction: 'Write the init migration',
    agentInstructions: null,
    focusRank: null,
    reviewOn: null,
    lastReviewedAt: null,
    lastProgressAt: '2026-10-01T12:00:00Z',
    shippedAt: null,
    shippedUrl: null,
    siteUrl: null,
    netlifySiteId: null,
    screenshotPath: null,
    archivedAt: null,
    archivedReason: null,
    tags: [],
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    ...overrides,
  };
}
