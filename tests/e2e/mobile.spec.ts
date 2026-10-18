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
    for (const fixture of ['overview', 'projects', 'inbox', 'archive', 'settings', 'activity', 'github']) {
      await open(page, fixture);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), fixture).toBeLessThanOrEqual(width);
    }
  });
}

test('the rail becomes a bottom tab bar with visible names', async ({ page }) => {
  await open(page, 'projects');
  const rail = page.getByRole('complementary', { name: 'Primary' });
  const box = await rail.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(844);
  expect(box?.width).toBe(390);
  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of ['Overview', 'Projects', 'Inbox', 'Archive', 'GitHub']) {
    const link = nav.getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    expect(await link.evaluate((a) => getComputedStyle(a, '::after').content)).toContain(name);
  }
  await expect(nav.getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute('aria-current', 'page');
  // Main scrolls above the bar, so its last row is never hidden behind it.
  const mainBottom = await page.locator('.fl-main').evaluate((m) => m.getBoundingClientRect().bottom);
  expect(mainBottom).toBeLessThanOrEqual(box?.y ?? 0);
});

test('the account menu opens above the tab bar', async ({ page }) => {
  await open(page, 'overview');
  await page.locator('[data-slot="avatar"]').tap();
  const menu = page.locator('#fl-account');
  await expect(menu).toBeVisible();
  const [menuBox, railBox] = await Promise.all([menu.boundingBox(), page.locator('.fl-rail').boundingBox()]);
  expect((menuBox?.y ?? 0) + (menuBox?.height ?? 0)).toBeLessThanOrEqual(railBox?.y ?? 0);
  expect((menuBox?.x ?? 0) + (menuBox?.width ?? 0)).toBeLessThanOrEqual(390);
});

test('table rows show as cards with every row in reach, no sideways swipe', async ({ page }) => {
  await open(page, 'projects');
  const wrap = page.locator('.fl-tablewrap');
  expect(await wrap.evaluate((w) => w.scrollWidth <= w.clientWidth)).toBe(true);
  const rows = page.locator('.fl-table tbody tr');
  expect(await rows.count()).toBe(4);
  const row = rows.first();
  for (const label of ['Status', 'Next action', 'Last progress']) {
    await expect(row.locator(`td[data-label="${label}"]`)).toBeVisible();
  }
  await expect(row.getByText('+0d')).toBeVisible();
  // The last card is reachable by scrolling the page.
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows.last().getByRole('link')).toBeInViewport();
  await expect(page.getByRole('table', { name: /Projects/ })).toBeAttached();
});

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
