import { expect, type Page, test } from '@playwright/test';
import type {} from '../src/app/harness/harness';

/** Collects console errors and uncaught exceptions so any of them fails the test. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function scene(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__arcade?.state().scene ?? null);
}

test('walks boot → title → character select → mission select without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?host=flat&seed=1&frames=0');
  await page.waitForFunction(() => window.__arcadeReady === true);
  expect(await scene(page)).toBe('boot');

  // Boot auto-advances; fade out + in completes well within 3 s of simulated time.
  await page.evaluate(() => window.__arcade?.step(180));
  expect(await scene(page)).toBe('title');

  await page.evaluate(() => window.__arcade?.press('confirm', 2));
  await page.evaluate(() => window.__arcade?.step(60));
  expect(await scene(page)).toBe('characterSelect');

  await page.evaluate(() => {
    window.__arcade?.press('right');
    window.__arcade?.press('confirm', 2);
    window.__arcade?.step(90);
  });
  expect(await scene(page)).toBe('levelSelect');
  const state = await page.evaluate(() => window.__arcade?.state());
  expect(state?.session).toMatchObject({ characterId: 'artsy', bootSeen: true });

  expect(errors).toEqual([]);
});

test('keeps the résumé in the DOM and reachable from the skip link', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?host=flat');
  await page.waitForFunction(() => window.__arcadeReady === true);
  await expect(page.getByRole('heading', { level: 1, name: 'Roel Leenders' })).toBeAttached();
  await page.keyboard.press('Shift+Tab');
  const skip = page.getByRole('link', { name: 'Skip to résumé' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page.getByRole('heading', { level: 2, name: 'Experience' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('routes keyboard input to the game only while the screen has focus', async ({ page }) => {
  await page.goto('/?host=flat&scene=title&frames=60');
  await page.waitForFunction(() => window.__arcadeReady === true);
  await page.evaluate(() => window.__arcade?.resume());
  const screen = page.getByRole('application');
  await expect(screen).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(screen).not.toBeFocused();
  await page.keyboard.press('z');
  await page.waitForTimeout(300);
  expect(await scene(page)).toBe('title');

  await screen.focus();
  await page.keyboard.press('z');
  await expect.poll(() => scene(page), { timeout: 5_000 }).toBe('characterSelect');
});
