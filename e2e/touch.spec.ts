import { expect, test } from '@playwright/test';
import type {} from '../src/app/hosts/RoomHost';
import { GPU_LAUNCH_ARGS } from './gpu';
import { hostElement, scene, tapWayOut, waitForRunning } from './helpers';

test.use({
  launchOptions: { args: GPU_LAUNCH_ARGS },
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test('the title waits for a tap anywhere, then the gamepad fades in and drives the game', async ({ page }) => {
  await page.goto('/?seed=1&scene=title&frames=60');
  await waitForRunning(page);
  await page.evaluate(() => window.__arcade?.resume());
  const pad = page.locator('.touchpad');
  // "PRESS TO BEGIN": no buttons yet, a tap on the picture begins.
  await expect(pad).toHaveAttribute('data-visible', 'false');
  await page.touchscreen.tap(195, 300);
  await expect.poll(() => scene(page), { timeout: 5_000 }).toBe('characterSelect');
  await expect(pad).toHaveAttribute('data-visible', 'true');
  // A (jump) confirms, once the select screen has come in.
  await page.waitForTimeout(1000);
  await page.locator('[data-control="jump"]').tap();
  await expect.poll(() => scene(page), { timeout: 10_000 }).toBe('levelSelect');
});

test('leaves the game by a tap above the set or its way out, and hides the gamepad while looking around the room', async ({
  page,
}) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  // A tap under the picture, on the pad's plate, is too easy while playing: it does nothing.
  await page.touchscreen.tap(195, 560);
  await page.waitForTimeout(1300);
  await expect(hostElement(page)).toHaveAttribute('data-view', 'tv');
  // Above the set, the room is a tap away, as the popup is.
  await page.touchscreen.tap(195, 90);
  await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  const tv = await page.evaluate(() => window.__room?.anchors.find((anchor) => anchor.target === 'tv'));
  if (!tv) throw new Error('No TV anchor');
  await page.touchscreen.tap(tv.x, tv.y);
  await expect(hostElement(page)).toHaveAttribute('data-view', 'tv');
  await page.waitForTimeout(1300);
  await tapWayOut(page);
  await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
  await expect(page.locator('.touchpad')).toHaveAttribute('data-visible', 'false');
});

test('the menu reaches the computer the portrait room view crops out', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  const pad = page.locator('.touchpad');
  await tapWayOut(page);
  await page.waitForTimeout(1300);
  const item = page.getByRole('button', { name: 'About me (CV)' });
  await expect(item).toBeVisible();
  const box = await item.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  // Large in the middle of the room, the props without their glow and labels (no pointer to point with).
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - 195)).toBeLessThan(4);
  expect(box?.y ?? 0).toBeGreaterThan(844 / 4);
  await expect(item).toHaveText('About');
  await expect(page.locator('.prop-label')).toHaveCount(0);

  await item.tap();
  await expect(host).toHaveAttribute('data-view', 'pc');
  await expect(pad).toHaveAttribute('data-visible', 'false');
  await expect(page.locator('[data-pc-screen]')).toHaveAttribute('data-live', 'true', { timeout: 3_000 });

  // The window above the monitor is outside the computer: up again.
  await page.touchscreen.tap(195, 60);
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  const tv = await page.evaluate(() => window.__room?.anchors.find((anchor) => anchor.target === 'tv'));
  if (!tv) throw new Error('No TV anchor');
  await page.touchscreen.tap(tv.x, tv.y);
  await expect(host).toHaveAttribute('data-view', 'tv');
  // Still on the title: the pad waits for the press that begins.
  await expect(pad).toHaveAttribute('data-visible', 'false');
});

test('a tap on the radio in the portrait room view flies to the CD player', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  await tapWayOut(page);
  await page.waitForTimeout(1300);
  const radio = await page.evaluate(() => window.__room?.anchors.find((anchor) => anchor.target === 'radio'));
  if (!radio?.inFrame) throw new Error('The radio is not in the portrait room view');
  await page.touchscreen.tap(radio.x, radio.y);
  await expect(host).toHaveAttribute('data-view', 'radio');
  await expect(page.locator('.touchpad')).toHaveAttribute('data-visible', 'false');
  await page.waitForTimeout(1400);
  // The wall above the open radio is outside it: back to the room.
  await page.touchscreen.tap(30, 30);
  await expect(host).toHaveAttribute('data-view', 'room');
});

test.describe('landscape', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('keeps both control clusters clear of the centre', async ({ page }) => {
    await page.goto('/?seed=1');
    await waitForRunning(page);
    const dpad = await page.locator('.touchpad__cluster--dpad').boundingBox();
    const buttons = await page.locator('.touchpad__cluster--buttons').boundingBox();
    expect(dpad && dpad.x + dpad.width).toBeLessThan(200);
    expect(buttons?.x).toBeGreaterThan(844 - 200);
  });
});
