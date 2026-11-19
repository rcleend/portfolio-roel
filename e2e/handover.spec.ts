import { type Browser, expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import type {} from '../src/app/harness/harness';
import type {} from '../src/app/hosts/RoomHost';
import { GPU_LAUNCH_ARGS } from './gpu';
import { blocksOf, colourDifference, edgeShift, type Pixels } from './handoverMetrics';

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS } });

/**
 * The hand-over from the startup still to the live room (docs/ROOM.md › Startup): the still goes on a black frame of
 * the game, when the flat picture and the live tube both show nothing, and eases out round the picture's place. The
 * game's own loop is stopped here and the game stepped by hand, so every test stands on one known frame and none of
 * them needs a clock: what is waited for is polled.
 */

/** What the page says of the hand-over, and what the game's canvas shows: the share of its pixels that are lit. */
interface Handover {
  readonly shown: string | undefined;
  readonly black: boolean;
  readonly stillVisibility: string;
  readonly pictureVisibility: string | null;
  readonly tube: string;
  /** The picture's mean light, as the room's tube takes it from its smallest mip. */
  readonly mean: readonly [number, number, number];
  readonly lit: number;
  readonly hint: string | null;
  readonly pad: string | null;
}

function handover(page: Page): Promise<Handover> {
  return page.evaluate(() => {
    const still = document.getElementById('tv-still') as HTMLElement;
    const picture = document.querySelector('.still-picture');
    const canvas = window.__arcade?.game.canvas as HTMLCanvasElement;
    const probe = document.createElement('canvas');
    probe.width = canvas.width;
    probe.height = canvas.height;
    const context = probe.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    context.drawImage(canvas, 0, 0);
    const { data } = context.getImageData(0, 0, probe.width, probe.height);
    const linear = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const display = (v: number): number => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
    const sum = [0, 0, 0];
    let lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      if ((data[i] as number) + (data[i + 1] as number) + (data[i + 2] as number) > 0) lit++;
      for (let c = 0; c < 3; c++) sum[c] = (sum[c] as number) + linear((data[i + c] as number) / 255);
    }
    const pixels = data.length / 4;
    return {
      shown: still.dataset.shown,
      black: 'black' in still.dataset,
      stillVisibility: getComputedStyle(still).visibility,
      pictureVisibility: picture ? getComputedStyle(picture).visibility : null,
      tube: still.style.getPropertyValue('--tube'),
      mean: sum.map((total) => display(total / pixels)) as [number, number, number],
      lit: lit / pixels,
      hint: document.querySelector('.tv-way-out')?.getAttribute('data-shown') ?? null,
      pad: document.querySelector('.touchpad')?.getAttribute('data-visible') ?? null,
    };
  });
}

const step = (page: Page, frames = 1): Promise<void> => page.evaluate((count) => window.__arcade?.step(count), frames);

/**
 * The page on its title with the game's own loop stopped (stopped, not paused: a paused game wears the tube's PAUSE),
 * the room in and lit behind the still, and the title's intro over.
 */
async function openOnTitle(page: Page, query = ''): Promise<void> {
  await page.goto(`/?seed=1&scene=title${query}`);
  await page.waitForFunction(() => window.__arcadeReady === true, null, { timeout: 60_000 });
  await page.evaluate(() => window.__arcade?.game.stop());
  await page.waitForFunction(
    () =>
      document.querySelector('.room-host')?.getAttribute('data-ready') === 'true' &&
      window.__room?.powerState === 'on' &&
      window.__room.shown,
    null,
    { timeout: 60_000 },
  );
  await step(page, 300);
}

/** Presses past the title and steps to the first black frame of its fade. Returns the frames it took. */
async function toBlack(page: Page): Promise<number> {
  await page.evaluate(() => {
    window.__arcade?.game.input.virtual.press('confirm');
    window.__arcade?.step(2);
    window.__arcade?.game.input.virtual.release('confirm');
  });
  for (let frames = 1; frames < 200; frames++) {
    await step(page);
    if ((await handover(page)).lit === 0) return frames;
  }
  throw new Error('The title never faded to black');
}

/** The colours of `--tube` as numbers. */
const channels = (colour: string): number[] => (colour.match(/[\d.]+/g) ?? []).map(Number);

async function pixelsOf(page: Page): Promise<Pixels> {
  const { data, info } = await sharp(await page.screenshot())
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const dpr = await page.evaluate(() => devicePixelRatio);
  return {
    rgb: new Uint8Array(data.buffer, data.byteOffset, data.length),
    width: info.width,
    height: info.height,
    dpr,
  };
}

