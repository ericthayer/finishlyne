import type { GitHubSource } from '../data/github.ts';
import type { Profile } from '../data/profile.ts';
import type { ProjectListing, ProjectsRepo } from '../data/projects.ts';
import { buildSettings, githubConnection } from '../state/settings-model.ts';
import { wipCapError } from '../domain/project-fields.ts';
import { mountSettings } from '../ui/screens/settings.ts';
import { saveError } from './errors.ts';

export type SettingsSource = Pick<ProjectsRepo, 'loadWipCap' | 'saveWipCap' | 'listProjects'>;

export interface SettingsDeps {
  profile(): Promise<Profile | null>;
  github: Pick<GitHubSource, 'status'>;
  now?: () => Date;
}

/** Mounts Settings into `main`: profile, project stats, connections and the WIP cap. Stale thresholds arrive later. */
export function showSettings(main: HTMLElement, repo: SettingsSource, deps: SettingsDeps): void {
  const now = deps.now ?? ((): Date => new Date());
  let loaded: { profile: Profile | null; listings: ProjectListing[] } | null = null;
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
          if (loaded) screen.showSummary(buildSettings(loaded.profile, loaded.listings, cap, now()));
          screen.announce(`Saved. Up to ${cap} projects can be Active at once.`);
        },
        (error: unknown) => {
          screen.setSaving(false);
          screen.announce(saveError(error));
        },
      );
    },
    onRetry: () => void load(),
  });

  const load = async (): Promise<void> => {
    screen.setLoading();
    try {
      const [cap, listings, profile] = await Promise.all([
        repo.loadWipCap(),
        repo.listProjects(),
        deps.profile().catch(() => null),
      ]);
      if (!main.contains(screen.root)) return;
      loaded = { profile, listings };
      screen.showSummary(buildSettings(profile, listings, cap, now()));
      screen.show(cap);
    } catch (error) {
      if (main.contains(screen.root)) screen.setError(error instanceof Error ? error.message : String(error));
    }
  };

  deps.github.status().then(
    (status) => screen.setGitHub(githubConnection(status)),
    () => screen.setGitHub({ kind: 'unknown', text: 'Could not check' }),
  );
  void load();
}
