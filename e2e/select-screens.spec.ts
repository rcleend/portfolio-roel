import { expect, type Page, test } from '@playwright/test';
import { clickScreen, scene, trackErrors } from './helpers';

/**
 * Native pixels on the CONFIRM and BACK keys of each select screen (`KEY_HINTS`
 * in each scene's layout.ts). The legend is right-aligned, so BACK is the
 * rightmost key and CONFIRM sits left of it.
 */
const KEYS = {
  characterSelect: { confirm: { x: 236, y: 222 }, back: { x: 300, y: 222 } },
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