/** Two frames of the page, so the room has drawn what the last step changed. */
const settle = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

test('the still’s light follows the game’s picture, and is out on the first black frame', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openOnTitle(page);
  // The light is read a dozen times a second: a frame is stepped until one is read.
  await expect
    .poll(
      async () => {
        await step(page);
        const { tube, mean } = await handover(page);
        const read = channels(tube);
        // The still's drawing takes the mean light to the power of its own response (hosts/tubeLight.ts).
        const wanted = mean.map((value) => 255 * (value / 255) ** 1.45);
        return read.length === 3 ? Math.max(...read.map((value, i) => Math.abs(value - (wanted[i] as number)))) : 255;
      },
      { timeout: 15_000 },
    )
    .toBeLessThan(4);
  const title = await handover(page);
  // The title is a bright picture: its light is no dark grey.
  expect(Math.max(...channels(title.tube))).toBeGreaterThan(40);
  expect(title.shown).toBe('true');

  await toBlack(page);
  const black = await handover(page);
  // The first black frame: the light is out with it, at once, and the still is whole.
  expect(black.tube).toBe('#000');
  expect(black.shown).toBe('true');
  expect(black.pictureVisibility).toBe('visible');
});

test('the flat picture goes on the second black frame and nothing arrives with it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openOnTitle(page);
  // The guide is in (it loads at idle): its hint could show if it would.
  await expect(page.locator('.tv-way-out')).toBeAttached({ timeout: 15_000 });
  // Every time the still is told to go, what the game's canvas shows in that same task, and what else is on the page.
  await page.evaluate(() => {
    const still = document.getElementById('tv-still') as HTMLElement;
    const log: { lit: number; picture: string; opacity: string; hint: string | null; added: number }[] = [];
    (window as unknown as { __handover: typeof log }).__handover = log;
    let added = 0;
    new MutationObserver((records) => {
      for (const record of records) added += record.addedNodes.length;
    }).observe(document.body, { childList: true, subtree: true });
    new MutationObserver(() => {
      if (still.dataset.shown !== 'false' || log.length > 0) return;
      const canvas = window.__arcade?.game.canvas as HTMLCanvasElement;
      const probe = document.createElement('canvas');
      probe.width = canvas.width;
      probe.height = canvas.height;
      const context = probe.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      context.drawImage(canvas, 0, 0);
      const { data } = context.getImageData(0, 0, probe.width, probe.height);
      let lit = 0;
      for (let i = 0; i < data.length; i += 4)
        if ((data[i] as number) + (data[i + 1] as number) + (data[i + 2] as number) > 0) lit++;
      log.push({
        lit,
        picture: getComputedStyle(document.querySelector('.still-picture') as Element).visibility,
        opacity: getComputedStyle(still).opacity,
        hint: document.querySelector('.tv-way-out')?.getAttribute('data-shown') ?? null,
        added,
      });
    }).observe(still, { attributes: true, attributeFilter: ['data-shown'] });
    // When the hint shows, whether the still is out of sight by then.
    const hint = document.querySelector('.tv-way-out') as HTMLElement;
    new MutationObserver(() => {
      const record = window as unknown as { __hintAt?: string };
      if (hint.dataset.shown === 'true') record.__hintAt ??= getComputedStyle(still).visibility;
    }).observe(hint, { attributes: true, attributeFilter: ['data-shown'] });
  });
  const addedBefore = await page.evaluate(() => document.body.querySelectorAll('*').length);

  await toBlack(page);
  expect((await handover(page)).shown).toBe('true');
  // The second black frame: the still is told to go, its flat picture is gone within the frame, and it has not begun
  // to fade yet.
  await step(page);
  const swapped = await handover(page);
  expect(swapped.lit).toBe(0);
  expect(swapped.shown).toBe('false');
  expect(swapped.black).toBe(true);
  expect(swapped.pictureVisibility).toBe('hidden');
  expect(swapped.stillVisibility).toBe('visible');
  const [at] = await page.evaluate(
    () =>
      (window as unknown as { __handover: { lit: number; picture: string; opacity: string; hint: string }[] })
        .__handover,
  );
  expect(at?.lit, 'lit pixels of the game’s picture as the still was told to go').toBe(0);
  expect(at?.picture).toBe('hidden');
  expect(Number(at?.opacity)).toBeGreaterThan(0.99);
  // Nothing arrives with it: no element was added to the page, the hint is not shown, and no key was pressed.
  expect(at?.hint).toBe('false');
  expect(await page.evaluate(() => document.body.querySelectorAll('*').length)).toBe(addedBefore);
  expect(swapped.hint).toBe('false');

  // The drawing eases out, costs nothing once it is gone, and only then the way out arrives.
  await expect.poll(async () => (await handover(page)).stillVisibility, { timeout: 15_000 }).toBe('hidden');
  await expect(page.locator('.tv-way-out')).toHaveAttribute('data-shown', 'true');
  expect(await page.evaluate(() => (window as unknown as { __hintAt?: string }).__hintAt)).toBe('hidden');
  expect(await page.evaluate(() => (document.getElementById('tv-still') as HTMLElement).getAnimations().length)).toBe(
    0,
  );
  expect(await page.evaluate(() => 'gone' in (document.getElementById('tv-still') as HTMLElement).dataset)).toBe(true);
  // And its light is followed no more: the game goes on, the property stays as it was.
  const tube = (await handover(page)).tube;
  await step(page, 30);
  expect((await handover(page)).lit).toBeGreaterThan(0.5);
  await page.waitForTimeout(200);
  await step(page, 2);
  expect((await handover(page)).tube).toBe(tube);
});

