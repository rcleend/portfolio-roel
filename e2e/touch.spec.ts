import { expect, test } from '@playwright/test';
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

test('portrait navigation reaches the desk and cabinet and returns to the TV', async ({ page }) => {
  await page.goto('/?seed=1');
  await waitForRunning(page);
  await page.touchscreen.tap(195, 90);
  await page.waitForTimeout(1300);
  const host = hostElement(page);
  const desk = page.getByRole('button', { name: 'Zoom in on desktop' });
  await desk.tap();
  await expect(host).toHaveAttribute('data-view', 'desk');
  await expect(page.locator('.touchpad')).toHaveAttribute('data-visible', 'false');
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: 'Zoom in on radio and lava lamp' }).tap();
  await expect(host).toHaveAttribute('data-view', 'drawer');
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: 'Room', exact: true }).tap();
  await expect(host).toHaveAttribute('data-view', 'room');
  await page.waitForTimeout(1300);
  await page.getByRole('button', { name: 'Return to TV' }).tap();
  await expect(host).toHaveAttribute('data-view', 'tv');
  await expect(page.locator('.touchpad')).toHaveAttribute('data-visible', 'true');
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
