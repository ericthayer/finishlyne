import '../../../src/ui/tokens/tokens.css';
import '../../../src/ui/styles/components.css';
import '../../../src/ui/styles/screens.css';
import '../../../src/ui/components/index.ts';
import indexHtml from '../../../index.html?raw';
import { fixtureShell } from './shell.ts';
import { showSettings } from '../../../src/app/settings.ts';
import { memoryRepo } from './memory-repo.ts';

const parsed = new DOMParser().parseFromString(indexHtml, 'text/html');
for (const tpl of parsed.querySelectorAll('template')) document.body.append(document.importNode(tpl, true));

const params = new URLSearchParams(location.search);
const host = document.getElementById('app');
if (host) {
  const shell = fixtureShell(host, 'settings');
  showSettings(shell.main, memoryRepo([], params.get('fail')));
  document.body.dataset['ready'] = 'true';
}
