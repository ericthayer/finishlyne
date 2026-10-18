import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function axe(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

async function open(page: Page, fixture: 'settings' | 'overview', query: string): Promise<void> {
  await page.goto(`/tests/e2e/fixtures/${fixture}.html${query}`);
  await expect(page.locator('body[data-ready]')).toBeAttached();
}

const github = (page: Page) => page.getByRole('region', { name: 'GitHub' });

for (const theme of ['dark', 'light'] as const) {
  test(`Settings lists repos and their projects (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('fl-theme', t), theme);
    await open(page, 'settings', '');
    await expect(github(page).getByText('Connected as ericthayer.')).toBeVisible();
    await expect(page.getByLabel('Project for ericthayer/finishline')).toHaveValue('a');
    await expect(page.getByLabel('Project for ericthayer/devlog')).toHaveValue('');
    await expect(github(page).getByText('Private')).toBeVisible();
    await axe(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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

test('linking a repo to a project says so and keeps focus', async ({ page }) => {
  await open(page, 'settings', '');
  const pick = page.getByLabel('Project for ericthayer/devlog');
  await pick.focus();
  await pick.selectOption({ label: 'DevLog' });
  await expect(github(page).locator('.fl-github__status')).toHaveText('ericthayer/devlog is linked to DevLog.');
  await expect(pick).toBeFocused();
  await page.getByLabel('Project for ericthayer/finishline').selectOption({ label: 'Not linked' });
  await expect(github(page).locator('.fl-github__status')).toHaveText('ericthayer/finishline is no longer linked.');
});

test('a failed link puts the picker back', async ({ page }) => {
  await open(page, 'settings', '?fail=link');
  const pick = page.getByLabel('Project for ericthayer/devlog');
  await pick.selectOption({ label: 'DevLog' });
  await expect(github(page).locator('.fl-github__status')).toHaveText('Not saved. The Finishlyne App cannot see that repository.');
  await expect(pick).toHaveValue('');
});

test('Settings explains a missing install or missing server secrets', async ({ page }) => {
  await open(page, 'settings', '?github=not-installed');
  await expect(page.getByRole('link', { name: 'Install on GitHub' })).toHaveAttribute('href', /installations\/new$/);
  await open(page, 'settings', '?github=not-configured');
  await expect(github(page).getByText(/missing GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY/)).toBeVisible();
});

test('Issues tab points to Settings when no repo is linked', async ({ page }) => {
  await open(page, 'overview', '?drawer&github=none');
  await page.getByRole('tab', { name: 'Issues' }).click();
  await expect(page.getByRole('heading', { name: 'No linked repos' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Link a repo' })).toHaveAttribute('href', '/settings');
});
