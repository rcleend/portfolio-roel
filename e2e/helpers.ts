import { expect, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import type {} from '../src/app/harness/harness';
import type {} from '../src/app/hosts/RoomHost';
import type {} from '../src/room/lab/main';

/** Collects console errors and uncaught exceptions so any of them fails the test. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

export async function scene(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__arcade?.state().scene ?? null);
}

export async function paused(page: Page): Promise<boolean | undefined> {
  return page.evaluate(() => window.__arcade?.state().paused);
}

/** The startup phase App publishes on #game: loading, powering, running or failed. */
export async function phase(page: Page): Promise<string | undefined> {
  return page.evaluate(() => document.getElementById('game')?.dataset.phase);
}

/**
 * The game runs, and the room (where it presents it) is in: the game starts on the startup still before the room
 * has loaded (docs/ROOM.md › Startup), and only the room takes clicks on the stage.
 */
export async function waitForRunning(page: Page): Promise<void> {
  await expect.poll(() => phase(page), { timeout: 30_000 }).toBe('running');
  await page.waitForFunction(() => window.__arcadeReady === true);
  await page.waitForFunction(() => document.querySelector('.room-host')?.getAttribute('data-ready') !== 'false', null, {
    timeout: 30_000,
  });
}

/**
 * Leaves the TV the way a touch screen has: the TV's way out, "Explore the room" (the room's button for it, shown or
 * not: it shows from the first press; tests leave from the title).
 */
export async function tapWayOut(page: Page): Promise<void> {
  await page.locator('.tv-way-out, .way-out').first().dispatchEvent('click');
}

/** The element of whichever host is presenting (`data-host` is room or flat, `data-view` tv or room). */
export function hostElement(page: Page) {
  return page.locator('[data-host]');
}

/** Clicks the flat host's screen at a native game pixel, through the same pointer mapping a visitor's mouse takes. */
export async function clickScreen(page: Page, point: { readonly x: number; readonly y: number }): Promise<void> {
  const canvas = page.locator('.tv__canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('The flat host is not showing its screen');
  const scale = box.width / (await canvas.evaluate((element) => (element as HTMLCanvasElement).width));
  await page.mouse.click(box.x + (point.x + 0.5) * scale, box.y + (point.y + 0.5) * scale);
}

/**
 * The frames a second the room draws at full pace (a flight, the game played on the TV, a room still being lit:
 * docs/ROOM.md › Rendering and performance › Frames): its sixty, give or take a loaded machine and the headless
 * display's own rate. A software renderer draws what it can. A room at rest draws far fewer: `expectRest`.
 */
export const SIXTY_FRAMES = { min: process.env.ROOM_GL === 'swiftshader' ? 1 : 45, max: 75 } as const;

/** The room's frame counter and the page's time, read together (the lab's room or the app's). */
function frameClock(page: Page): Promise<{ frames: number; at: number }> {
  return page.evaluate(() => ({
    frames: (window.__roomLab?.room ?? window.__room)?.stats.framesRendered ?? 0,
    at: performance.now(),
  }));
}

/** Frames a second the room draws over `ms` of real time, by the page's own clock. */
export async function frameRate(page: Page, ms = 1000): Promise<number> {
  const before = await frameClock(page);
  await page.waitForTimeout(ms);
  const after = await frameClock(page);
  return ((after.frames - before.frames) / (after.at - before.at)) * 1000;
}

/** Frames the room draws over `ms` of real time. */
async function framesDrawn(page: Page, ms: number): Promise<number> {
  const before = await frameClock(page);
  await page.waitForTimeout(ms);
  return (await frameClock(page)).frames - before.frames;
}

/**
 * Holds a room at full pace (a game somebody plays on the TV, a room still being lit: never a room at rest, which is
 * `expectRest`'s) to its sixty frames a second, `where` naming the moment for the report. Never more than the band in
 * any second; and within it in one of up to three seconds, since a machine busy with other pages can keep a browser
 * from the frames the room asked for, for a second at a time.
 */
export async function expectSixtyFrames(page: Page, where: string): Promise<void> {
  let rate = 0;
  for (let second = 0; second < 3; second++) {
    rate = await frameRate(page);
    expect(rate, `frames a second ${where}`).toBeLessThanOrEqual(SIXTY_FRAMES.max);
    if (rate >= SIXTY_FRAMES.min) return;
  }
  expect(rate, `frames a second ${where}`).toBeGreaterThanOrEqual(SIXTY_FRAMES.min);
}

/** What the room draws of its own accord now (`RoomStats.pace`): the lab's room or the app's. */
export function roomPace(
  page: Page,
): Promise<{ pace: 'full' | 'rest' | 'still'; moving: readonly string[]; rate: number; why: string } | undefined> {
  return page.evaluate(() => (window.__roomLab?.room ?? window.__room)?.stats.pace);
}

/**
 * Holds a room nobody touches to its rest (docs/ROOM.md › Frames › At rest), `where` naming the moment for the
 * report: it says that exactly `moving` moves by itself (`air`, `lava`, `discs`, `tv`), draws no frame at all when
 * that is nothing, and otherwise about as many a second as what moves needs: never the display's sixty for a room in
 * which the rain runs down the pane. The pace asked for comes rounded up to a whole number of the display's frames
 * (thirty for twenty-four on a 60 Hz display), a readout that ticks adds a frame a second, and a loaded machine
 * keeps a browser from frames for a second at a time: within the band in one of up to three seconds.
 *
 * Whatever asks for frames of its own must be over before this is called (a flight, a fade, a spring, a game somebody
 * plays): the room says `rest` or `still` through those too, and draws them at full pace.
 */
export async function expectRest(page: Page, where: string, moving: readonly string[]): Promise<void> {
  await expect
    .poll(async () => (await roomPace(page))?.pace, { message: `the room's pace ${where}` })
    .toBe(moving.length > 0 ? 'rest' : 'still');
  const pace = await roomPace(page);
  expect([...(pace?.moving ?? [])].sort(), `what moves ${where}`).toEqual([...moving].sort());
  if (moving.length === 0) {
    // The frame already asked for may still come. And a clock that turns over meanwhile (the monitor's minute) asks
    // for the one frame that shows it: after one such frame the room is looked at once more. A room just made, or
    // just arrived at, may still be finishing what it was asked for (a few seconds at most): it has to come to rest,
    // and something that keeps asking never lets it.
    await page.waitForTimeout(150);
    await expect
      .poll(
        async () => {
          const drawn = await framesDrawn(page, 600);
          return drawn === 1 ? framesDrawn(page, 600) : drawn;
        },
        { message: `frames drawn ${where}`, timeout: 8_000, intervals: [0] },
      )
      .toBe(0);
    return;
  }
  const asked = pace?.rate ?? 0;
  const band = { min: process.env.ROOM_GL === 'swiftshader' ? 1 : asked * 0.7, max: asked * 1.5 + 3 };
  let rate = 0;
  for (let second = 0; second < 3; second++) {
    rate = await frameRate(page);
    expect(rate, `frames a second ${where}`).toBeLessThanOrEqual(band.max);
    if (rate >= band.min) return;
  }
  expect(rate, `frames a second ${where}`).toBeGreaterThanOrEqual(band.min);
}

/**
 * Holds the room to drawing nothing: a hidden canvas or tab, a disposed room, a room in which nothing moves. The
 * frame already asked for may still come, so the count starts after a moment's grace (the room that draws nothing
 * looks again four times a second, and draws none).
 */
export async function expectNoFrames(page: Page, where: string, ms = 600): Promise<void> {
  await page.waitForTimeout(150);
  expect(await framesDrawn(page, ms), `frames drawn ${where}`).toBe(0);
}

/**
 * Waits until the room has drawn what was last asked of it. A room at rest draws only as often as what moves needs
 * and nothing at all while nothing moves (docs/ROOM.md › Frames › At rest), so there is no next frame to wait for:
 * this returns after `frames` more of a room that goes on drawing, or once a room that has come to rest has drawn
 * none for `quietMs`. A frame that is asked for is drawn on the next display frame, and what starts to move is found
 * within a quarter of a second, so a room that draws nothing for longer than that has shown all there is to show:
 * its last frame, which `stats.drawCalls` and a screenshot then read.
 */
export async function untilDrawn(page: Page, frames = 3, quietMs = 400): Promise<void> {
  await page.evaluate(
    ({ frames, quietMs }) =>
      new Promise<void>((resolve) => {
        const drawn = (): number => (window.__roomLab?.room ?? window.__room)?.stats.framesRendered ?? 0;
        const start = drawn();
        let last = start;
        let since = performance.now();
        const look = (): void => {
          const count = drawn();
          const now = performance.now();
          if (count !== last) {
            last = count;
            since = now;
          }
          if (count >= start + frames || now - since >= quietMs) resolve();
          else setTimeout(look, 16);
        };
        look();
      }),
    { frames, quietMs },
  );
}

/**
 * Pixels that differ, in any channel by more than `tolerance`, between two shots of `target` taken `ms` apart: what
 * stands still is told from the picture, since a frame of a still room is the frame before it, pixel for pixel.
 */
export async function pixelsChanged(page: Page, target: Locator, ms: number, tolerance = 0): Promise<number> {
  const first = await target.screenshot();
  await page.waitForTimeout(ms);
  return differingPixels(first, await target.screenshot(), tolerance);
}

/** Pixels that differ, in any channel by more than `tolerance`, between two PNGs of one size. */
export async function differingPixels(a: Buffer, b: Buffer, tolerance = 0): Promise<number> {
  const [first, second] = await Promise.all([a, b].map((png) => sharp(png).removeAlpha().raw().toBuffer()));
  if (!first || !second || first.length !== second.length) throw new Error('The shots differ in size');
  let count = 0;
  for (let i = 0; i < first.length; i += 3) {
    if (
      Math.abs((first[i] ?? 0) - (second[i] ?? 0)) > tolerance ||
      Math.abs((first[i + 1] ?? 0) - (second[i + 1] ?? 0)) > tolerance ||
      Math.abs((first[i + 2] ?? 0) - (second[i + 2] ?? 0)) > tolerance
    )
      count++;
  }
  return count;
}
