import type { GitHubSource, RepoLinkRecord } from '../data/github.ts';
import type { ProjectListing, ProjectsRepo } from '../data/projects.ts';
import { buildRepoRows, projectChoices } from '../state/github-model.ts';
import { mountGitHubSettings } from '../ui/screens/settings-github.ts';
import { announceChange } from './changes.ts';

/** Appends Settings → GitHub to `main`: connection state and repo links. */
export function showGitHubSettings(
  main: HTMLElement,
  github: GitHubSource,
  projects: Pick<ProjectsRepo, 'listProjects'>,
  now: () => Date = () => new Date(),
): void {
  let links: RepoLinkRecord[] = [];
  let listings: ProjectListing[] = [];
  const nameOf = (id: string): string => listings.find((l) => l.project.id === id)?.project.name ?? 'the project';

  const screen = mountGitHubSettings({
    async onLink(row, projectId) {
      const current = links.find((l) => l.githubRepoId === row.id);
      try {
        if (!projectId) {
          if (current) await github.unlink(current.id);
          screen.announce(`${row.fullName} is no longer linked.`);
        } else {
          screen.announce(`Linking ${row.fullName} and syncing…`);
          await github.link(projectId, row.id);
          screen.announce(`${row.fullName} is linked to ${nameOf(projectId)}.`);
        }
        links = await github.links().catch(() => links);
        announceChange({ origin: 'settings' });
        return true;
      } catch (error) {
        screen.announce(`Not saved. ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    },
    onRetry: () => void load(),
  });
  main.append(screen.root);

  const load = async (): Promise<void> => {
    screen.render({ kind: 'loading' });
    try {
      const status = await github.status();
      if (status.kind !== 'connected') {
        if (main.contains(screen.root)) screen.render(status);
        return;
      }
      const [repos, nextLinks, nextListings] = await Promise.all([github.repos(), github.links(), projects.listProjects()]);
      links = nextLinks;
      listings = nextListings;
      if (!main.contains(screen.root)) return;
      screen.render({
        ...status,
        rows: buildRepoRows(repos, links, now()),
        choices: (row) => projectChoices(listings, row.projectId),
      });
    } catch (error) {
      if (main.contains(screen.root)) screen.render({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  void load();
}
