import '../../../src/ui/tokens/tokens.css';
import '../../../src/ui/styles/components.css';
import '../../../src/ui/styles/screens.css';
import '../../../src/ui/components/index.ts';
import indexHtml from '../../../index.html?raw';
import { fixtureShell } from './shell.ts';
import { showSettings } from '../../../src/app/settings.ts';
import { memoryRepo } from './memory-repo.ts';
import { memoryGitHub } from './memory-github.ts';
import { project } from '../../fixtures.ts';

const parsed = new DOMParser().parseFromString(indexHtml, 'text/html');
for (const tpl of parsed.querySelectorAll('template')) document.body.append(document.importNode(tpl, true));

const params = new URLSearchParams(location.search);
const host = document.getElementById('app');
if (host) {
  const shell = fixtureShell(host, 'settings');
  const ideas = [
    { project: project({ id: 'a', slug: 'finishline', name: 'Finishline', status: 'active' }), criteria: [] },
    { project: project({ id: 'b', slug: 'devlog', name: 'DevLog', status: 'paused' }), criteria: [] },
  ];
  const linked = [{ id: 'l1', projectId: 'a', githubRepoId: 101, fullName: 'ericthayer/finishline', lastPushAt: null, lastSyncedAt: null }];
  showSettings(shell.main, memoryRepo(ideas, params.get('fail')), memoryGitHub(params.get('github'), params.get('fail'), linked));
  document.body.dataset['ready'] = 'true';
}
