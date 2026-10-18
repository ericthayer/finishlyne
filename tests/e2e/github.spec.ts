import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function axe(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

async function open(page: Page, fixture: 'github' | 'overview', query: string): Promise<void> {
  await page.goto(`/tests/e2e/fixtures/${fixture}.html${query}`);
  await expect(page.locator('body[data-ready]')).toBeAttached();
}

const status = (page: Page) => page.locator('.fl-github__status');
const repos = (page: Page) => page.getByRole('region', { name: 'All repositories' });

for (const theme of ['dark', 'light'] as const) {
  test(`GitHub page shows the connection, KPIs and repos (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('fl-theme', t), theme);
    await open(page, 'github', '');
    await expect(page.getByRole('heading', { name: 'GitHub', level: 1 })).toBeVisible();
    await expect(page.getByText('Connected as ericthayer · Synced 4 min ago')).toBeVisible();
    await expect(page.getByRole('link', { name: 'GitHub' }).first()).toHaveAttribute('aria-current', 'page');
    const kpis = page.getByRole('region', { name: 'At a glance' });
    await expect(kpis.locator('fl-kpi[label="Open PRs"]')).toHaveAttribute('value', '1');
    await expect(kpis.locator('fl-kpi[label="Linked"]')).toHaveAttribute('meta', 'to 1 project');
    await expect(page.getByLabel('Project for ericthayer/finishline')).toHaveValue('a');
    await expect(page.getByLabel('Project for ericthayer/devlog')).toHaveValue('');
    await expect(repos(page).getByText('Side projects, finished.')).toBeVisible();
    await expect(repos(page).getByText('TypeScript · 2 open · Pushed 3 hrs ago')).toBeVisible();
    await expect(repos(page).getByText('Private')).toBeVisible();
    await axe(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test(`opening a linked repo loads PRs, issues, pushes and the release (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('fl-theme', t), theme);
    await open(page, 'github', '');
    const linked = page.getByRole('region', { name: 'Linked repos' });
    await linked.getByText('ericthayer/finishline').click();
    await expect(linked.getByRole('heading', { name: 'Pull requests (1)' })).toBeVisible();
    const pr = linked.getByRole('link', { name: 'Pull request #12: Sync repos from the GitHub App (opens GitHub)' });
    await expect(pr).toHaveAttribute('href', 'https://github.com/ericthayer/finishline/pull/12');
    await expect(linked.getByText('claude/github-sync · by claude · 1 reviewer requested · updated 2 hrs ago')).toBeVisible();
    await expect(linked.getByText('Draft')).toBeVisible();
    await expect(linked.getByText('by ericthayer · 3 comments · updated 1 day ago')).toBeVisible();
    await expect(linked.getByRole('link', { name: 'v0.4.0 · 2 days ago' })).toBeVisible();
    await expect(linked.getByRole('link', { name: 'claude/github-sync' })).toHaveAttribute('href', 'https://github.com/ericthayer/finishline/tree/claude/github-sync');
    await axe(page);
  });

  test(`Issues tab shows open PRs and issues per project (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('fl-theme', t), theme);
    await open(page, 'overview', '?drawer&github');
    await page.getByRole('tab', { name: 'Issues' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Issues' }).getByRole('heading', { name: 'Finishline', level: 3 })).toBeVisible();
    await expect(page.getByText('1 open PR · 1 open issue · pushed 3 hrs ago')).toBeVisible();
    const pr = page.getByRole('link', { name: 'Pull request #12: Sync repos from the GitHub App (opens GitHub)' });
    await expect(pr).toHaveAttribute('href', 'https://github.com/ericthayer/finishline/pull/12');
    await expect(page.getByText('Synced 4 min ago')).toBeVisible();
    await axe(page);
  });
}

test('a repo detail that fails offers a retry', async ({ page }) => {
  await open(page, 'github', '?fail=details');
  const linked = page.getByRole('region', { name: 'Linked repos' });
  await linked.getByText('ericthayer/finishline').click();
  await expect(linked.getByRole('alert')).toContainText('ericthayer/finishline did not load. GitHub /repositories answered 500');
  await expect(linked.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('linking a repo updates linked repos and keeps focus', async ({ page }) => {
  await open(page, 'github', '');
  const pick = page.getByLabel('Project for ericthayer/devlog');
  await pick.focus();
  await pick.selectOption({ label: 'DevLog' });
  await expect(status(page)).toHaveText('ericthayer/devlog is linked to DevLog.');
  await expect(pick).toBeFocused();
  await expect(page.getByRole('region', { name: 'Linked repos' }).getByText('ericthayer/devlog')).toBeVisible();
  await page.getByLabel('Project for ericthayer/finishline').selectOption({ label: 'Not linked' });
  await expect(status(page)).toHaveText('ericthayer/finishline is no longer linked.');
});

test('a failed link puts the picker back', async ({ page }) => {
  await open(page, 'github', '?fail=link');
  const pick = page.getByLabel('Project for ericthayer/devlog');
  await pick.selectOption({ label: 'DevLog' });
  await expect(status(page)).toHaveText('Not saved. The Finishlyne App cannot see that repository.');
  await expect(pick).toHaveValue('');
});

test('Sync now refreshes and says so', async ({ page }) => {
  await open(page, 'github', '');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(status(page)).toHaveText('Synced with GitHub.');
});

test('GitHub page explains a missing install or missing server secrets', async ({ page }) => {
  await open(page, 'github', '?github=not-installed');
  await expect(page.getByRole('link', { name: 'Install on GitHub' })).toHaveAttribute('href', /installations\/new$/);
  await open(page, 'github', '?github=not-configured');
  await expect(page.getByText(/missing GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY/)).toBeVisible();
});

test('Issues tab points to the GitHub page when no repo is linked', async ({ page }) => {
  await open(page, 'overview', '?drawer&github=none');
  await page.getByRole('tab', { name: 'Issues' }).click();
  await expect(page.getByRole('heading', { name: 'No linked repos' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Link a repo' })).toHaveAttribute('href', '/github');
});
