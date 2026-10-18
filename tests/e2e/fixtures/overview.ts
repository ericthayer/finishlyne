import '../../../src/ui/tokens/tokens.css';
import '../../../src/ui/styles/components.css';
import '../../../src/ui/styles/screens.css';
import '../../../src/ui/components/index.ts';
import indexHtml from '../../../index.html?raw';
import { drawerSource, fixtureShell } from './shell.ts';
import { memoryGitHub } from './memory-github.ts';
import { buildOverview } from '../../../src/state/overview-model.ts';
import { renderOverview } from '../../../src/ui/screens/overview.ts';
import { project } from '../../fixtures.ts';
import { LIVE_URL, memorySite } from './memory-site.ts';

// Pull the shell templates from the real index.html so this page can't drift from it.
const parsed = new DOMParser().parseFromString(indexHtml, 'text/html');
for (const tpl of parsed.querySelectorAll('template')) document.body.append(document.importNode(tpl, true));

const params = new URLSearchParams(location.search);
const empty = params.has('empty');
// ?sites gives Finishline an uploaded screenshot and DevLog a live site plus Netlify data.
const sites = params.has('sites');
const projects = empty
  ? []
  : [
      project({ id: 'a', slug: 'finishline', name: 'Finishline', status: 'active', focusRank: 1, nextAction: 'Wire Supabase sign-in through the GitHub App.', lastProgressAt: '2026-10-10T08:00:00Z', ...(sites && { screenshotPath: 'u/a/1' }) }),
      project({ id: 'b', slug: 'devlog', name: 'DevLog', status: 'active', focusRank: 2, nextAction: 'Fix the timezone bug in the weekly digest.', lastProgressAt: '2026-10-01T08:00:00Z', ...(sites && { siteUrl: LIVE_URL, netlifySiteId: 'site-b' }) }),
      project({ id: 'c', slug: 'stacker', name: 'Stacker', status: 'paused', reviewOn: '2026-09-01', nextAction: 'Decide: keep the Bolt prototype or rebuild.' }),
      project({ id: 'd', slug: 'univia', name: 'Univia', status: 'ready', nextAction: 'Write the first migration for courses.' }),
      project({ id: 'e', slug: 'portfolio', name: 'Portfolio v3', status: 'shipped', shippedAt: '2026-10-03T00:00:00Z' }),
      project({ id: 'f', slug: 'old', name: 'Old idea', status: 'archived', archivedReason: 'Superseded' }),
    ];

const model = buildOverview(
  {
    projects,
    platforms: new Map([['a', 'claude_code'], ['b', 'codex']]),
    repos: new Map([['a', 'ericthayer/finishline']]),
    events: empty
      ? []
      : [{ projectId: 'a', occurredAt: '2026-10-10T11:00:00Z', source: 'github', payload: { type: 'github_push', repoLinkId: 'r', branch: 'main', sha: 'abc' } }],
  },
  new Date('2026-10-10T12:00:00Z'),
);

const host = document.getElementById('app');
if (host) {
  const listings = projects.map((p) => ({ project: p, platform: null, repo: null }));
  // `?github` links Finishline to a repo with an open PR and issue; `?github=none` connects with no links.
  const mode = params.get('github');
  const github =
    mode === null ? undefined
    : memoryGitHub(mode, null, mode === 'none' ? [] : [
        { id: 'l1', projectId: 'a', githubRepoId: 101, fullName: 'ericthayer/finishline', lastPushAt: '2026-10-10T09:00:00Z', lastSyncedAt: '2026-10-10T11:56:00Z' },
      ]);
  const shell = fixtureShell(host, 'overview', { drawer: drawerSource(listings), ...(github ? { github } : {}) });
  renderOverview(shell.main, model);
  const ready = (): void => {
    document.body.dataset['ready'] = 'true';
  };
  if (!sites) ready();
  else {
    const site = memorySite(
      {
        netlify: 'connected',
        projects: {
          b: {
            embeddable: true,
            netlify: {
              siteId: 'site-b',
              name: 'devlog',
              url: 'https://devlog.netlify.app',
              adminUrl: 'https://app.netlify.com/projects/devlog',
              screenshotUrl: null,
              latest: { state: 'ready', at: '2026-10-10T10:00:00Z', url: 'https://devlog.netlify.app', branch: 'main', error: null },
              previews: [{ review: 12, title: 'Digest fix', url: 'https://deploy-preview-12--devlog.netlify.app', prUrl: null, at: '2026-10-10T09:00:00Z' }],
            },
          },
        },
      },
      { netlify: 'connected', sites: [] },
    );
    void import('../../../src/app/site-previews.ts')
      .then((m) => m.decorateCards(shell.main, projects, site, new Date('2026-10-10T12:00:00Z')))
      .then(ready);
  }
}
