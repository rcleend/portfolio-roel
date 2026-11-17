import { type Browser, expect, type Page, test } from '@playwright/test';
import { stillFraming } from '../scripts/still/framing';
import { fillPicture, showRoom } from '../scripts/still/page';
import { padInsets } from '../scripts/still/world';
import { stillCamera } from '../src/app/startup/still/camera';
import { TV_SPEC } from '../src/room/gen/roomSpec';
import { GPU_LAUNCH_ARGS } from './gpu';
import { type Box, matchColours, matchEdges, type Shot, shotOf } from './stillCompare';

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS } });

/**
 * (`STILL_SHOTS=<dir>` writes each pair of shots there.)
 *
 * The startup still against the live room (docs/ROOM.md › Startup), as the two are on the frame one takes over from
 * the other: the set on and its picture black. At each viewport the page is opened on the game's title, every frame
 * of the game is painted over with black, and the live room is shot with the still hidden, then the still alone (its
 * power lamp on, its picture's light at nothing); the two are held to each other in outline and in colour.
 */
const VIEWPORTS: readonly (readonly [width: number, height: number, touch: boolean])[] = [
  [1440, 900, false],
  [1920, 1080, false],
  [1000, 950, false],
  [1200, 500, false],
  [700, 1000, false],
  [844, 390, true],
  [1024, 768, true],
  [390, 844, true],
  [768, 1024, true],
];

/** An edge is a step of this many levels a pixel (the set against the wall is 15–30). */
const EDGE = 12;
/**
 * The still's edges without a live one within a pixel, and the live room's strong ones (twice as steep: its print
 * and its props' own shading are edges too) without one of the still's, as parts of each. Measured 0.1–2.6 % and
 * 0–2.9 % at these viewports (they were 0–10 % and 0–5 % before the props were traced to a third of a pixel); an
 * outline two pixels off strays along most of its length (60–75 %).
 */
const STRAY = { still: 0.06, live: 0.08 };
/**
 * Colour, as CIEDE2000 between the two shots' mean colours of each 8 × 8 px block of the page: its mean over the
 * page, and the value 95 % and 99 % of the blocks stay under. Measured on the top tier at these viewports, at one
 * pixel a CSS pixel, the still's image in: mean 0.42–0.65, 95 % under 0.94–2.07, 99 % under 2.30–4.80 (1 is about the least difference
 * seen side by side; the wall, the set and its glass are under it, and the blocks over it are the lamps' bloom and
 * the power lamp's, which are their own in every window). The
 * bounds are those and a margin for another GPU's rounding; the room's own frames differ by nothing (0.00).
 */
const COLOUR = { mean: 0.75, p95: 2.5, p99: 5.5 };
/**
 * The lowest tier bakes the room's light coarser (gen/tiers.ts), so its wall is a few levels off the top tier's, which
 * the still is made from; no page can tell before the room loads that it will be drawn on that tier. Measured mean
 * 0.68–0.86, 95 % under 1.98–2.62, 99 % under 4.43–4.46.
 */
const COLOUR_LOW = { mean: 1.05, p95: 3.1, p99: 5.5 };

const framing = stillFraming();

/**
 * Only the still: over the room whatever the app has done with it since, its power lamp on, no picture on it, and its
 * picture's light in `tube` (as `--tube` would have it: the app goes on setting that from the game's own frames).
 */
const stillOnly = (tube: string): string =>
  `#tv-still { visibility: visible !important; opacity: 1 !important; clip-path: none !important; transition: none !important } .still-picture { visibility: hidden !important } #tv-still .o { opacity: 1 !important } #tv-still .t { color: ${tube} !important }`;

async function shots(
  browser: Browser,
  width: number,
  height: number,
  touch: boolean,
  tier: 'high' | 'low' = 'high',
  picture = '#000',
): Promise<{ still: Shot; live: Shot; page: Page }> {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  await showRoom(page, '/', tier);
  await fillPicture(page, picture);
  const dump = process.env.STILL_SHOTS && `${process.env.STILL_SHOTS}/${width}x${height}-${tier}-${picture.slice(1)}`;
  const live = await shotOf(await page.screenshot(dump ? { path: `${dump}-live.png` } : {}), width, height);
  await page.addStyleTag({ content: stillOnly(picture) });
  // The app may have handed over by now and let the still go: put it back as a lost context would, and wait for its
  // drawing and its image.
  await page.evaluate(() => {
    const still = document.getElementById('tv-still') as HTMLElement;
    delete still.dataset.gone;
    still.dataset.shown = 'true';
  });
  await page.waitForFunction(() => {
    const still = document.getElementById('tv-still') as HTMLElement;
    return still.querySelector(':scope > svg') !== null && 'image' in still.dataset;
  });
  // The image's layers ease in over 200 ms.
  await page.waitForTimeout(500);
  const still = await shotOf(await page.screenshot(dump ? { path: `${dump}-still.png` } : {}), width, height);
  return { still, live, page };
}

