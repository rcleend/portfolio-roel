import { expect, test } from '@playwright/test';
import { GPU_LAUNCH_ARGS } from './gpu';
import { hostElement, paused, phase, scene, trackErrors, waitForRunning } from './helpers';

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS }, viewport: { width: 1440, height: 900 } });

/** Centre of the TV picture in the 1440 × 900 room view (see scripts/room-shots.mjs). */
const TV_IN_ROOM_VIEW = { x: 1202, y: 529 };

test('opens on the TV, powers it on and only then boots the game', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?seed=1');
  await expect(page.getByRole('progressbar', { name: 'Loading the arcade' })).toBeAttached();
  await expect(hostElement(page)).toHaveAttribute('data-host', 'room');

  await expect.poll(() => phase(page), { timeout: 30_000, intervals: [25] }).toBe('powering');
  // The tube is warming up: the game has not been started (or exposed) yet.
  expect(await page.evaluate(() => window.__arcade === undefined)).toBe(true);

  await waitForRunning(page);
  expect(await scene(page)).toBe('boot');
  expect(await paused(page)).toBe(false);
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('looking around the room pauses the game and the TV resumes it', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);

  await page.mouse.click(40, 450);
  await expect(host).toHaveAttribute('data-view', 'room');
  await expect.poll(() => paused(page)).toBe(true);
  const frame = await page.evaluate(() => window.__arcade?.state().frame);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__arcade?.state().frame)).toBe(frame);

  await page.waitForTimeout(1300); // let the camera land before aiming at the TV
  await page.mouse.click(TV_IN_ROOM_VIEW.x, TV_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'tv');
  await expect.poll(() => paused(page), { timeout: 5_000 }).toBe(false);
  expect(errors).toEqual([]);
});

test('Enter on the stage returns from the room view', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  await page.mouse.click(40, 450);
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'tv');
  await expect.poll(() => paused(page), { timeout: 5_000 }).toBe(false);
});

test('the game takes keys only while the TV has focus', async ({ page }) => {
  await page.goto('/?seed=1&scene=title&frames=60');
  await waitForRunning(page);
  await page.evaluate(() => window.__arcade?.resume());
  const stage = page.getByRole('application');
  await expect(stage).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('link', { name: 'Skip to résumé' })).toBeFocused();
  await page.keyboard.press('z');
  await page.waitForTimeout(300);
  expect(await scene(page)).toBe('title');

  await page.keyboard.press('Tab');
  await expect(stage).toBeFocused();
  await page.keyboard.press('z');
  await expect.poll(() => scene(page), { timeout: 5_000 }).toBe('characterSelect');
});

test('the sound toggle is reachable by keyboard and remembers the choice', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const toggle = page.getByRole('button', { name: 'Mute sound' });
  await page.keyboard.press('Tab');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const session = await page.evaluate(() => window.__arcade?.state().session);
  expect(session).toMatchObject({ muted: true });

  await page.reload();
  await waitForRunning(page);
  await expect(page.getByRole('button', { name: 'Mute sound' })).toHaveAttribute('aria-pressed', 'true');
});

test('teaches the room gestures, then retires the hints', async ({ page }) => {
  await page.clock.install();
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const hint = page.locator('.view-hint');
  await page.clock.runFor(5_000);
  await expect(hint).toHaveText(/Click outside the TV to look around/);
  await page.mouse.click(40, 450);
  await page.clock.runFor(2_000);
  await expect(hint).toHaveText(/Click the TV to keep playing/);
  await expect(hint).toHaveAttribute('data-visible', 'true');
  await page.clock.runFor(200);
  await page.mouse.click(TV_IN_ROOM_VIEW.x, TV_IN_ROOM_VIEW.y);
  await page.clock.runFor(6_000);
  await expect(hint).toHaveAttribute('data-visible', 'false');
});
