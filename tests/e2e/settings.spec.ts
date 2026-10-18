import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function axe(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`/tests/e2e/fixtures/settings.html${query}`);
  await expect(page.locator('body[data-ready]')).toBeAttached();
}

const cap = (page: Page) => page.getByLabel('Active projects at once');
const status = (page: Page) => page.locator('.fl-settings__status');

for (const theme of ['dark', 'light'] as const) {
  test(`Settings shows the WIP cap (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('fl-theme', t), theme);
    await open(page);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(cap(page)).toHaveValue('3');
    await axe(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('saving a new cap says so', async ({ page }) => {
  await open(page);
  await cap(page).fill('5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(status(page)).toHaveText('Saved. Up to 5 projects can be Active at once.');
});

test('a cap outside 1 to 10 is refused and focused', async ({ page }) => {
  await open(page);
  await cap(page).fill('11');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(cap(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(cap(page)).toBeFocused();
  await expect(page.getByText('Use a whole number from 1 to 10.')).toBeVisible();
  await axe(page);
});

test('a failed save reports the reason', async ({ page }) => {
  await open(page, '?fail=settings');
  await cap(page).fill('4');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(status(page)).toHaveText("That didn't save. Network down");
});

test('Settings shows your GitHub profile and how your projects stand', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: 'Eric Thayer', level: 2 })).toBeVisible();
  await expect(page.getByText('@ericthayer')).toBeVisible();
  await expect(page.getByText('Using Finishlyne since Oct 10, 2026 · last progress 2 days ago')).toBeVisible();
  const link = page.getByRole('link', { name: 'GitHub profile' });
  await expect(link).toHaveAttribute('href', 'https://github.com/ericthayer');
  await expect(link).toHaveAttribute('target', '_blank');
  const stats = page.getByRole('region', { name: 'Your projects' });
  await expect(stats.locator('fl-kpi[label="Active"]')).toHaveAttribute('value', '2');
  await expect(stats.locator('fl-kpi[label="Shipped"]')).toHaveAttribute('meta', '1 archived');
  await expect(stats.locator('fl-kpi[label="Ready or paused"]')).toHaveAttribute('value', '2');
  await expect(stats.locator('fl-kpi[label="Ideas"]')).toHaveAttribute('value', '3');
  await expect(page.getByRole('region', { name: 'Connections' }).getByText('Connected as ericthayer')).toBeVisible();
});

test('saving a new cap updates the Active stat', async ({ page }) => {
  await open(page);
  await cap(page).fill('5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('fl-kpi[label="Active"]')).toHaveAttribute('unit', '/5');
});

test('without an avatar the initial stands in, and a missing App says so', async ({ page }) => {
  await open(page, '?no-avatar&github=not-installed');
  await expect(page.locator('span.fl-profile__avatar')).toHaveText('E');
  await expect(page.getByText('App not installed')).toBeVisible();
  await axe(page);
});

test('a GitHub check that fails does not block the page', async ({ page }) => {
  await open(page, '?github=down');
  await expect(page.getByText('Could not check')).toBeVisible();
  await expect(cap(page)).toHaveValue('3');
});