/** Where the live room has the game's picture: left, top, width, height in CSS px (`__tvPicture`, development only). */
async function roomPicture(page: Page): Promise<number[]> {
  const box = await page.evaluate(() => (globalThis as { __tvPicture?: () => readonly number[] }).__tvPicture?.());
  if (!box) throw new Error('The room does not say where its picture is');
  const [left, top, right, bottom] = box as [number, number, number, number];
  return [left, top, right - left, bottom - top];
}

for (const [width, height, touch] of VIEWPORTS) {
  test(`the still is the live room with a black picture at ${width} × ${height}${touch ? ' on a touch screen' : ''}`, async ({
    browser,
  }) => {
    const { still, live, page } = await shots(browser, width, height, touch);
    const camera = stillCamera(framing, width, height, padInsets(width, height, touch));

    // The still's script says where the picture goes, and it is where the room has it.
    const said = await page.evaluate(() => {
      const style = (document.getElementById('tv-still') as HTMLElement).style;
      return ['left', 'top', 'width', 'height'].map((name) => parseFloat(style.getPropertyValue(`--picture-${name}`)));
    });
    const room = await roomPicture(page);
    said.forEach((value, i) => {
      expect(Math.abs(value - (room[i] as number)), `--picture-${['left', 'top', 'width', 'height'][i]}`).toBeLessThan(
        0.5,
      );
      expect(Math.abs(value - (camera.picture[i] as number))).toBeLessThan(0.05);
    });

    // Outline: the set's box and a margin, but for the power lamp, whose bloom is its own in every window.
    const corners = [0, 1, 2, 3].map((i) =>
      camera.project([
        TV_SPEC.bounds.min[0],
        TV_SPEC.bounds[i & 1 ? 'max' : 'min'][1],
        TV_SPEC.bounds[i & 2 ? 'max' : 'min'][2],
      ]),
    );
    const [left, right] = [Math.min(...corners.map((p) => p[0])) - 12, Math.max(...corners.map((p) => p[0])) + 12];
    const [top, bottom] = [Math.min(...corners.map((p) => p[1])) - 12, Math.max(...corners.map((p) => p[1])) + 12];
    const set: Box = { left, top, width: right - left, height: bottom - top };
    const led = camera.project(TV_SPEC.led);
    const ignore: Box[] = [{ left: led[0] - 30, top: led[1] - 30, width: 60, height: 60 }];
    const drawn = matchEdges(still, live, EDGE, 1, set, ignore);
    const real = matchEdges(live, still, EDGE * 2, 1, set, ignore);
    if (drawn.edges > 100)
      expect(
        drawn.stray / drawn.edges,
        'edges of the still that the live room does not have within a pixel',
      ).toBeLessThan(STRAY.still);
    if (real.edges > 100)
      expect(real.stray / real.edges, 'strong edges of the live room that the still does not have').toBeLessThan(
        STRAY.live,
      );

    // Colour, over the whole page.
    const colour = matchColours(still, live);
    test.info().annotations.push({
      type: 'measured',
      description: `ΔE00 mean ${colour.mean.toFixed(2)} p95 ${colour.p95.toFixed(2)} p99 ${colour.p99.toFixed(2)} max ${colour.max.toFixed(1)} at ${colour.worst}; stray ${(drawn.stray / Math.max(1, drawn.edges)).toFixed(3)} of ${drawn.edges}, ${(real.stray / Math.max(1, real.edges)).toFixed(3)} of ${real.edges}`,
    });
    console.log(`${width}×${height}`, test.info().annotations.at(-1)?.description);
    expect(colour.mean, 'the mean difference in colour').toBeLessThan(COLOUR.mean);
    expect(colour.p95, 'the difference 95 % of the page stays under').toBeLessThan(COLOUR.p95);
    expect(colour.p99, 'the difference 99 % of the page stays under').toBeLessThan(COLOUR.p99);
    await page.context().close();
  });
}

