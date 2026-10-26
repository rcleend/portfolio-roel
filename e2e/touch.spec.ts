import { expect, test } from '@playwright/test';
import type {} from '../src/app/hosts/RoomHost';
import { GPU_LAUNCH_ARGS } from './gpu';
import { hostElement, scene, waitForRunning } from './helpers';

test.use({
  launchOptions: { args: GPU_LAUNCH_ARGS },
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test('shows the gamepad on touch screens and drives the game with it', async ({ page }) => {
  await page.goto('/?seed=1&scene=title&frames=60');
  await waitForRunning(page);
  await page.evaluate(() => window.__arcade?.resume());
  const pad = page.locator('.touchpad');
  await expect(pad).toHaveAttribute('data-visible', 'true');
  await page.locator('[data-control="start"]').tap();
  await expect.poll(() => scene(page), { timeout: 5_000 }).toBe('characterSelect');
});

test('hides the gamepad while looking around the room', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  await page.touchscreen.tap(195, 90);
  await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
  await expect(page.locator('.touchpad')).toHaveAttribute('data-visible', 'false');
});

test('a chip on the edge reaches the computer the portrait room view crops out', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  const pad = page.locator('.touchpad');
  await page.touchscreen.tap(195, 90);
  await page.waitForTimeout(1300);
  const chip = page.getByRole('button', { name: 'Use the computer' });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveText(/COMPUTER/i);
  const box = await chip.boundingBox();
  expect(box?.x).toBeLessThan(30);
  expect(box?.height).toBeGreaterThanOrEqual(44);

  await chip.tap();
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
  await expect(pad).toHaveAttribute('data-visible', 'true');
});

test('a tap on the radio in the portrait room view flies to the CD player', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  const host = hostElement(page);
  await page.touchscreen.tap(195, 90);
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
