import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import type {} from '../src/room/lab/main';
import { GPU_LAUNCH_ARGS } from './gpu';
import { trackErrors } from './helpers';

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS } });

/**
 * Shader programs the room lab has compiled after its first room view, measured at 2494ded
 * before the computer existed (Metal ANGLE). The computer must not add one.
 */
const BASE_PROGRAMS = 7;

async function openLab(page: Page, query = ''): Promise<void> {
  await page.goto(`/room-lab.html?clean&mockpc=1${query}`);
  await page.waitForFunction(() => window.__roomLab !== undefined);
  await page.evaluate(() => window.__roomLab?.room.ready);
}

/** Powered on, looked around the room once, then sat down at the computer. */
async function atComputer(page: Page): Promise<void> {
  await openLab(page);
  await page.waitForFunction(() => window.__roomLab?.surface.paused === false, null, { timeout: 20_000 });
  await page.evaluate(() => window.__roomLab?.room.showRoom());
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.__roomLab?.room.focusPc());
  await page.waitForFunction(() => window.__roomLab?.room.pc.live === true);
  // Past the live screen's 160 ms fade.
  await page.waitForTimeout(300);
}

const stats = (page: Page) => page.evaluate(() => window.__roomLab?.room.stats);

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    test('lays the live screen over the picture and then renders nothing', async ({ page }) => {
      const errors = trackErrors(page);
      await atComputer(page);
      const screen = page.locator('[data-pc-screen]');
      await expect(screen).toHaveAttribute('data-live', 'true');
      const placement = await page.evaluate(() => window.__roomLab?.room.pc.placement);
      const box = await screen.boundingBox();
      if (!placement || !box) throw new Error('No live screen');
      expect(Math.abs(box.x - placement.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.y - placement.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.width - placement.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(box.height - placement.height)).toBeLessThanOrEqual(1);

      const before = await stats(page);
      await page.waitForTimeout(1000);
      const after = await stats(page);
      expect(after?.framesRendered).toBe(before?.framesRendered);
      expect(after?.programs).toBe(BASE_PROGRAMS);
      expect(after?.pcTexturePixels).toBeGreaterThan(0);
      expect(after?.pcTexturePixels).toBeLessThanOrEqual(1024 * 817);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('at 1440 × 900', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('hides the screen the moment the camera is asked to leave', async ({ page }) => {
    await atComputer(page);
    const hidden = await page.evaluate(() => {
      const room = window.__roomLab?.room;
      room?.showRoom();
      const element = document.querySelector<HTMLElement>('[data-pc-screen]');
      return { live: room?.pc.live, visibility: element?.style.visibility, data: element?.dataset.live };
    });
    expect(hidden).toEqual({ live: false, visibility: 'hidden', data: 'false' });
    await expect(page.locator('[data-pc-screen]')).toBeHidden();
  });

  test('renders exactly one frame for a light change', async ({ page }) => {
    await atComputer(page);
    const frames = async (change: () => void) => {
      const start = (await stats(page))?.framesRendered ?? 0;
      await page.evaluate(change);
      await page.waitForTimeout(300);
      return ((await stats(page))?.framesRendered ?? 0) - start;
    };
    expect(await frames(() => window.__roomLab?.room.pc.setLight({ r: 0.8, g: 0.8, b: 0.8 }))).toBe(1);
    expect(await frames(() => window.__roomLab?.room.pc.setLight({ r: 0.8, g: 0.8, b: 0.8 }))).toBe(0);
    expect(await frames(() => window.__roomLab?.room.pc.setLight(null))).toBe(1);
  });

  test('never shows the screen when the visitor turns back during the flight in', async ({ page }) => {
    await openLab(page);
    await page.waitForFunction(() => window.__roomLab?.surface.paused === false, null, { timeout: 20_000 });
    await page.evaluate(() => {
      const room = window.__roomLab?.room;
      const seen: boolean[] = [];
      room?.pc.onLiveChange((live) => seen.push(live));
      (window as unknown as { __liveSeen: boolean[] }).__liveSeen = seen;
      room?.focusPc();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__roomLab?.room.showRoom());
    await page.waitForTimeout(1800);
    expect(await page.evaluate(() => (window as unknown as { __liveSeen: boolean[] }).__liveSeen)).toEqual([]);
    expect(await page.evaluate(() => window.__roomLab?.room.view)).toBe('room');
    await expect(page.locator('[data-pc-screen]')).toHaveAttribute('data-live', 'false');
  });

  test.describe('on a retina screen', () => {
    test.use({ deviceScaleFactor: 2 });

    test('hands over from the still to the live screen without a visible step', async ({ page }) => {
      await atComputer(page);
      const placement = await page.evaluate(() => window.__roomLab?.room.pc.placement);
      if (!placement) throw new Error('No placement');
      // Inside the picture: its rounded corners and anti-aliased rim are not content.
      const clip = {
        x: placement.left + 4,
        y: placement.top + 4,
        width: placement.width - 8,
        height: placement.height - 8,
      };
      const live = await page.screenshot({ clip });
      await page.evaluate(() => {
        const element = document.querySelector<HTMLElement>('[data-pc-screen]');
        if (element) element.style.visibility = 'hidden';
      });
      await page.waitForTimeout(100);
      const still = await page.screenshot({ clip });
      const [a, b] = await Promise.all([live, still].map((png) => sharp(png).removeAlpha().raw().toBuffer()));
      if (!a || !b) throw new Error('No screenshots');
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += Math.abs((a[i] as number) - (b[i] as number));
      expect(sum / a.length).toBeLessThanOrEqual(3);
    });
  });
});
