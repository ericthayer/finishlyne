import type { GitHubSource } from '../data/github.ts';
import type { Profile } from '../data/profile.ts';
import type { ProjectsRepo } from '../data/projects.ts';
import { wipCapError } from '../domain/project-fields.ts';
import { parseStaleThresholds } from '../domain/staleness.ts';
import { buildProfile, githubConnection } from '../state/settings-model.ts';
import { mountSettings } from '../ui/screens/settings.ts';
import { announceChange } from './changes.ts';
import { saveError } from './errors.ts';

export type SettingsSource = Pick<
  ProjectsRepo,
  'loadWipCap' | 'saveWipCap' | 'loadStaleThresholds' | 'saveStaleThresholds' | 'listProjects'
>;

export interface SettingsDeps {
  profile(): Promise<Profile | null>;
  github: Pick<GitHubSource, 'status'>;
  now?: () => Date;
}

/** Mounts Settings into `main`: profile, the WIP cap, stale thresholds and connections. */
export function showSettings(main: HTMLElement, repo: SettingsSource, deps: SettingsDeps): void {
  const now = deps.now ?? ((): Date => new Date());
  const screen = mountSettings(main, {
    onSave(raw: string) {
      const problem = wipCapError(raw);
      if (problem) {
        screen.invalid(problem);
        return;
      }
      screen.invalid(null);
      const cap = Number(raw.trim());
      screen.setSaving(true);
      repo.saveWipCap(cap).then(
        () => {
          screen.setSaving(false);
          screen.announce(`Saved. Up to ${cap} projects can be Active at once.`);
        },
        (error: unknown) => {
          screen.setSaving(false);
          screen.announce(saveError(error));
        },
      );
    },
    onSaveThresholds(input) {
      const t = screen.thresholds;
      const parsed = parseStaleThresholds(input);
      if (!parsed.ok) {
        t.invalid(parsed.key, parsed.message);
        return;
      }
      t.invalid(null);
      t.setSaving(true);
      repo.saveStaleThresholds(parsed.value).then(
        () => {
          t.setSaving(false);
          t.announce('Saved. Staleness now uses these day counts.');
          announceChange({ origin: 'settings' });
        },
        (error: unknown) => {
          t.setSaving(false);
          t.announce(saveError(error));
        },
      );
    },
    onRetry: () => void load(),
  });

  const load = async (): Promise<void> => {
    screen.setLoading();
    try {
      const [cap, thresholds] = await Promise.all([repo.loadWipCap(), repo.loadStaleThresholds()]);
      if (main.contains(screen.root)) screen.show(cap, thresholds);
    } catch (error) {
      if (main.contains(screen.root)) screen.setError(error instanceof Error ? error.message : String(error));
    }
  };

  // The profile is extra: if it or the project list fails, the settings still load.
  void Promise.all([deps.profile(), repo.listProjects()]).then(
    ([profile, listings]) => {
      if (main.contains(screen.root)) screen.showProfile(profile ? buildProfile(profile, listings, now()) : null);
    },
    () => undefined,
  );
  deps.github.status().then(
    (status) => screen.setGitHub(githubConnection(status)),
    () => screen.setGitHub({ kind: 'unknown', text: 'Could not check' }),
  );
  void load();
}
