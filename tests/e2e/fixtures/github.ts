import '../../../src/ui/tokens/tokens.css';
import '../../../src/ui/styles/components.css';
import '../../../src/ui/styles/screens.css';
import '../../../src/ui/components/index.ts';
import indexHtml from '../../../index.html?raw';
import { FIXTURE_NOW, fixtureShell } from './shell.ts';
import { showGitHub } from '../../../src/app/github.ts';
import { memoryGitHub } from './memory-github.ts';
import { project } from '../../fixtures.ts';

const parsed = new DOMParser().parseFromString(indexHtml, 'text/html');
for (const tpl of parsed.querySelectorAll('template')) document.body.append(document.importNode(tpl, true));

const params = new URLSearchParams(location.search);
const host = document.getElementById('app');
if (host) {
  const shell = fixtureShell(host, 'github');
  const listings = [
    { project: project({ id: 'a', slug: 'finishline', name: 'Finishline', status: 'active' }), platform: null, repo: null },
    { project: project({ id: 'b', slug: 'devlog', name: 'DevLog', status: 'paused' }), platform: null, repo: null },
  ];
  const linked = [
    { id: 'l1', projectId: 'a', githubRepoId: 101, fullName: 'ericthayer/finishline', lastPushAt: '2026-10-10T09:00:00Z', lastSyncedAt: '2026-10-10T11:56:00Z' },
  ];
  showGitHub(shell.main, memoryGitHub(params.get('github'), params.get('fail'), linked), { listProjects: async () => listings }, () => FIXTURE_NOW);
  document.body.dataset['ready'] = 'true';
}
