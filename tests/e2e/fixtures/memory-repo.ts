import type { CaptureInput, EditInput, Idea, MoveInput, ProjectsRepo, PromoteInput, ShipInput } from '../../../src/data/projects.ts';
import { slugify, uniqueSlug } from '../../../src/domain/slug.ts';
import type { Project } from '../../../src/domain/types.ts';
import { DEFAULT_STALE_THRESHOLDS, type StaleThresholds } from '../../../src/domain/staleness.ts';
import { project } from '../../fixtures.ts';

/** In-memory ProjectsRepo for fixture pages. `?fail=archive` makes archive answer like the server would. */
export function memoryRepo(seed: Idea[], fail: string | null): ProjectsRepo {
  const ideas = [...seed];
  let n = 0;
  let wipCap = 3;
  let thresholds: StaleThresholds = { ...DEFAULT_STALE_THRESHOLDS };
  return {
    async loadWipCap() {
      return wipCap;
    },
    async saveWipCap(cap: number) {
      if (fail === 'settings') throw new Error('Network down');
      wipCap = cap;
    },
    async loadStaleThresholds() {
      return thresholds;
    },
    async saveStaleThresholds(t: StaleThresholds) {
      if (fail === 'settings') throw new Error('Network down');
      thresholds = t;
    },
    async listIdeas() {
      if (fail === 'list') throw new Error('Network down');
      return ideas.map((i) => ({ project: i.project, criteria: [...i.criteria] }));
    },
    async listProjects() {
      return ideas.map((i) => ({ project: i.project, platform: null, repo: null }));
    },
    async capture({ name, summary, outcome }: CaptureInput): Promise<Project> {
      const slug = uniqueSlug(slugify(name), new Set(ideas.map((i) => i.project.slug)));
      const created = new Date(Date.UTC(2026, 9, 10, 11, 30, n++)).toISOString();
      const p = project({ id: `new-${n}`, slug, name, summary: summary ?? null, outcome: outcome ?? null, nextAction: null, createdAt: created });
      ideas.push({ project: p, criteria: [] });
      return p;
    },
    async listCriteria(id: string) {
      return ideas.find((i) => i.project.id === id)?.criteria ?? [];
    },
    async ship(id: string, _input: ShipInput) {
      const index = ideas.findIndex((i) => i.project.id === id);
      const current = ideas[index];
      if (current) ideas[index] = { ...current, project: { ...current.project, status: 'shipped' } };
    },
    async move(id: string, input: MoveInput) {
      const index = ideas.findIndex((i) => i.project.id === id);
      const current = ideas[index];
      if (!current) return;
      ideas[index] = { ...current, project: { ...current.project, status: input.to } };
    },
    async update(id: string, input: EditInput) {
      const index = ideas.findIndex((i) => i.project.id === id);
      const current = ideas[index];
      if (!current) return;
      ideas[index] = {
        ...current,
        project: {
          ...current.project,
          name: input.name,
          summary: input.summary || null,
          outcome: input.outcome || null,
          nextAction: input.nextAction || null,
        },
      };
    },
    async promote(id: string, _input: PromoteInput) {
      const index = ideas.findIndex((i) => i.project.id === id);
      if (index >= 0) ideas.splice(index, 1);
    },
    async reopen(id: string, nextAction: string) {
      if (fail === 'reopen') throw new Error('GATE:NOT_ALLOWED');
      const index = ideas.findIndex((i) => i.project.id === id);
      const current = ideas[index];
      if (current) ideas[index] = { ...current, project: { ...current.project, status: 'ready', nextAction, archivedAt: null, archivedReason: null } };
    },
    async archive(id: string) {
      if (fail === 'archive') throw new Error('GATE:NOT_FOUND');
      const index = ideas.findIndex((i) => i.project.id === id);
      if (index >= 0) ideas.splice(index, 1);
    },
  };
}
