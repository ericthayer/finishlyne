import { expect, test, type Page } from '@playwright/test';

// The sign-in stage: lanes and runners loop behind the pitch. Motion must be pausable
// (WCAG 2.2.2), stop under reduced motion, and never get between the user and the sign-in button.

async function runnerAnimation(page: Page): Promise<{ name: string; state: string }> {
  return page.locator('.fl-lanefield__runner').first().evaluate((r) => {
    const style = getComputedStyle(r);
    return { name: style.animationName, state: style.animationPlayState };
  });
}

test('the sign-in card sits on the stage, clear of the pitch, and its button is the first stop', async ({ page }) => {
  await page.goto('/');
  const card = await page.locator('.fl-signin__panel').boundingBox();
  const pitch = await page.locator('.fl-signin__pitch').boundingBox();
  const stage = await page.locator('.fl-signin__hero').boundingBox();
  expect(card && pitch && stage).toBeTruthy();
  if (!card || !pitch || !stage) return;
  expect(card.x).toBeGreaterThanOrEqual(pitch.x + pitch.width);
  expect(card.x + card.width).toBeLessThanOrEqual(stage.x + stage.width);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeFocused();
});

test('the pitch stays readable: its own heading, upright, two lines at any width', async ({ page }) => {
  await page.goto('/');
  const heading = page.getByRole('heading', { name: 'Less starting. More shipping.', level: 2 });
  await expect(heading).toBeVisible();
  // Only the stage plane turns; the text never does.
  expect(await heading.evaluate((h) => getComputedStyle(h).transform)).toBe('none');
  const lines = (): Promise<number> =>
    heading.evaluate((h) => Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)));
  expect(await lines()).toBe(2);
  // Just above the wide breakpoint the pitch column is at its narrowest.
  for (const width of [920, 1024]) {
    await page.setViewportSize({ width, height: 768 });
    expect(await lines(), `${width}px`).toBe(2);
  }
  await expect(page.getByRole('region', { name: 'Less starting. More shipping.' })).toBeVisible();
});

test('the stage animation pauses and plays from its button', async ({ page }) => {
  await page.goto('/');
  const pause = page.getByRole('button', { name: 'Pause animation' });
  await expect(pause).toBeVisible();
  expect(await runnerAnimation(page)).toMatchObject({ state: 'running' });

  await pause.click();
  await expect(page.locator('fl-lane-field')).toHaveAttribute('paused', '');
  expect(await runnerAnimation(page)).toMatchObject({ state: 'paused' });

  await page.getByRole('button', { name: 'Play animation' }).click();
  await expect(page.locator('fl-lane-field')).not.toHaveAttribute('paused');
  expect(await runnerAnimation(page)).toMatchObject({ state: 'running' });
});

test('reduced motion shows a still frame and no pause button', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('.fl-lanefield__runner').first()).toBeAttached();
  expect(await runnerAnimation(page)).toMatchObject({ name: 'none' });
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeHidden();
});
