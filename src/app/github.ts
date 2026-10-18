import type { GitHubRepo, GitHubSource, RepoLinkRecord } from '../data/github.ts';
import type { ProjectListing, ProjectsRepo } from '../data/projects.ts';
import { buildRepoRows, needsSync, projectChoices, syncedLabel } from '../state/github-model.ts';
import { buildDetail, buildGitHubPage } from '../state/github-page-model.ts';
import { renderDetail } from '../ui/screens/github-detail.ts';
import { mountGitHubPage } from '../ui/screens/github.ts';
import { announceChange } from './changes.ts';

/** Mounts /github into `main`: connection, KPIs, linked repos with live detail, and repo links. */
export function showGitHub(
  main: HTMLElement,
  github: GitHubSource,
  projects: Pick<ProjectsRepo, 'listProjects'>,
  now: () => Date = () => new Date(),
): void {
  let repos: GitHubRepo[] = [];
  let links: RepoLinkRecord[] = [];
  let listings: ProjectListing[] = [];
  let syncing = false;
  const nameOf = (id: string): string => listings.find((l) => l.project.id === id)?.project.name ?? 'the project';

  /** Re-reads the cache and repaints the KPIs and linked repos. */
  const repaint = async (): Promise<void> => {
    const [nextLinks, items] = await Promise.all([github.links(), github.items()]);
    links = nextLinks;
    if (!main.contains(screen.root)) return;
    screen.update(buildGitHubPage(repos, links, items, listings, now()), syncedLabel(links, now()));
  };

  const sync = async (): Promise<void> => {
    if (syncing) return;
    syncing = true;
    screen.setSyncing(true);
    screen.announce('Syncing with GitHub…');
    try {
      await github.sync();
      await repaint();
      screen.announce('Synced with GitHub.');
      announceChange({ origin: 'github' });
    } catch (error) {
      screen.announce(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    syncing = false;
    screen.setSyncing(false);
  };

  const screen = mountGitHubPage(main, {
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
        await repaint().catch(() => undefined);
        announceChange({ origin: 'github' });
        return true;
      } catch (error) {
        screen.announce(`Not saved. ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    },
    onRetry: () => void load(),
    onSync: () => void sync(),
    onOpen(repo, body) {
      const fetchDetail = (): void => {
        renderDetail(body, repo.fullName, { kind: 'loading' });
        github.details(repo.repoId).then(
          (d) => renderDetail(body, repo.fullName, { kind: 'ready', view: buildDetail(d, now()) }),
          (error: unknown) =>
            renderDetail(body, repo.fullName, { kind: 'error', message: error instanceof Error ? error.message : String(error), retry: fetchDetail }),
        );
      };
      fetchDetail();
    },
  });

  const load = async (): Promise<void> => {
    screen.render({ kind: 'loading' });
    try {
      const status = await github.status();
      if (status.kind !== 'connected') {
        if (main.contains(screen.root)) screen.render(status);
        return;
      }
      const [nextRepos, nextLinks, items, nextListings] = await Promise.all([github.repos(), github.links(), github.items(), projects.listProjects()]);
      repos = nextRepos;
      links = nextLinks;
      listings = nextListings;
      if (!main.contains(screen.root)) return;
      screen.render({
        ...status,
        synced: syncedLabel(links, now()),
        view: buildGitHubPage(repos, links, items, listings, now()),
        rows: buildRepoRows(repos, links, now()),
        choices: (row) => projectChoices(listings, row.projectId),
      });
      if (needsSync(links, now())) void sync();
    } catch (error) {
      if (main.contains(screen.root)) screen.render({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  };

  void load();
}
