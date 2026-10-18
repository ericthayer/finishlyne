import '../../../src/ui/tokens/tokens.css';
import '../../../src/ui/styles/components.css';
import '../../../src/ui/styles/screens.css';
import '../../../src/ui/components/index.ts';
import indexHtml from '../../../index.html?raw';
import { FIXTURE_NOW, fixtureShell } from './shell.ts';
import { showSettings } from '../../../src/app/settings.ts';
import { memoryRepo } from './memory-repo.ts';
import { memoryGitHub } from './memory-github.ts';
import { project } from '../../fixtures.ts';
import type { ProjectStatus } from '../../../src/domain/types.ts';

const parsed = new DOMParser().parseFromString(indexHtml, 'text/html');
for (const tpl of parsed.querySelectorAll('template')) document.body.append(document.importNode(tpl, true));

const params = new URLSearchParams(location.search);
const host = document.getElementById('app');
if (host) {
  const shell = fixtureShell(host, 'settings');
  const seed = (['active', 'active', 'ready', 'paused', 'idea', 'idea', 'idea', 'shipped', 'shipped', 'archived'] as ProjectStatus[]).map(
    (status, i) => ({ project: project({ id: `p${i}`, slug: `p${i}`, name: `Project ${i}`, status, lastProgressAt: `2026-10-0${(i % 8) + 1}T12:00:00Z` }), criteria: [] }),
  );
  // A local stand-in for the GitHub avatar, so the test never reaches the network.
  const avatar = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#6b7280"/></svg>')}`;
  const anonymous = params.has('anonymous');
  showSettings(shell.main, memoryRepo(params.has('empty') ? [] : seed, params.get('fail')), {
    profile: async () =>
      anonymous ? null : { name: 'Eric Thayer', login: 'ericthayer', avatarUrl: params.has('no-avatar') ? null : avatar, since: '2026-10-10T08:00:00Z' },
    github: params.get('github') === 'down' ? { status: () => Promise.reject(new Error('down')) } : memoryGitHub(params.get('github'), null),
    now: () => FIXTURE_NOW,
  });
  document.body.dataset['ready'] = 'true';
}
