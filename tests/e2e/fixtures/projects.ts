import '../../../src/ui/tokens/tokens.css';
import '../../../src/ui/styles/components.css';
import '../../../src/ui/styles/screens.css';
import '../../../src/ui/components/index.ts';
import indexHtml from '../../../index.html?raw';
import type { ProjectListing, ProjectsRepo } from '../../../src/data/projects.ts';
import { fixtureShell } from './shell.ts';
import { DEFAULT_STALE_THRESHOLDS } from '../../../src/domain/staleness.ts';
import { showProjects } from '../../../src/app/projects.ts';
import { project } from '../../fixtures.ts';
import { memorySite } from './memory-site.ts';
import type { CaptureInput, CriterionRecord, EditInput, MoveInput, ShipInput } from '../../../src/data/projects.ts';

const parsed = new DOMParser().parseFromString(indexHtml, 'text/html');
for (const tpl of parsed.querySelectorAll('template')) document.body.append(document.importNode(tpl, true));

const params = new URLSearchParams(location.search);
const withFullLanes = params.has('full')
  ? [
      { project: project({ id: 'g', slug: 'alpha', name: 'Alpha', status: 'active', nextAction: 'Ship the parser.' }), platform: null, repo: null },
      { project: project({ id: 'h', slug: 'beta', name: 'Beta', status: 'active', nextAction: 'Write the docs.' }), platform: null, repo: null },
    ]
  : [];

let listings: ProjectListing[] = params.has('empty')
  ? []
  : [
      ...withFullLanes,
      { project: project({ id: 'a', slug: 'devlog', name: 'DevLog', status: 'active', focusRank: 1, nextAction: 'Fix the timezone bug in the weekly digest.', lastProgressAt: '2026-10-10T08:00:00Z' }), platform: { platform: 'claude_code', label: null, url: 'https://claude.ai/code/devlog' }, repo: 'ericthayer/devlog' },
      { project: project({ id: 'b', slug: 'univia', name: 'Univia', status: 'ready', nextAction: 'Write the first migration for courses.' }), platform: null, repo: null },
      { project: project({ id: 'c', slug: 'stacker', name: 'Stacker', status: 'paused', reviewOn: '2026-09-01', nextAction: 'Decide: keep the Bolt prototype or rebuild.' }), platform: { platform: 'bolt', label: null, url: null }, repo: null },
      { project: project({ id: 'd', slug: 'portfolio', name: 'Portfolio v3', status: 'shipped', shippedAt: '2026-10-03T00:00:00Z' }), platform: null, repo: 'ericthayer/portfolio' },
      { project: project({ id: 'e', slug: 'old-idea', name: 'Old idea', status: 'archived', archivedReason: 'Superseded' }), platform: null, repo: null },
      { project: project({ id: 'f', slug: 'ideas-board', name: 'Ideas board', status: 'idea', nextAction: null }), platform: null, repo: null },
    ];

let n = 0;
// DevLog has two criteria, one done. Everything else has none.
const criteria: Record<string, CriterionRecord[]> = {
  a: [
    { id: 'c1', text: 'Digest sends on time', position: 0, doneAt: '2026-10-09T10:00:00Z' },
    { id: 'c2', text: 'Docs written', position: 1, doneAt: null },
  ],
};
const repo: Pick<ProjectsRepo, 'listProjects' | 'capture' | 'update' | 'move' | 'archive' | 'listCriteria' | 'ship' | 'loadWipCap' | 'loadStaleThresholds'> = {
  async loadWipCap() {
    return Number(params.get('cap') ?? 3);
  },
  async loadStaleThresholds() {
    return DEFAULT_STALE_THRESHOLDS;
  },
  async listCriteria(id: string) {
    return criteria[id] ?? [];
  },
  async ship(id: string, input: ShipInput) {
    if (params.has('save-fail')) throw new Error('Network down');
    const open = (criteria[id] ?? []).filter((c) => (c.doneAt === null && !input.check.includes(c.id)) || input.uncheck.includes(c.id));
    if (open.length && !input.shipAnyway) throw new Error('GATE:UNMET_SHIP_CRITERIA');
    listings = listings.map((l) => (l.project.id === id ? { ...l, project: { ...l.project, status: 'shipped' } } : l));
  },
  async listProjects() {
    if (params.has('fail')) throw new Error('Network down');
    return listings;
  },
  async capture({ name, summary, outcome, platform }: CaptureInput) {
    if (params.has('save-fail')) throw new Error('Network down');
    const p = project({ id: `new-${++n}`, slug: `new-${n}`, name, summary: summary ?? null, outcome: outcome ?? null, status: 'idea' });
    listings = [...listings, { project: p, platform: platform ?? null, repo: null }];
    return p;
  },
  async move(id: string, input: MoveInput) {
    if (params.has('save-fail')) throw new Error('Network down');
    listings = listings.map((l) =>
      l.project.id === id
        ? {
            ...l,
            project: {
              ...l.project,
              status: input.to,
              nextAction: input.to === 'paused' ? input.nextAction : l.project.nextAction,
              reviewOn: input.to === 'paused' ? input.reviewOn : l.project.reviewOn,
            },
          }
        : l,
    );
  },
  async archive(id: string, reason: string) {
    if (params.has('save-fail')) throw new Error('Network down');
    listings = listings.map((l) =>
      l.project.id === id ? { ...l, project: { ...l.project, status: 'archived', archivedReason: reason } } : l,
    );
  },
  async update(id: string, input: EditInput) {
    if (params.has('save-fail')) throw new Error('Network down');
    listings = listings.map((l) =>
      l.project.id === id
        ? {
            ...l,
            platform: input.platform,
            project: {
              ...l.project,
              name: input.name,
              summary: input.summary || null,
              outcome: input.outcome || null,
              nextAction: input.nextAction || null,
            },
          }
        : l,
    );
  },
};

// ?netlify=off answers like a server with no Netlify token.
const site = memorySite(
  { netlify: 'connected', projects: {} },
  params.get('netlify') === 'off'
    ? { netlify: 'not-configured', sites: [] }
    : {
        netlify: 'connected',
        sites: [
          { id: '00000000-0000-4000-8000-000000000001', name: 'devlog', url: 'https://devlog.netlify.app' },
          { id: '00000000-0000-4000-8000-000000000002', name: 'univia', url: 'https://univia.help' },
        ],
      },
);
(window as unknown as { fixtureSite: typeof site }).fixtureSite = site;

const host = document.getElementById('app');
if (host) {
  const shell = fixtureShell(host, 'projects', { capture: repo.capture, drawer: repo, site: async () => site });
  void showProjects(shell.main, repo, params.get('q') ?? '', shell.claimSearch, () => new Date('2026-10-10T12:00:00Z'), async () => site).refresh().then(() => {
    document.body.dataset['ready'] = 'true';
  });
}
