import { expect, test } from '@playwright/test';
import { scene, trackErrors } from './helpers';

test('walks boot → title → character select → mission select without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?host=flat&seed=1&frames=0');
  await page.waitForFunction(() => window.__arcadeReady === true);
  expect(await scene(page)).toBe('boot');

  // A first visit plays the whole boot (6.4 s) before a short black cut to the title.
  await page.evaluate(() => window.__arcade?.step(400));
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

test('lets a returning visitor skip the boot after a second, but not a first-time visitor', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?host=flat&seed=1&frames=70');
  await page.waitForFunction(() => window.__arcadeReady === true);
  await page.evaluate(() => {
    window.__arcade?.press('confirm', 2);
    window.__arcade?.step(20);
  });
  expect(await scene(page)).toBe('boot');

  await page.evaluate(() => localStorage.setItem('reo-leo:session', JSON.stringify({ version: 1, bootSeen: true })));
  await page.reload();
  await page.waitForFunction(() => window.__arcadeReady === true);
  await page.evaluate(() => {
    window.__arcade?.press('confirm', 2);
    window.__arcade?.step(20);
  });
  expect(await scene(page)).toBe('title');
  expect(errors).toEqual([]);
});

test('shows the title variants the params name, and refuses unknown ones by name', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?host=flat&scene=title&params={"lockup":"classic","backdrop":"classic"}&frames=120');
  await page.waitForFunction(() => window.__arcadeReady === true);
  expect(await scene(page)).toBe('title');
  expect(errors).toEqual([]);

  await page.goto('/?host=flat&scene=title&params={"backdrop":"volcano"}&frames=120');
  await expect.poll(() => errors.join('\n'), { timeout: 15_000 }).toContain('unknown backdrop "volcano"');
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