test('the boot’s own blackout hands over before any press', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?seed=1');
  await page.waitForFunction(() => window.__arcadeReady === true, null, { timeout: 60_000 });
  await page.evaluate(() => window.__arcade?.game.stop());
  await page.waitForFunction(
    () =>
      document.querySelector('.room-host')?.getAttribute('data-ready') === 'true' && window.__room?.powerState === 'on',
    null,
    { timeout: 60_000 },
  );
  // Through the boot by hand; the still goes on a black frame of it, before the title.
  let gone: Handover | null = null;
  let scene: string | null | undefined = null;
  for (let frames = 0; frames < 1500 && gone === null; frames += 1) {
    await step(page);
    const now = await handover(page);
    if (now.shown === 'false') {
      gone = now;
      scene = await page.evaluate(() => window.__arcade?.state().scene);
    }
  }
  expect(gone?.lit).toBe(0);
  expect(gone?.black).toBe(true);
  expect(gone?.pictureVisibility).toBe('hidden');
  expect(scene).toBe('boot');
});

test('under reduced motion the still is gone within the black frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openOnTitle(page);
  await toBlack(page);
  expect((await handover(page)).stillVisibility).toBe('visible');
  await step(page);
  const swapped = await handover(page);
  expect(swapped.shown).toBe('false');
  expect(swapped.stillVisibility).toBe('hidden');
});

test('with no black frame to go on, the still and its picture fade as one', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The game opens past its title: the first frame the lit room sees is no black one.
  await page.goto('/?seed=1&scene=characterSelect');
  await expect(page.locator('#tv-still')).toHaveAttribute('data-shown', 'false', { timeout: 60_000 });
  expect(await page.evaluate(() => 'black' in (document.getElementById('tv-still') as HTMLElement).dataset)).toBe(
    false,
  );
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.getElementById('tv-still') as HTMLElement).visibility))
    .toBe('hidden');
});

/**
 * What the eye is given at the hand-over, per viewport: `colour` is the CIEDE2000 of 8 px blocks between the last
 * frame before it (the still whole, on a black picture) and the live room once the still is gone, its 99th
 * percentile and mean; `edges` how far the strong edges of one lie from the other's, in CSS px (the 99th percentile
 * and the part over half a pixel); `swap` the most any block changes in the hand-over's own frame (the still's dark
 * glass gives way to the live tube's inside the picture's box) and `frame` in one sixtieth of a second of the ease.
 * These are what was measured plus a margin, not what is wished for: 1.0 is "not noticeable side by side", 2.0 "not
 * in a transition", and the still's drawing is not there yet (docs/ROOM.md › Startup has the table).
 */
const HELD: readonly {
  readonly name: string;
  readonly viewport: { width: number; height: number };
  readonly scale: number;
  readonly touch: boolean;
  readonly colour: { p99: number; mean: number };
  readonly edges: { p99: number; overHalf: number };
  readonly swap: number;
  readonly frame: number;
}[] = [
  {
    name: 'a desktop',
    viewport: { width: 1440, height: 900 },
    scale: 1,
    touch: false,
    // Measured: 3.5 and 0.5; 2.3–2.4 px and 26–31 %; 1.1; 1.6–1.7 (a level of an 8-bit channel on a dark wall is 1–2).
    colour: { p99: 5, mean: 0.8 },
    edges: { p99: 3.2, overHalf: 0.4 },
    swap: 1.8,
    frame: 2.4,
  },
  {
    name: 'a phone',
    viewport: { width: 390, height: 844 },
    scale: 2,
    touch: true,
    // Measured: 3.9 and 0.5; 2.5–3.4 px and 12–25 %; 0.8–1.0; 1.5–1.7.
    colour: { p99: 5.5, mean: 0.75 },
    edges: { p99: 4, overHalf: 0.35 },
    swap: 1.6,
    frame: 2.4,
  },
];

