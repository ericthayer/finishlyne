import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Phone widths. The side panel overlays the page as a sheet and every screen fits without
// sideways scrolling. Runs once (laptop project) since the viewport is set here.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'laptop', 'Phone checks run once');
});

async function open(page: Page, fixture: string, query = ''): Promise<void> {
  await page.goto(`/tests/e2e/fixtures/${fixture}.html${query}`);
  await expect(page.locator('body[data-ready]')).toBeAttached();
}

async function axe(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('the side panel starts closed on a phone, even when it was left open', async ({ page }) => {
  await open(page, 'overview', '?drawer');
  await expect(page.getByRole('button', { name: 'Side panel', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('complementary', { name: 'Side panel', exact: true })).toBeHidden();
});

test('the side panel overlays the page and closes with its button, Escape or a tap outside', async ({ page }) => {
  await open(page, 'overview', '?drawer');
  const toggle = page.getByRole('button', { name: 'Side panel', exact: true });
  const close = page.getByRole('button', { name: 'Close side panel' });
  const mainWidth = (): Promise<number> => page.locator('.fl-main').evaluate((m) => m.getBoundingClientRect().width);
  const before = await mainWidth();

  await toggle.tap();
  await expect(page.getByRole('tab', { name: 'Committed' })).toBeVisible();
  await expect(close).toBeFocused();
  expect(await mainWidth()).toBe(before);
  expect(await page.locator('.fl-main').evaluate((m) => (m as HTMLElement).inert)).toBe(true);

  await close.tap();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  expect(await page.locator('.fl-main').evaluate((m) => (m as HTMLElement).inert)).toBe(false);

  await toggle.tap();
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');

  await toggle.tap();
  await expect(close).toBeVisible();
  await page.locator('.fl-drawer__scrim').tap({ position: { x: 20, y: 400 } });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('complementary', { name: 'Side panel', exact: true })).toBeHidden();
});

test('the close button is only shown on phones', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, 'overview', '?drawer');
  await expect(page.getByRole('tab', { name: 'Committed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close side panel' })).toBeHidden();
});

for (const width of [360, 390, 430]) {
  test(`no screen scrolls sideways at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const fixture of ['overview', 'projects', 'inbox', 'archive', 'settings', 'activity']) {
      await open(page, fixture);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), fixture).toBeLessThanOrEqual(width);
    }
  });
}

test('table row actions are big enough to tap', async ({ page }) => {
  await open(page, 'projects');
  const heights = await page.locator('.fl-table__action').evaluateAll((all) => all.map((b) => b.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(24);
});

test('form fields are 16px so iOS does not zoom on focus', async ({ page }) => {
  await open(page, 'overview');
  const size = await page.locator('#fl-q').evaluate((i) => parseFloat(getComputedStyle(i).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});

for (const theme of ['dark', 'light'] as const) {
  test(`${theme} theme: Overview and the open side panel pass axe on a phone`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('fl-theme', t), theme);
    await open(page, 'overview');
    await axe(page);
    await page.getByRole('button', { name: 'Side panel', exact: true }).tap();
    await expect(page.getByRole('tab', { name: 'Committed' })).toBeVisible();
    await axe(page);
    await open(page, 'projects');
    await axe(page);
  });
}
