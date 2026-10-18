import { expect, test, type Page } from '@playwright/test';

// The sign-in stage: lanes and runners loop behind the pitch. Motion must be pausable
// (WCAG 2.2.2), stop under reduced motion, and never get between the user and the sign-in button.

async function runnerAnimation(page: Page): Promise<{ name: string; state: string }> {
  return page.locator('.fl-lanefield__runner').first().evaluate((r) => {
    const style = getComputedStyle(r);
    return { name: style.animationName, state: style.animationPlayState };
  });
}

test('the sign-in card sits beside the stage and its button is the first stop', async ({ page }) => {
  await page.goto('/');
  const card = await page.locator('.fl-signin__panel').boundingBox();
  const stage = await page.locator('.fl-signin__hero').boundingBox();
  expect(card && stage && card.x > stage.x + stage.width).toBe(true);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeFocused();
});

test('the pitch stays readable: its own heading, on the stage', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Less starting. More shipping.', level: 2 })).toBeVisible();
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