async function heldPage(browser: Browser, entry: (typeof HELD)[number]): Promise<Page> {
  const context = await browser.newContext({
    viewport: entry.viewport,
    deviceScaleFactor: entry.scale,
    hasTouch: entry.touch,
    isMobile: entry.touch,
  });
  const page = await context.newPage();
  await openOnTitle(page, '&quality=high');
  // The whole room is lit behind the game before the two are compared.
  await page.waitForTimeout(1500);
  return page;
}

for (const entry of HELD) {
  test(`the hand-over on ${entry.name}: the last frame of the still against the live room, and the ease between`, async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const page = await heldPage(browser, entry);
    // The way out and the pad arrive after the still, on their own: they are not part of what is compared.
    await page.addStyleTag({ content: '.tv-way-out, .touchpad { visibility: hidden !important; }' });
    await toBlack(page);
    await settle(page);
    const before = await pixelsOf(page);
    // The hand-over's frame, with the still's own transitions held at their start.
    const total = await page.evaluate(() => {
      window.__arcade?.step(1);
      const animations = (document.getElementById('tv-still') as HTMLElement).getAnimations();
      for (const animation of animations) animation.pause();
      (window as unknown as { __ease: Animation[] }).__ease = animations;
      return Math.max(0, ...animations.map((animation) => Number(animation.effect?.getComputedTiming().endTime ?? 0)));
    });
    expect(total, 'the still eases out').toBeGreaterThan(0);
    const seek = (ms: number): Promise<void> =>
      page.evaluate((time) => {
        for (const animation of (window as unknown as { __ease: Animation[] }).__ease) animation.currentTime = time;
      }, ms);
    // The steepest part of the ease, a sixtieth of a second at a time, and the frame the hand-over itself is.
    await settle(page);
    let previous = blocksOf(await pixelsOf(page));
    const swap = colourDifference(blocksOf(before), previous, entry.scale).max;
    let steepest = 0;
    for (let frame = 1; frame <= 24; frame++) {
      await seek((frame * 1000) / 60);
      await settle(page);
      const now = blocksOf(await pixelsOf(page));
      steepest = Math.max(steepest, colourDifference(previous, now, entry.scale).max);
      previous = now;
    }
    await page.evaluate(() => {
      for (const animation of (window as unknown as { __ease: Animation[] }).__ease) animation.finish();
    });
    await expect.poll(async () => (await handover(page)).stillVisibility).toBe('hidden');
    await settle(page);
    const after = await pixelsOf(page);
    // The live room on a black picture stands still: what differs is the still's.
    await settle(page);
    const again = await pixelsOf(page);
    expect(
      colourDifference(blocksOf(after), blocksOf(again), entry.scale).max,
      'the live room against itself',
    ).toBeLessThan(0.5);

    const colour = colourDifference(blocksOf(before), blocksOf(after), entry.scale);
    const edges = edgeShift(before, after);
    console.log(
      `hand-over on ${entry.name}: ΔE00 max ${colour.max.toFixed(2)} p99 ${colour.p99.toFixed(2)} mean ${colour.mean.toFixed(2)}; ` +
        `edges p99 ${edges.p99.toFixed(2)} px, ${(edges.overHalf * 100).toFixed(1)} % over half a pixel of ${edges.matched}; ` +
        `the hand-over's frame ${swap.toFixed(2)}, the steepest frame of the ease ${steepest.toFixed(2)}`,
    );
    expect(colour.p99, 'ΔE00 of the still against the live room, 99th percentile').toBeLessThan(entry.colour.p99);
    expect(colour.mean, 'ΔE00 of the still against the live room, mean').toBeLessThan(entry.colour.mean);
    expect(edges.p99, 'how far the still’s edges lie from the room’s, 99th percentile (CSS px)').toBeLessThan(
      entry.edges.p99,
    );
    expect(edges.overHalf, 'the part of the edges over half a pixel off').toBeLessThan(entry.edges.overHalf);
    expect(swap, 'the most a block changes in the hand-over’s own frame (ΔE00)').toBeLessThan(entry.swap);
    expect(steepest, 'the most a block changes in one frame of the ease (ΔE00)').toBeLessThan(entry.frame);
    await page.context().close();
  });
}
