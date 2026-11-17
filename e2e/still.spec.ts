import { type Browser, expect, type Page, test } from '@playwright/test';
import { stillFraming } from '../scripts/still/framing';
import { padInsets } from '../scripts/still/world';
import { stillCamera } from '../src/app/startup/still/camera';
import { TV_SPEC } from '../src/room/gen/roomSpec';
import { GPU_LAUNCH_ARGS } from './gpu';
import { type Box, matchEdges, patch, type Shot, shotOf } from './stillCompare';

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS } });

/**
 * The startup still against the live room (docs/ROOM.md › Startup): at each viewport the page is opened with the
 * tube dark (`?capture`), shot with the still up and again with the still hidden, the live room behind it at the same
 * moment, and the two are held to each other in outline and in colour. The dark glass's sheen is under the game's
 * picture at any hand-over and the power lamp's halo is lit only with it: neither is compared.
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

/** Places of the room whose colour the still must have, where a viewport shows them. */
const PATCHES: Readonly<Record<string, readonly [number, number, number]>> = {
  'the wall left of the set': [2.8, 0.95, -0.95],
  'the wall right of the set': [2.8, 0.95, 0.15],
  'the bulb’s pool on the cabinet': [2.2, 0.486, -0.75],
  'the set’s chin': [2.154, 0.622, -0.12],
  'the casing over the glass': [2.154, 1.055, -0.32],
  'the lamp’s base': [2.268, 0.515, -0.84],
  'the plant’s pot': [2.219, 0.53, 0.121],
  'the cabinet top between the plant and the opal lamp': [2.3, 0.486, 0.3],
  'the cabinet top’s edge': [2.12, 0.4715, -0.32],
  'a drawer’s front': [2.138, 0.34, -0.66],
};

/**
 * An edge is a step of this many levels a pixel (the set against the wall is 15–30); one of the live room counts
 * from twice that, since its prints and its grain are edges the still does not draw.
 */
const EDGE = 12;
/**
 * The still's edges without a live one within a pixel, and the live room's strong ones without one of the
 * still's, as parts of each: measured 0–10 % and 0–5 % at sixteen viewports (the first is the lamps' pools, whose
 * shadows are hard on the still and soft in the room, and the plant, drawn looser than the set). The hand-drawn
 * still this one replaced was at 7–77 % and 49–100 %, and an outline two pixels off strays along most of its length
 * (60–75 % with the still's data scaled by 0.4 %).
 */
const STRAY = { still: 0.16, live: 0.15 };
/**
 * A patch's mean colour may differ by this much a channel: measured up to 19 (the bulb's pool, whose sheen on the
 * varnish moves with the eye), 3 on the set and the wall; the room's own frames differ by less than 1.
 */
const COLOUR = 24;

const framing = stillFraming();

async function shots(
  browser: Browser,
  width: number,
  height: number,
  touch: boolean,
): Promise<{ still: Shot; live: Shot; page: Page }> {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  await page.goto('/?debug&capture&quality=high');
  await page.waitForFunction(() => document.querySelector('.room-host')?.getAttribute('data-ready') === 'true', null, {
    timeout: 60_000,
  });
  // The room behind the still is lit view by view; the whole of it is in before the two are compared.
  await page.waitForFunction(() => window.__room?.shown === true);
  await page.waitForTimeout(1500);
  await expect(page.locator('#tv-still')).toHaveAttribute('data-shown', 'true');
  const still = await shotOf(await page.screenshot(), width, height);
  await page.addStyleTag({ content: '#tv-still { visibility: hidden !important; transition: none !important; }' });
  await page.waitForTimeout(200);
  const live = await shotOf(await page.screenshot(), width, height);
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
  test(`the still is the live room’s opening view at ${width} × ${height}${touch ? ' on a touch screen' : ''}`, async ({
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

    // Outline: the set's box and a margin, but for the glass under the picture and the power lamp.
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
    const [pictureLeft, pictureTop, pictureWidth, pictureHeight] = camera.picture;
    const led = camera.project(TV_SPEC.led);
    const ignore: Box[] = [
      { left: pictureLeft - 8, top: pictureTop - 8, width: pictureWidth + 16, height: pictureHeight + 16 },
      { left: led[0] - 30, top: led[1] - 30, width: 60, height: 60 },
    ];
    const drawn = matchEdges(still, live, EDGE, 1, set, ignore);
    const real = matchEdges(live, still, EDGE * 2, 1, set, ignore);
    expect(drawn.edges, 'the still has an outline').toBeGreaterThan(200);
    expect(
      drawn.stray / drawn.edges,
      'edges of the still that the live room does not have within a pixel',
    ).toBeLessThan(STRAY.still);
    if (real.edges > 100)
      expect(real.stray / real.edges, 'strong edges of the live room that the still does not have').toBeLessThan(
        STRAY.live,
      );

    // Colour, where the viewport shows the place.
    for (const [name, place] of Object.entries(PATCHES)) {
      const [x, y] = camera.project(place);
      const [drawnColour, realColour] = [patch(still, x, y, 7), patch(live, x, y, 7)];
      if (!drawnColour || !realColour) continue;
      drawnColour.forEach((value, channel) => {
        expect(Math.abs(value - (realColour[channel] as number)), `${name}, channel ${channel}`).toBeLessThan(COLOUR);
      });
    }
    await page.context().close();
  });
}

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
    expect(await page.locator('#tv-still svg').count()).toBe(1);
  }
  await context.close();
});
