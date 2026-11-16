import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import { GPU_LAUNCH_ARGS } from './gpu';
import { trackErrors } from './helpers';

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS }, viewport: { width: 1440, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

type Rgb = readonly [number, number, number];
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Game colours at a menu's brightness, under the display glare's knee: what the TV shows most of the time. */
const BLUE = '#2a50b4';
const ORANGE = '#b45a1e';

/** The mean colour (0–255) of each box of one frame of the stage. */
async function means(page: Page, boxes: readonly Box[]): Promise<Rgb[]> {
  const png = await page.locator('#stage canvas').screenshot();
  return Promise.all(
    boxes.map(async (box) => {
      const { data } = await sharp(png)
        .extract({
          left: Math.round(box.x),
          top: Math.round(box.y),
          width: Math.round(box.width),
          height: Math.round(box.height),
        })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const sum = [0, 0, 0];
      for (let i = 0; i < data.length; i += 3) for (let c = 0; c < 3; c++) sum[c] = (sum[c] ?? 0) + (data[i + c] ?? 0);
      return sum.map((value) => value / (data.length / 3)) as unknown as Rgb;
    }),
  );
}

/** Fills the picture with one colour and waits for the frame that shows it. */
async function show(page: Page, color: string): Promise<void> {
  const before = await page.evaluate(() => window.__roomLab?.room.stats.framesRendered ?? 0);
  await page.evaluate((fill) => window.__roomLab?.surface.fill(fill), color);
  await expect
    .poll(() => page.evaluate(() => window.__roomLab?.room.stats.framesRendered ?? 0))
    .toBeGreaterThan(before);
}

/** What each box gained, channel by channel, between a black picture and `color`. */
async function gain(page: Page, color: string, boxes: readonly Box[]): Promise<Rgb[]> {
  await show(page, '#000000');
  const dark = await means(page, boxes);
  await show(page, color);
  const lit = await means(page, boxes);
  return lit.map((rgb, i) => rgb.map((value, c) => value - (dark[i]?.[c] ?? 0)) as unknown as Rgb);
}

test("the picture lights the bezel's lip and the room in its own colours, and veils nothing", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/room-lab.html?clean&mood=rose');
  await page.waitForFunction(
    () =>
      window.__roomLab?.room.powerState === 'on' &&
      window.__roomLab.room.view === 'tv' &&
      window.__roomLab.room.settled,
    null,
    { timeout: 30_000 },
  );
  await page.evaluate(() => window.__roomLab?.surface.pause());
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = await page.evaluate(
    () => (globalThis as { __tvPicture?: () => readonly number[] }).__tvPicture?.() ?? [],
  );
  const width = x1 - x0;
  const height = y1 - y0;
  const across = { x: x0 + width * 0.3, width: width * 0.4 };
  // Above the picture's middle, going up: the tube's dark border just outside it (to 5.7 % of the picture's height on
  // the generated set, the light fading as it goes), then the bezel's inner lip, a band 1.5 % tall that faces the
  // picture (6–7.5 %), its outer step (to 10 %), and from there the flat front of the set, which the recessed picture
  // cannot light. The lip is looked for row by row between the border and the front, so the set's shape can be
  // tuned without moving this test's boxes.
  const border = { ...across, y: y0 - height * 0.03, height: height * 0.025 };
  const rows = Array.from({ length: 26 }, (_, row) => ({
    ...across,
    y: y0 - height * (0.058 + row * 0.002),
    height: 2,
  }));
  const front = { ...across, y: y0 - height * 0.16, height: height * 0.04 };

  for (const [color, channel, other] of [
    [BLUE, 2, 0],
    [ORANGE, 0, 2],
  ] as const) {
    const [atBorder, atFront, ...atRows] = await gain(page, color, [border, front, ...rows]);
    const atLip = atRows.reduce((best, row) => (row[channel] > best[channel] ? row : best));
    // The lip and the tube's border take the picture's light, in its colour (the lip gains 44 of 255 at 0e275c7).
    expect(atLip[channel], `${color} lights the lip`).toBeGreaterThan(20);
    expect(atLip[channel], `${color} lights the lip in its own colour`).toBeGreaterThan(2 * atLip[other]);
    expect(atBorder?.[channel], `${color} glows in the tube's border`).toBeGreaterThan(8);
    // No veil of it settles over the plastic around the set.
    for (const value of atFront ?? []) expect(Math.abs(value), `${color} leaves the set's front dark`).toBeLessThan(2);
  }

  // Across the room the light falls on the floor before the set, but never reaches the far wall.
  await page.evaluate(() => window.__roomLab?.room.showRoom());
  await page.waitForFunction(() => window.__roomLab?.room.view === 'room' && window.__roomLab.room.settled);
  const floor = { x: 1080, y: 640, width: 90, height: 60 };
  const farWall = { x: 200, y: 300, width: 100, height: 80 };
  const [onFloor, onFarWall] = await gain(page, BLUE, [floor, farWall]);
  expect(onFloor?.[2], 'the floor before the set takes its light').toBeGreaterThan(6);
  for (const value of onFarWall ?? []) expect(Math.abs(value), 'the far wall is out of its reach').toBeLessThan(1);
  expect(errors).toEqual([]);
});
