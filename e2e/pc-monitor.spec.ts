import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import type {} from '../src/room/lab/main';
import { GPU_LAUNCH_ARGS } from './gpu';
import { differingPixels, expectRest, trackErrors, untilDrawn } from './helpers';
import { postersShown, ROOM_PROGRAMS, spotlightIn } from './programs';

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS } });

async function openLab(page: Page, query = ''): Promise<void> {
  await page.goto(`/room-lab.html?clean&mockpc=1${query}`);
  await page.waitForFunction(() => window.__roomLab !== undefined);
  await page.evaluate(() => window.__roomLab?.room.ready);
}

/** Powered on, looked around the room once, then sat down at the computer; `query` adds lab parameters (`&mood=rose`). */
async function atComputer(page: Page, query = ''): Promise<void> {
  await openLab(page, query);
  await page.waitForFunction(() => window.__roomLab?.surface.paused === false, null, { timeout: 20_000 });
  await page.evaluate(() => window.__roomLab?.room.showRoom());
  await page.waitForTimeout(1300);
  await postersShown(page, () => stats(page));
  await spotlightIn(page, () => stats(page));
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

    test('lays the live screen over the picture, the room at rest behind it and adding no program', async ({
      page,
    }) => {
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

      // Behind the live screen the room rests (docs/ROOM.md › Frames › At rest). The lab's unfinished room has no
      // air and the lava lamp is out of this frame: nothing moves by itself, and no frame is drawn.
      await expectRest(page, 'at the computer', []);
      const after = await stats(page);
      // The computer adds no program to the room's (e2e/programs.ts).
      expect(after?.programs).toBe(ROOM_PROGRAMS);
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

  // A finished room has air (the rain on the window, which this view shows, and the dust): the room at rest draws for
  // it behind the live screen on the top tier, a desktop's, and lets it rest below that, where the screen covers most
  // of a phone's picture and a page is being read (RoomStage › setReading).
  for (const [tier, moving] of [
    ['high', ['air']],
    ['medium', []],
  ] as const) {
    test(`behind the live screen the air ${moving.length > 0 ? 'moves' : 'rests'} on the ${tier} tier`, async ({
      page,
    }) => {
      const errors = trackErrors(page);
      await atComputer(page, `&mood=rose&quality=${tier}`);
      expect((await stats(page))?.quality.tier).toBe(tier);
      await expectRest(page, `at the computer on the ${tier} tier`, moving);
      // Away from the computer the air moves on every tier (with the lava lamp, which the room view shows).
      await page.evaluate(() => window.__roomLab?.room.showRoom());
      await page.waitForFunction(() => window.__roomLab?.room.view === 'room' && window.__roomLab.room.settled);
      await expectRest(page, `in the room view on the ${tier} tier`, ['air', 'lava']);
      expect(errors).toEqual([]);
    });
  }

  test('a light change shows around the monitor, the same light changes nothing and none takes it back', async ({
    page,
  }) => {
    await atComputer(page);
    // The stage without the live screen over it: the monitor's glass and what its light falls on.
    const shot = async (change?: () => void) => {
      if (change) await page.evaluate(change);
      // The frame that shows it, where the change asks for one: a light that stays as it was asks for none, and the
      // room at rest draws none for it (docs/ROOM.md › Frames › At rest).
      await untilDrawn(page, 2);
      return page.locator('#stage canvas').screenshot();
    };
    const still = await shot();
    // At rest the room is one picture, so any difference below is the light's.
    expect(await differingPixels(still, await shot())).toBe(0);
    const white = await shot(() => window.__roomLab?.room.pc.setLight({ r: 0.8, g: 0.8, b: 0.8 }));
    expect(await differingPixels(still, white, 3), 'pixels the white page lights').toBeGreaterThan(20_000);
    expect(
      await differingPixels(white, await shot(() => window.__roomLab?.room.pc.setLight({ r: 0.8, g: 0.8, b: 0.8 }))),
    ).toBe(0);
    const red = await shot(() => window.__roomLab?.room.pc.setLight({ r: 0.9, g: 0.1, b: 0.1 }));
    expect(await differingPixels(white, red, 3), 'pixels that follow its colour').toBeGreaterThan(20_000);
    expect(await differingPixels(still, await shot(() => window.__roomLab?.room.pc.setLight(null)))).toBe(0);
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
