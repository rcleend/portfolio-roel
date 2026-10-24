import { expect, test } from '@playwright/test';
import { GPU_LAUNCH_ARGS } from './gpu';
import { hostElement, paused, phase, scene, trackErrors, waitForRunning } from './helpers';

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS }, viewport: { width: 1440, height: 900 } });

/** Centre of the TV picture in the 1440 × 900 room view (see scripts/room-shots.mjs). */
const TV_IN_ROOM_VIEW = { x: 1202, y: 529 };
/** Centre of the computer's picture in the 1440 × 900 room view: the lab's `room.anchors`. */
const PC_IN_ROOM_VIEW = { x: 375, y: 455 };
/** Bare wall beside the window, outside every prop in the room and at the computer. */
const WALL = { x: 40, y: 450 };
/** The radio and the cabinet it stands on in the 1440 × 900 room view (`room.anchors` puts the radio at 814, 447). */
const RADIO_IN_ROOM_VIEW = { x: 805, y: 446 };
const CABINET_IN_ROOM_VIEW = { x: 780, y: 545 };

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

  await page.mouse.click(WALL.x, WALL.y);
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
  await page.mouse.click(WALL.x, WALL.y);
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'tv');
  await expect.poll(() => paused(page), { timeout: 5_000 }).toBe(false);
});

test('clicking the computer sits down at it and clicking the wall gets up again', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  const screen = page.locator('[data-pc-screen]');
  await page.mouse.click(WALL.x, WALL.y);
  await page.waitForTimeout(1300);

  await page.mouse.click(PC_IN_ROOM_VIEW.x, PC_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'pc');
  await expect.poll(() => paused(page)).toBe(true);
  const frame = await page.evaluate(() => window.__arcade?.state().frame);
  await expect(screen).toHaveAttribute('data-live', 'true', { timeout: 3_000 });
  expect(await page.evaluate(() => window.__arcade?.state().frame)).toBe(frame);

  await page.mouse.click(WALL.x, WALL.y);
  // Hidden in the same task as the click, before any flight frame.
  expect(await screen.getAttribute('data-live')).toBe('false');
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  await page.mouse.click(TV_IN_ROOM_VIEW.x, TV_IN_ROOM_VIEW.y);
  await expect.poll(() => paused(page), { timeout: 5_000 }).toBe(false);
  expect(errors).toEqual([]);
});

test('Escape during the flight to the computer returns to the room without showing the screen', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  await page.mouse.click(WALL.x, WALL.y);
  await page.waitForTimeout(1300);
  await page.evaluate(() => {
    const seen: string[] = [];
    const screen = document.querySelector('[data-pc-screen]');
    new MutationObserver(() => seen.push(screen?.getAttribute('data-live') ?? '')).observe(screen as Element, {
      attributeFilter: ['data-live'],
    });
    (window as unknown as { __liveSeen: string[] }).__liveSeen = seen;
  });
  await page.mouse.click(PC_IN_ROOM_VIEW.x, PC_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'pc');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => (window as unknown as { __liveSeen: string[] }).__liveSeen)).not.toContain('true');
  await expect(page.locator('[data-pc-screen]')).toHaveAttribute('data-live', 'false');
});

test('the keyboard reaches the computer and the TV without the mouse', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  await page.keyboard.press('Tab');
  const lookAround = page.getByRole('button', { name: 'Look around the room' });
  await expect(lookAround).toBeFocused();
  await expect(lookAround).toHaveCSS('clip-path', 'none');
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'room');
  await expect(host).toBeFocused();
  await page.waitForTimeout(1300);

  await page.keyboard.press('Tab');
  const computer = page.getByRole('button', { name: 'Use the computer' });
  await expect(computer).toBeFocused();
  await expect(computer).toBeVisible();
  await expect(computer).toHaveCSS('clip-path', 'none');
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'pc');
  await expect(page.locator('[data-pc-screen]')).toHaveAttribute('data-live', 'true', { timeout: 3_000 });
  await expect(page.getByRole('navigation', { name: 'Look closer' })).toHaveCount(0);

  // Escape on the stage gets up again.
  await host.focus();
  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Watch the TV' })).toBeFocused();
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
  // Past the TV view's "Look around the room".
  await page.keyboard.press('Tab');
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
  await page.mouse.click(WALL.x, WALL.y);
  await page.clock.runFor(2_000);
  await expect(hint).toHaveText(/Click the computer, the radio or the TV to look closer/);
  await expect(hint).toHaveAttribute('data-visible', 'true');
  await page.mouse.click(PC_IN_ROOM_VIEW.x, PC_IN_ROOM_VIEW.y);
  await page.clock.runFor(2_500);
  await expect(hint).toHaveText(/Click outside the computer to look around/);
  await expect(hint).toHaveAttribute('data-visible', 'true');
  await page.mouse.click(WALL.x, WALL.y);
  await page.clock.runFor(2_000);
  await expect(hint).toHaveText(/Click the computer, the radio or the TV to look closer/);
  await page.mouse.click(PC_IN_ROOM_VIEW.x, PC_IN_ROOM_VIEW.y);
  await page.clock.runFor(2_500);
  // Got up from the computer once: that line has retired.
  await expect(hint).toHaveAttribute('data-visible', 'false');
  await page.mouse.click(WALL.x, WALL.y);
  await page.clock.runFor(2_000);
  await page.mouse.click(TV_IN_ROOM_VIEW.x, TV_IN_ROOM_VIEW.y);
  await page.clock.runFor(6_000);
  await expect(hint).toHaveAttribute('data-visible', 'false');
});

test('the radio and the cabinet it stands on fly to the CD player; Escape and the wall get up again', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  await page.mouse.click(WALL.x, WALL.y);
  await page.waitForTimeout(1300);
  await page.mouse.move(RADIO_IN_ROOM_VIEW.x, RADIO_IN_ROOM_VIEW.y);
  expect(await page.evaluate(() => document.querySelector('[data-host] canvas')?.getAttribute('style'))).toContain(
    'zoom-in',
  );
  await page.mouse.click(RADIO_IN_ROOM_VIEW.x, RADIO_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'radio');
  await expect(host).toHaveAttribute('aria-label', /At the CD player/);
  expect(await paused(page)).toBe(true);
  await page.waitForTimeout(1400);
  await host.focus();
  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  await page.mouse.click(CABINET_IN_ROOM_VIEW.x, CABINET_IN_ROOM_VIEW.y);
  await expect(host).toHaveAttribute('data-view', 'radio');
  await page.waitForTimeout(1400);
  await page.mouse.click(WALL.x, 120);
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  await page.mouse.click(TV_IN_ROOM_VIEW.x, TV_IN_ROOM_VIEW.y);
  await expect.poll(() => paused(page), { timeout: 5_000 }).toBe(false);
  expect(errors).toEqual([]);
});

test('the keyboard reaches the radio from the room view', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  for (let press = 0; press < 3; press++) await page.keyboard.press('Tab');
  const radio = page.getByRole('button', { name: 'Play some music' });
  await expect(radio).toBeFocused();
  await expect(radio).toHaveCSS('clip-path', 'none');
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'radio');
  await expect(host).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Look closer' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-view', 'room');
});
