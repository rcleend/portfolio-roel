import { expect, type Page, test } from '@playwright/test';
import { clickScreen, scene, trackErrors } from './helpers';

/**
 * Native pixels on the CONFIRM and BACK keys of each select screen (`KEY_HINTS`
 * in each scene's layout.ts). The legend is right-aligned, so BACK is the
 * rightmost key and CONFIRM sits left of it.
 */
const KEYS = {
  characterSelect: { confirm: { x: 236, y: 222 }, back: { x: 300, y: 222 } },
  levelSelect: { confirm: { x: 240, y: 225 }, back: { x: 304, y: 225 } },
} as const;

/** Opens a scene paused, so every click is played out by explicit steps. */
async function open(page: Page, sceneId: string): Promise<void> {
  await page.goto(`/?host=flat&seed=1&scene=${sceneId}&frames=30`);
  await page.waitForFunction(() => window.__arcadeReady === true);
}

async function step(page: Page, frames: number): Promise<void> {
  await page.evaluate((count) => window.__arcade?.step(count), frames);
}

test.describe('character select keys', () => {
  test('CONFIRM picks the hero on screen', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page, 'characterSelect');
    await clickScreen(page, KEYS.characterSelect.confirm);
    await step(page, 150);
    expect(await scene(page)).toBe('levelSelect');
    expect(await page.evaluate(() => window.__arcade?.state().session)).toMatchObject({ characterId: 'hackerman' });
    expect(errors).toEqual([]);
  });

  test('BACK returns to the title', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page, 'characterSelect');
    await clickScreen(page, KEYS.characterSelect.back);
    await step(page, 60);
    expect(await scene(page)).toBe('title');
    expect(errors).toEqual([]);
  });
});

test.describe('mission select keys', () => {
  test('CONFIRM deploys into the focused mission', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page, 'levelSelect');
    await clickScreen(page, KEYS.levelSelect.confirm);
    await step(page, 120);
    expect(await scene(page)).toBe('level');
    expect(errors).toEqual([]);
  });

  test('BACK returns to the character select', async ({ page }) => {
    const errors = trackErrors(page);
    await open(page, 'levelSelect');
    await clickScreen(page, KEYS.levelSelect.back);
    await step(page, 60);
    expect(await scene(page)).toBe('characterSelect');
    expect(errors).toEqual([]);
  });
});

test('the menus show their hand for the keys and hide it while the mouse plays', async ({ page }) => {
  await page.goto('/?host=flat&scene=characterSelect&seed=1');
  await page.waitForFunction(() => window.__arcadeReady === true);
  const pointing = () => page.evaluate(() => window.__arcade?.state().pointing);
  const screen = page.locator('.tv__screen');
  await screen.focus();
  expect(await pointing()).toBe(false);
  const box = await screen.boundingBox();
  if (!box) throw new Error('No TV screen');
  // Over the picture with the mouse: the hand goes.
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.2);
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.22);
  await expect.poll(pointing).toBe(true);
  // A navigation key brings it back, live.
  await page.keyboard.press('ArrowDown');
  await expect.poll(pointing).toBe(false);
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.25);
  await expect.poll(pointing).toBe(true);
});
