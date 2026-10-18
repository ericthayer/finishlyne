import type { GitHubSource } from '../data/github.ts';
import type { ProjectsRepo } from '../data/projects.ts';
import { wipCapError } from '../domain/project-fields.ts';
import { mountSettings } from '../ui/screens/settings.ts';
import { saveError } from './errors.ts';
import { showGitHubSettings } from './settings-github.ts';

export type SettingsSource = Pick<ProjectsRepo, 'loadWipCap' | 'saveWipCap' | 'listProjects'>;

/** Mounts Settings into `main`: the WIP cap and, when `github` is given, GitHub. Stale thresholds arrive later. */
export function showSettings(main: HTMLElement, repo: SettingsSource, github?: GitHubSource): void {
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
    onRetry: () => void load(),
  });

  const load = async (): Promise<void> => {
    screen.setLoading();
    try {
      const cap = await repo.loadWipCap();
      if (main.contains(screen.root)) screen.show(cap);
    } catch (error) {
      if (main.contains(screen.root)) screen.setError(error instanceof Error ? error.message : String(error));
    }
  };

  if (github) showGitHubSettings(main, github, repo);
  void load();
}
