import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function axe(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

const dialog = (page: Page, name: string): Locator => page.getByRole('dialog', { name });

for (const theme of ['dark', 'light'] as const) {
  test(`Overview cards show the screenshot, the framed live site and Netlify deploys (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('fl-theme', t), theme);
    await page.goto('/tests/e2e/fixtures/overview.html?sites');
    await expect(page.locator('body[data-ready]')).toBeAttached();

    const finishline = page.locator('fl-project-card[href="/p/finishline"]');
    await expect(finishline.locator('.fl-site__frame img')).toBeVisible();

    const devlog = page.locator('fl-project-card[href="/p/devlog"]');
    const frame = devlog.locator('.fl-site__frame iframe');
    await expect(frame).toHaveAttribute('title', 'Live preview of DevLog');
    await expect(page.frameLocator('fl-project-card[href="/p/devlog"] iframe').getByRole('heading', { name: 'DevLog' })).toBeAttached();
    // The thumbnail is never a tab stop; the caption links are.
    await expect(devlog.locator('.fl-site__frame')).toHaveAttribute('inert', '');
    await expect(devlog.getByRole('link', { name: /DevLog live site/ })).toHaveAttribute('target', '_blank');
    await expect(devlog.getByRole('link', { name: /Deployed 2h ago/ })).toHaveAttribute('href', 'https://app.netlify.com/projects/devlog/deploys');
    await expect(devlog.getByRole('link', { name: /Preview #12/ })).toHaveAttribute('href', 'https://deploy-preview-12--devlog.netlify.app');

    // The frame scales the desktop-width page down to the card.
    const box = await devlog.locator('.fl-site__frame').boundingBox();
    const inner = await frame.boundingBox();
    expect(Math.abs((inner?.width ?? 0) - (box?.width ?? 0))).toBeLessThan(3);
    await axe(page);
  });
}

test('Edit sets the site URL, links a Netlify site and uploads a screenshot', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/projects.html');
  await expect(page.locator('body[data-ready]')).toBeAttached();
  await page.getByRole('button', { name: 'Edit Univia' }).click();
  const form = dialog(page, 'Edit “Univia”');
  const url = form.getByRole('textbox', { name: 'Site URL (optional)' });
  const netlify = form.getByRole('combobox', { name: 'Netlify site (optional)' });
  await expect(netlify.getByRole('option', { name: 'univia' })).toBeAttached();
  await axe(page);

  await url.fill('http://univia.help');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form.getByText('Use a full link that starts with https://.')).toBeVisible();
  await expect(url).toBeFocused();

  await url.fill('https://univia.help');
  await netlify.selectOption({ label: 'univia' });
  await form.getByLabel('Screenshot (optional)').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from('89504e47', 'hex') });
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toBeHidden();

  const saved = await page.evaluate(() => {
    const s = (window as unknown as { fixtureSite: { saved: { id: string; change: { siteUrl: string; netlifySiteId: string; screenshot: { kind: string } } }[] } }).fixtureSite;
    return s.saved.map((x) => ({ id: x.id, siteUrl: x.change.siteUrl, netlifySiteId: x.change.netlifySiteId, screenshot: x.change.screenshot.kind }));
  });
  expect(saved).toEqual([{ id: 'b', siteUrl: 'https://univia.help', netlifySiteId: '00000000-0000-4000-8000-000000000002', screenshot: 'replace' }]);
});

test('Edit says when Netlify is not connected and still saves the site URL', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/projects.html?netlify=off');
  await expect(page.locator('body[data-ready]')).toBeAttached();
  await page.getByRole('button', { name: 'Edit Univia' }).click();
  const form = dialog(page, 'Edit “Univia”');
  await expect(form.getByText('Netlify isn’t connected yet. Add a Netlify token to link a site.')).toBeVisible();
  await expect(form.getByRole('combobox', { name: 'Netlify site (optional)' })).toBeDisabled();
  await form.getByRole('textbox', { name: 'Site URL (optional)' }).fill('https://univia.help');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toBeHidden();
});

test('Edit from the side panel has the same site fields and saves them', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/projects.html?drawer');
  await expect(page.locator('body[data-ready]')).toBeAttached();
  const panel = page.locator('.fl-drawer__inner');
  await panel.getByRole('tab', { name: 'Projects' }).click();
  await panel.getByRole('button', { name: 'Edit Univia' }).click();
  const form = dialog(page, 'Edit “Univia”');
  await expect(form.getByRole('combobox', { name: 'Netlify site (optional)' }).getByRole('option', { name: 'univia' })).toBeAttached();
  await form.getByRole('textbox', { name: 'Site URL (optional)' }).fill('https://univia.help');
  await form.getByRole('button', { name: 'Save changes' }).click();
  await expect(form).toBeHidden();
  const saved = await page.evaluate(() => {
    const s = (window as unknown as { fixtureSite: { saved: { id: string; change: { siteUrl: string } }[] } }).fixtureSite;
    return s.saved.map((x) => ({ id: x.id, siteUrl: x.change.siteUrl }));
  });
  expect(saved).toEqual([{ id: 'b', siteUrl: 'https://univia.help' }]);
});

test('the project editor fills most of the screen and lays the fields out in columns', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/projects.html');
  await expect(page.locator('body[data-ready]')).toBeAttached();
  await page.getByRole('button', { name: 'Edit Univia' }).click();
  const form = dialog(page, 'Edit “Univia”');
  const box = await form.boundingBox();
  const viewport = page.viewportSize();
  // 90% of the window, capped at 1400px on very wide screens.
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(Math.min((viewport?.width ?? 0) * 0.85, 1390));
  const name = await form.getByRole('textbox', { name: 'Name' }).boundingBox();
  const summary = await form.getByRole('textbox', { name: 'What is it? (optional)' }).boundingBox();
  // Side by side, not stacked.
  expect(Math.abs((name?.y ?? 0) - (summary?.y ?? 1))).toBeLessThan(4);
  await expect(form.getByRole('button', { name: 'Save changes' })).toBeInViewport();
  await axe(page);
});