for (const [width, height, touch] of [
  [1440, 900, false],
  [390, 844, true],
] as const)
  test(`the still is near the lowest tier’s room too at ${width} × ${height}`, async ({ browser }) => {
    const { still, live, page } = await shots(browser, width, height, touch, 'low');
    const colour = matchColours(still, live);
    console.log(
      `low ${width}×${height} ΔE00 mean ${colour.mean.toFixed(2)} p95 ${colour.p95.toFixed(2)} p99 ${colour.p99.toFixed(2)} max ${colour.max.toFixed(1)}`,
    );
    expect(colour.mean).toBeLessThan(COLOUR_LOW.mean);
    expect(colour.p95).toBeLessThan(COLOUR_LOW.p95);
    expect(colour.p99).toBeLessThan(COLOUR_LOW.p99);
    await page.context().close();
  });

test('the picture’s light on the still follows --tube as the room’s follows its picture', async ({ browser }) => {
  const [width, height] = [1440, 900];
  const camera = stillCamera(framing, width, height, padInsets(width, height, false));
  const [left, top, wide, high] = camera.picture;
  // The lip round the glass over the picture's middle, 4.8–6.2 % of the picture's height above it (tv-light.spec.ts):
  // the mean of each shot over that band and a little either side.
  const lip = (shot: Shot): number => {
    let [sum, count] = [0, 0];
    for (let y = Math.round(top - high * 0.075); y < top - high * 0.045; y++)
      for (let x = Math.round(left + wide * 0.3); x < left + wide * 0.7; x++)
        for (let channel = 0; channel < 3; channel++, count++) sum += shot.rgb[(y * width + x) * 3 + channel] as number;
    return sum / count;
  };
  const dark = await shots(browser, width, height, false);
  const [roomDark, stillDark] = [lip(dark.live), lip(dark.still)];
  // With a black picture the two are the same.
  expect(Math.abs(stillDark - roomDark)).toBeLessThan(4);
  await dark.page.context().close();
  const lit = await shots(browser, width, height, false, 'high', '#fff');
  // A white picture lights the room's lip (by 57 levels over this band), and the still's nearly as much (38: the
  // still's lines have one strength all round the lip, the middle of the room's, whose top is the brightest part of it). (Outside the picture and
  // the lip the room's finish glares over the casing under a white picture, its bloom's knee: the still has none of
  // that, so only the lip is compared.)
  console.log(
    `lip: room ${roomDark.toFixed(1)} → ${lip(lit.live).toFixed(1)}, still ${stillDark.toFixed(1)} → ${lip(lit.still).toFixed(1)}`,
  );
  expect(lip(lit.live) - roomDark, 'a white picture lights the room’s lip').toBeGreaterThan(25);
  expect(Math.abs(lip(lit.still) - stillDark - (lip(lit.live) - roomDark)), 'and the still’s as much').toBeLessThan(26);
  await lit.page.context().close();
});

test('the still is drawn again as the window changes, and puts the picture where the room does', async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/?debug&capture&quality=high');
  await page.waitForFunction(() => document.querySelector('.room-host')?.getAttribute('data-ready') === 'true', null, {
    timeout: 60_000,
  });
  for (const [width, height] of [
    [1000, 950],
    [1200, 500],
    [700, 1000],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height });
    const camera = stillCamera(framing, width, height, padInsets(width, height, false));
    await expect
      .poll(async () => {
        const said = await page.evaluate(() => {
          const style = (document.getElementById('tv-still') as HTMLElement).style;
          return ['left', 'top', 'width', 'height'].map((name) =>
            parseFloat(style.getPropertyValue(`--picture-${name}`)),
          );
        });
        return Math.max(...said.map((value, i) => Math.abs(value - (camera.picture[i] as number))));
      })
      .toBeLessThan(0.05);
    const room = await roomPicture(page);
    camera.picture.forEach((value, i) => {
      expect(Math.abs(value - (room[i] as number))).toBeLessThan(0.5);
    });
    // One drawing of what the picture lights, over the room's.
    expect(await page.locator('#tv-still > svg.t').count()).toBe(1);
    expect(await page.locator('#tv-still > svg:not(.t)').count()).toBeGreaterThan(0);
  }
  await context.close();
});
