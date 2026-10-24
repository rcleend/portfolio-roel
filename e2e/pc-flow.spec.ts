import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import type {} from '../src/app/hosts/RoomHost';
import { experience, profile } from '../src/content';
import { GPU_LAUNCH_ARGS } from './gpu';
import { hostElement, paused, trackErrors, waitForRunning } from './helpers';

/**
 * The computer on the desk in the real app: the room's flight and live
 * screen with the screen experience inside it. Once the visitor is in the
 * room with the PC's chunks loaded, the page's clock is paused and moved on
 * frame by frame, so the camera, the startup cues and the timing budgets
 * (docs/PC.md, docs/ROOM.md) are checked on exact ticks.
 */

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS }, viewport: { width: 1440, height: 900 } });

/** Bare wall beside the window, outside every prop in the room and at the computer. */
const WALL = { x: 40, y: 450 };
/** Shader programs after the first room view, pinned at 2494ded before the computer existed (e2e/pc-monitor.spec.ts). */
const BASE_PROGRAMS = 7;
/** One frame of the paused clock. */
const FRAME = 16;
/** Longer than any flight (1.1 s) or reduced-motion cut (0.28 s). */
const SETTLE_MS = 1200;
/** The PC's lazy chunks, in development (`/src/…/pcStill.ts`) and production (`pcStill-<hash>.js`) alike. */
const PC_CHUNK = /pcStill|PcExperience/;

const stage = (page: Page) => hostElement(page);
const view = (page: Page) => page.evaluate(() => window.__room?.view);
const live = (page: Page) => page.evaluate(() => window.__room?.pc.live === true);
const pcState = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-pc-state]')?.getAttribute('data-pc-state'));
const stats = (page: Page) => page.evaluate(() => window.__room?.stats);
const frame = (page: Page) => page.evaluate(() => window.__arcade?.state().frame);
const reader = (page: Page) => page.getByRole('dialog', { name: /Roel Leenders CV/ });
const pane = (page: Page) => page.getByRole('document', { name: "Roel Leenders' résumé" });

async function anchor(page: Page, target: 'tv' | 'pc') {
  const found = await page.evaluate((name) => window.__room?.anchors.find((entry) => entry.target === name), target);
  if (!found) throw new Error(`The room has no ${target} anchor`);
  return found;
}

/** The page on the TV with the game running; the clock is installed but still flowing. */
async function openRoom(page: Page): Promise<void> {
  await page.clock.install();
  await page.goto('/?seed=1');
  await waitForRunning(page);
}

/**
 * Looks around the room the way `go` does, waits for what the room view preloads (the screen's chunk,
 * the painted still), then pauses the clock with the camera settled.
 */
async function lookAround(page: Page, go: () => Promise<void> = () => page.mouse.click(WALL.x, WALL.y)) {
  await go();
  await expect(stage(page)).toHaveAttribute('data-view', 'room');
  await expect(page.locator('.pc-screen')).toBeAttached();
  await expect.poll(async () => (await stats(page))?.pcTexturePixels ?? 0).toBeGreaterThan(0);
  // A second ahead, so a busy machine cannot make the pause land in the page's past.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await advance(page, SETTLE_MS);
}

/** Moves the paused clock on in frames, so the room draws and React renders between timers as in real time. */
async function advance(page: Page, ms: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += FRAME) await page.clock.runFor(Math.min(FRAME, ms - elapsed));
}

/** Moves the paused clock on frame by frame until `check` passes; returns how long that took. */
async function advanceUntil(page: Page, check: () => Promise<boolean>, limitMs = 3000): Promise<number> {
  for (let elapsed = 0; elapsed <= limitMs; elapsed += FRAME) {
    if (await check()) return elapsed;
    await page.clock.runFor(FRAME);
  }
  throw new Error(`Still waiting after ${limitMs} ms`);
}

/** Clicks the computer in the settled room view and returns once the live screen is up. */
async function sitDown(page: Page): Promise<void> {
  const pc = await anchor(page, 'pc');
  await page.mouse.click(pc.x, pc.y);
  await expect(stage(page)).toHaveAttribute('data-view', 'pc');
  await advanceUntil(page, () => live(page));
}

/**
 * Records every texture upload the page makes from an image (the room's atlases are ImageBitmaps),
 * with its size and time, into `window.__uploads`.
 */
async function recordUploads(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const uploads: { at: number; pixels: number }[] = [];
    for (const context of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
      for (const name of ['texImage2D', 'texSubImage2D'] as const) {
        const upload = context[name] as (...args: unknown[]) => void;
        Object.defineProperty(context, name, {
          value(this: WebGLRenderingContext, ...args: unknown[]) {
            const source = args.at(-1) as { width?: unknown; height?: unknown } | null;
            const pixels = typeof source?.width === 'number' ? source.width * Number(source.height) : 0;
            uploads.push({ at: performance.now(), pixels });
            return upload.apply(this, args);
          },
        });
      }
    }
    (window as unknown as { __uploads: typeof uploads }).__uploads = uploads;
  });
}

/** Large images (1024² and up) uploaded since `since`, on the page's own clock. */
const largeUploadsSince = (page: Page, since: number) =>
  page.evaluate(
    (after) =>
      (window as unknown as { __uploads: { at: number; pixels: number }[] }).__uploads.filter(
        (upload) => upload.at > after && upload.pixels >= 1024 * 1024,
      ).length,
    since,
  );

/** Waits until the room has nothing left to do ahead of need (in the room view, where nothing plays). */
async function untilIdle(page: Page): Promise<void> {
  await expect.poll(async () => (await stats(page))?.backgroundPending).toBe(false);
}

/** `performance.now()` when `#game` turned running, recorded from the page's own clock. */
async function recordRunning(page: Page): Promise<void> {
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (document.getElementById('game')?.dataset.phase !== 'running') return;
      (window as unknown as { __runningAt: number }).__runningAt = performance.now();
      observer.disconnect();
    }).observe(document, { subtree: true, childList: true, attributeFilter: ['data-phase'] });
  });
}

const runningAt = (page: Page) => page.evaluate(() => (window as unknown as { __runningAt: number }).__runningAt);

const untilReader = (page: Page) => advanceUntil(page, async () => (await pcState(page)) === 'reader');
/** The focused element's outline style: the document pane's focus ring is its outline. */
const focusRing = (page: Page) =>
  page.evaluate(() => (document.activeElement ? getComputedStyle(document.activeElement).outlineStyle : null));
const mode = (page: Page) =>
  page.evaluate(() => document.querySelector('[data-pc-mode]')?.getAttribute('data-pc-mode'));
const canvasCursor = (page: Page) =>
  page.evaluate(() => document.querySelector<HTMLCanvasElement>('[data-host] canvas')?.style.cursor);
/** How far down the résumé the pane is scrolled, 0–1. */
const readingShare = (page: Page) =>
  pane(page).evaluate((element) => element.scrollTop / (element.scrollHeight - element.clientHeight));

test('sits down at the computer, reads the résumé and gets up again', async ({ page }) => {
  const errors = trackErrors(page);
  await openRoom(page);
  await lookAround(page);
  expect(await paused(page)).toBe(true);
  const frozen = await frame(page);

  await sitDown(page);
  expect(await untilReader(page)).toBeLessThanOrEqual(1900);
  await expect(reader(page)).toBeVisible();
  await expect(pane(page)).toBeFocused();
  // Opened with the mouse: the document has the keys but shows no focus ring.
  expect(await focusRing(page)).toBe('none');
  await expect(pane(page)).toContainText(profile.name);
  for (const job of experience) await expect(pane(page)).toContainText(job.role);
  expect(await paused(page)).toBe(true);
  expect(await frame(page)).toBe(frozen);

  await page.getByRole('button', { name: 'Close the résumé' }).click();
  await expect(reader(page)).toHaveCount(0);
  expect(await advanceUntil(page, async () => (await view(page)) === 'room')).toBeLessThanOrEqual(1500);
  await expect(stage(page)).toBeFocused();
  await advance(page, SETTLE_MS);

  const tv = await anchor(page, 'tv');
  await page.mouse.click(tv.x, tv.y);
  await advance(page, SETTLE_MS);
  expect(await view(page)).toBe('tv');
  expect(await paused(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('clicking outside the computer while reading gets up at once', async ({ page }) => {
  await openRoom(page);
  await lookAround(page);
  await sitDown(page);
  await untilReader(page);
  await page.mouse.click(WALL.x, WALL.y);
  expect(await view(page)).toBe('room');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-pc-screen]')).toBeHidden();
});

test('Escape while reading gets up again', async ({ page }) => {
  await openRoom(page);
  await lookAround(page);
  await sitDown(page);
  await untilReader(page);
  await page.keyboard.press('Escape');
  expect(await advanceUntil(page, async () => (await view(page)) === 'room')).toBeLessThanOrEqual(1500);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(stage(page)).toBeFocused();
});

test('Escape during the flight in turns back before the screen or the reader ever shows', async ({ page }) => {
  await openRoom(page);
  await lookAround(page);
  await page.evaluate(() => {
    const seen = { live: false, dialog: false };
    window.__room?.pc.onLiveChange((value) => {
      seen.live ||= value;
    });
    new MutationObserver(() => {
      seen.dialog ||= document.querySelector('[role="dialog"]') !== null;
    }).observe(document.body, { childList: true, subtree: true, attributes: true });
    (window as unknown as { __seen: typeof seen }).__seen = seen;
  });
  const pc = await anchor(page, 'pc');
  await page.mouse.click(pc.x, pc.y);
  await advance(page, 400);
  await page.keyboard.press('Escape');
  expect(await view(page)).toBe('room');
  await advance(page, 2500);
  expect(await page.evaluate(() => (window as unknown as { __seen: unknown }).__seen)).toEqual({
    live: false,
    dialog: false,
  });
});

test('a click on the splash skips straight to the reader', async ({ page }) => {
  await openRoom(page);
  await lookAround(page);
  await sitDown(page);
  await advanceUntil(page, async () => (await pcState(page)) === 'splash');
  const placement = await page.evaluate(() => window.__room?.pc.placement);
  if (!placement) throw new Error('No placement');
  await page.mouse.click(placement.left + placement.width / 2, placement.top + placement.height / 2);
  expect(await advanceUntil(page, async () => (await pcState(page)) === 'reader')).toBeLessThanOrEqual(200);
  await expect(reader(page)).toBeVisible();
});

test('a click on the monitor itself keeps the reader open and the keys in the document', async ({ page }) => {
  await openRoom(page);
  await lookAround(page);
  await sitDown(page);
  await untilReader(page);
  await expect(pane(page)).toBeFocused();
  const placement = await page.evaluate(() => window.__room?.pc.placement);
  if (!placement) throw new Error('No placement');
  // The tube border beside the picture: part of the computer, which the visitor is using.
  const bezel = { x: placement.left - 12, y: placement.top + placement.height / 2 };
  await page.mouse.move(bezel.x, bezel.y);
  expect(await canvasCursor(page)).toBe('default');
  await page.mouse.click(bezel.x, bezel.y);
  await advance(page, 300);
  expect(await view(page)).toBe('pc');
  await expect(reader(page)).toBeVisible();
  await expect(pane(page)).toBeFocused();
  const top = await pane(page).evaluate((element) => element.scrollTop);
  await page.keyboard.press('PageDown');
  await expect.poll(() => pane(page).evaluate((element) => element.scrollTop)).toBeGreaterThan(top);
});

test.describe('in a 4:3 window', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('leaves room beside the monitor, where a click gets up', async ({ page }) => {
    await openRoom(page);
    await lookAround(page);
    await sitDown(page);
    await untilReader(page);
    expect(await mode(page)).toBe('in-glass');
    for (const x of [3, 1020]) {
      await page.mouse.move(x, 384);
      expect(await canvasCursor(page)).toBe('zoom-out');
    }
    await page.mouse.click(3, 384);
    expect(await view(page)).toBe('room');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('keeps the place and the keys when a resize moves the reader out of the glass and back', async ({ page }) => {
    await openRoom(page);
    await lookAround(page);
    await sitDown(page);
    await untilReader(page);
    await pane(page).evaluate((element) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
    });
    // Snapped to half a screen: the picture becomes too small to read in.
    await page.setViewportSize({ width: 600, height: 900 });
    await advanceUntil(page, async () => (await mode(page)) === 'pop-out');
    await advance(page, 100);
    await expect(pane(page)).toBeFocused();
    expect(await readingShare(page)).toBeCloseTo(0.5, 1);
    // A click in the pop-out's own chrome keeps the keys in its dialog.
    await page.locator('.pc-popout__toolbar').click();
    await expect(reader(page)).toBeFocused();
    // Back to a big window: into the glass again.
    await page.setViewportSize({ width: 1180, height: 820 });
    await advanceUntil(page, async () => (await mode(page)) === 'in-glass');
    await advance(page, 100);
    await expect(pane(page)).toBeFocused();
    expect(await readingShare(page)).toBeCloseTo(0.5, 1);
    await page.keyboard.press('Escape');
    expect(await advanceUntil(page, async () => (await view(page)) === 'room')).toBeLessThanOrEqual(1500);
    await expect(stage(page)).toBeFocused();
  });
});

test.describe('in a short window', () => {
  test.use({ viewport: { width: 1024, height: 600 } });

  test('pops the reader out and drops the hint to click outside, which is not there', async ({ page }) => {
    await openRoom(page);
    await lookAround(page);
    await sitDown(page);
    await untilReader(page);
    expect(await mode(page)).toBe('pop-out');
    // Past the hint's own delay.
    await advance(page, 1500);
    await expect(page.locator('.view-hint')).toBeHidden();
    await expect(page.getByRole('status').filter({ hasText: /outside the computer/ })).toHaveCount(0);
  });

  test('hands the keys back to the stage after a resize while the reader shrinks back', async ({ page }) => {
    await openRoom(page);
    await lookAround(page);
    await sitDown(page);
    await untilReader(page);
    await reader(page).getByRole('button', { name: 'Close the résumé' }).click();
    // Mid-shrink, the window grows past the pop-out's size: the reader would move into the glass.
    await advance(page, 100);
    await page.setViewportSize({ width: 1440, height: 900 });
    await advanceUntil(page, async () => (await view(page)) === 'room');
    await expect(stage(page)).toBeFocused();
    await advance(page, SETTLE_MS);
    await page.keyboard.press('Enter');
    expect(await view(page)).toBe('tv');
  });
});

test('says so when the screen fails to load, and still gets up again', async ({ page }) => {
  await page.route(/PcExperience/, (route) => route.abort());
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  await page.goto('/?seed=1');
  await waitForRunning(page);
  await page.mouse.click(WALL.x, WALL.y);
  await expect.poll(() => warnings.some((text) => text.includes('PC screen failed to load'))).toBe(true);
  await page.waitForTimeout(SETTLE_MS);
  const pc = await anchor(page, 'pc');
  await page.mouse.click(pc.x, pc.y);
  const message = page.getByRole('alert');
  await expect(message).toContainText('The document could not be opened.');
  const link = message.getByRole('link', { name: 'Read the résumé' });
  await expect(link).toHaveAttribute('href', '#resume');
  await page.keyboard.press('Escape');
  await expect.poll(() => view(page)).toBe('room');
  await expect(message).toBeHidden();
  const failures = warnings.length;

  // Escape leaves from the message's link and after a click on the box, and hands the keys back to the stage.
  for (const reach of [() => link.focus(), () => message.click({ position: { x: 4, y: 4 } })]) {
    await page.waitForTimeout(SETTLE_MS);
    await page.mouse.click(pc.x, pc.y);
    await expect(message).toBeVisible();
    await reach();
    await page.keyboard.press('Escape');
    await expect.poll(() => view(page)).toBe('room');
    await expect(stage(page)).toBeFocused();
  }
  // The failure is said once: later visits do not ask again for what cannot load.
  expect(warnings.length).toBe(failures);
});

test.describe('with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('opens the reader within 0.5 s of landing without a single animation', async ({ page }) => {
    await openRoom(page);
    await lookAround(page);
    const animations = () => page.evaluate(() => document.getAnimations().length);
    const pc = await anchor(page, 'pc');
    await page.mouse.click(pc.x, pc.y);
    await advanceUntil(page, async () => (await animations()) === 0 && (await live(page)));
    const readable = await advanceUntil(page, async () => {
      expect(await animations()).toBe(0);
      return (await pcState(page)) === 'reader';
    });
    expect(readable).toBeLessThanOrEqual(500);
    await expect(reader(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await advanceUntil(page, async () => {
      expect(await animations()).toBe(0);
      return (await view(page)) === 'room';
    });
    expect(await animations()).toBe(0);
  });
});

test('the keyboard alone reaches the résumé and the game', async ({ page }) => {
  await openRoom(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Look around the room' })).toBeFocused();
  await lookAround(page, () => page.keyboard.press('Enter'));
  await expect(stage(page)).toBeFocused();

  await page.keyboard.press('Tab');
  const computer = page.getByRole('button', { name: 'Use the computer' });
  await expect(computer).toBeFocused();
  await expect(computer).toBeVisible();
  await page.keyboard.press('Enter');
  await advanceUntil(page, () => live(page));
  await untilReader(page);
  await expect(pane(page)).toBeFocused();
  expect(await focusRing(page)).toBe('solid');

  const dialog = reader(page);
  for (let press = 0; press < 14; press++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await advanceUntil(page, async () => (await view(page)) === 'room');
  await expect(stage(page)).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await view(page)).toBe('tv');
  await advance(page, SETTLE_MS);
  expect(await paused(page)).toBe(false);
});

test.describe('on a retina screen', () => {
  test.use({ deviceScaleFactor: 2 });

  test('the live desktop lands over the still without a visible step', async ({ page }) => {
    await openRoom(page);
    await lookAround(page);
    await sitDown(page);
    // The room's cross-fade runs on the animation timeline, not the page's clock: wait it out.
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
    expect(await handOffDifference(page, 'landing')).toBeLessThanOrEqual(3);
  });

  test('the desktop left behind by the close button is the still the camera pulls back over', async ({ page }) => {
    await openRoom(page);
    await lookAround(page);
    await sitDown(page);
    await untilReader(page);
    await reader(page).getByRole('button', { name: 'Close the résumé' }).click();
    // Inside the 200 ms beat on the desktop, before the camera moves.
    await advance(page, 100);
    expect(await pcState(page)).toBe('closing');
    // The CV icon was double-clicked, and the still never shows it selected.
    await expect(page.locator('.pc-icon[data-selected="true"]')).toHaveCount(0);
    expect(await handOffDifference(page, 'closing')).toBeLessThanOrEqual(3);
  });
});

/**
 * The mean difference, per channel and out of 255, between the live screen and the still under it,
 * inside the picture (its rounded corners and anti-aliased rim are not content).
 */
async function handOffDifference(page: Page, moment: string): Promise<number> {
  const placement = await page.evaluate(() => window.__room?.pc.placement);
  if (!placement) throw new Error('No placement');
  const clip = {
    x: placement.left + 4,
    y: placement.top + 4,
    width: placement.width - 8,
    height: placement.height - 8,
  };
  const shown = await page.screenshot({ clip });
  await page.locator('[data-pc-screen]').evaluate((element) => {
    (element as HTMLElement).style.visibility = 'hidden';
  });
  const hidden = await page.screenshot({ clip });
  const [a, b] = await Promise.all([shown, hidden].map((png) => sharp(png).removeAlpha().raw().toBuffer()));
  if (!a || !b) throw new Error('No screenshots');
  let total = 0;
  for (let index = 0; index < a.length; index++) total += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
  const mean = total / a.length;
  test.info().annotations.push({ type: `hand-off mean |Δ| (${moment})`, description: `${mean.toFixed(2)} / 255` });
  return mean;
}

test('a warm visit is readable within 0.65 s, where the visitor left off', async ({ page }) => {
  await openRoom(page);
  await lookAround(page);
  await sitDown(page);
  await untilReader(page);
  await pane(page).evaluate((element) => {
    element.scrollTop = 600;
  });
  await page.mouse.click(WALL.x, WALL.y);
  await advance(page, SETTLE_MS);

  await sitDown(page);
  expect(await untilReader(page)).toBeLessThanOrEqual(650);
  await expect(reader(page)).toBeVisible();
  expect(await pane(page).evaluate((element) => element.scrollTop)).toBeCloseTo(600, -1);
});

test.describe('performance', () => {
  test('loads nothing for the computer until the game is running', async ({ page }) => {
    // When #game turns running, on the page's own clock: the PC's prefetch may follow within milliseconds.
    await recordRunning(page);
    // The development server serves hundreds of modules: room for every one in the resource timeline.
    await page.addInitScript(() => performance.setResourceTimingBufferSize(5000));
    await page.goto('/?seed=1');
    await waitForRunning(page);
    await page.mouse.click(WALL.x, WALL.y);
    await expect(page.locator('.pc-screen')).toBeAttached();
    const { runningAt, chunks } = await page.evaluate((pattern) => {
      const fetched = performance.getEntriesByType('resource').filter((entry) => new RegExp(pattern).test(entry.name));
      return {
        runningAt: (window as unknown as { __runningAt: number }).__runningAt,
        chunks: fetched.map((entry) => ({ name: entry.name, startTime: entry.startTime })),
      };
    }, PC_CHUNK.source);
    // Both arrive (the still painter once the TV is on, the screen in the room view), and only after the TV is on.
    expect(chunks.some((chunk) => chunk.name.includes('pcStill'))).toBe(true);
    expect(chunks.some((chunk) => chunk.name.includes('PcExperience'))).toBe(true);
    for (const chunk of chunks) expect(chunk.startTime).toBeGreaterThan(runningAt);
  });

  test('uploads nothing while the game plays, and nothing on the way to the computer', async ({ page }) => {
    await recordUploads(page);
    await recordRunning(page);
    await page.goto('/?seed=1');
    await waitForRunning(page);
    // Long enough for the still painter to arrive and be prepared between the game's frames.
    await page.waitForTimeout(2500);
    expect(await view(page)).toBe('tv');
    expect(await largeUploadsSince(page, await runningAt(page))).toBe(0);
    // The first look around draws (and uploads) what the TV view never did, as it always has; the
    // room view's quiet uploads the rest.
    await page.mouse.click(WALL.x, WALL.y);
    await page.waitForTimeout(SETTLE_MS);
    await untilIdle(page);
    const since = await page.evaluate(() => performance.now());
    const pc = await anchor(page, 'pc');
    await page.mouse.click(pc.x, pc.y);
    await expect(page.locator('[data-pc-screen]')).toHaveAttribute('data-live', 'true');
    expect(await largeUploadsSince(page, since)).toBe(0);
  });

  test('renders nothing while the visitor reads or scrolls, and adds no shader program', async ({ page }) => {
    await page.goto('/?seed=1');
    await waitForRunning(page);
    await page.mouse.click(WALL.x, WALL.y);
    await expect(page.locator('.pc-screen')).toBeAttached();
    await page.waitForTimeout(SETTLE_MS);
    expect((await stats(page))?.programs).toBe(BASE_PROGRAMS);
    const pc = await anchor(page, 'pc');
    await page.mouse.click(pc.x, pc.y);
    await expect(page.locator('[data-pc-state="reader"]')).toBeAttached({ timeout: 5_000 });
    // Past the page's fade-in and the light change it makes.
    await page.waitForTimeout(500);

    const reading = (await stats(page))?.framesRendered;
    await page.waitForTimeout(2000);
    expect((await stats(page))?.framesRendered).toBe(reading);

    const box = await pane(page).boundingBox();
    if (!box) throw new Error('No document pane');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let step = 0; step < 10; step++) await page.mouse.wheel(0, 100);
    await expect.poll(() => pane(page).evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(900);
    await page.waitForTimeout(500);
    expect((await stats(page))?.framesRendered).toBe(reading);
    expect((await stats(page))?.programs).toBe(BASE_PROGRAMS);
  });

  test('keeps every flight to and from the computer free of long frames at 6× CPU', async ({ page }) => {
    await page.goto('/?seed=1');
    await waitForRunning(page);
    await page.mouse.click(WALL.x, WALL.y);
    await expect(page.locator('.pc-screen')).toBeAttached();
    await page.waitForTimeout(SETTLE_MS);
    // Flights as the room times them (from the request to the landing), and every frame over 50 ms
    // with the scripts that made it long, so a failure names the work that caused it.
    await page.evaluate(() => {
      const room = window.__room;
      if (!room) throw new Error('No room');
      const log: FlightLog = { flights: [], frames: [] };
      room.onViewChange(() => log.flights.push({ start: performance.now(), end: Number.POSITIVE_INFINITY }));
      room.onSettle(() => {
        const flight = log.flights.at(-1);
        if (flight) flight.end = performance.now();
      });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceLongAnimationFrameTiming[]) {
          const scripts = entry.scripts
            .filter((script) => script.duration > 5)
            .map((script) => `${script.invoker} ${script.sourceFunctionName} ${Math.round(script.duration)} ms`);
          log.frames.push({ start: entry.startTime, duration: entry.duration, scripts });
        }
      }).observe({ type: 'long-animation-frame' });
      (window as unknown as { __flightLog: FlightLog }).__flightLog = log;
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });

    // A person's click: Playwright's default sends press and release in one task, which no hand does.
    const press = { delay: 80 };
    const pc = await anchor(page, 'pc');
    await page.mouse.click(pc.x, pc.y, press);
    await expect(page.locator('[data-pc-state="reader"]')).toBeAttached({ timeout: 10_000 });
    await page.waitForTimeout(300);
    await page.mouse.click(WALL.x, WALL.y, press);
    await expect.poll(() => view(page)).toBe('room');
    await page.waitForTimeout(SETTLE_MS);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

    const { flights, frames } = await page.evaluate(
      () => (window as unknown as { __flightLog: FlightLog }).__flightLog,
    );
    expect(flights.map(({ end }) => Number.isFinite(end))).toEqual([true, true]);
    const during = frames.flatMap((frame) => {
      const flight = flights.findIndex(({ start, end }) => frame.start < end && frame.start + frame.duration > start);
      return flight < 0 ? [] : [{ flight: flight === 0 ? 'to the computer' : 'back to the room', ...frame }];
    });
    expect(during).toEqual([]);
  });
});

/** What the long-frame test records in the page. */
interface FlightLog {
  readonly flights: { readonly start: number; end: number }[];
  readonly frames: { readonly start: number; readonly duration: number; readonly scripts: readonly string[] }[];
}

/** The Long Animation Frames API's entry, which TypeScript's DOM types do not have yet. */
interface PerformanceLongAnimationFrameTiming extends PerformanceEntry {
  readonly scripts: readonly {
    readonly invoker: string;
    readonly sourceFunctionName: string;
    readonly duration: number;
  }[];
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the edge chip leads to a full-screen reader whose close button returns to the room', async ({ page }) => {
    await openRoom(page);
    const pad = page.locator('.touchpad');
    await expect(pad).toHaveAttribute('data-visible', 'true');
    await lookAround(page, () => page.touchscreen.tap(195, 30));
    await expect(pad).toHaveAttribute('data-visible', 'false');

    const chip = page.getByRole('button', { name: 'Use the computer' });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText(/COMPUTER/i);
    await chip.tap();
    await advanceUntil(page, () => live(page));
    await untilReader(page);
    await expect(page.locator('.pc-screen')).toHaveAttribute('data-pc-mode', 'pop-out');
    const dialog = reader(page);
    await expect(dialog).toBeVisible();
    // The breakout's FLIP runs on the animation timeline, not the page's clock.
    await expect.poll(() => dialog.boundingBox()).toEqual({ x: 0, y: 0, width: 390, height: 844 });
    const body = await dialog.locator('.pc-doc__summary').evaluate((element) => {
      return Number.parseFloat(getComputedStyle(element).fontSize);
    });
    expect(body).toBeGreaterThanOrEqual(15);
    await expect(pad).toHaveAttribute('data-visible', 'false');

    const close = dialog.getByRole('button', { name: 'Close the résumé' });
    const box = await close.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await close.tap();
    expect(await advanceUntil(page, async () => (await view(page)) === 'room')).toBeLessThanOrEqual(1500);
    await expect(pad).toHaveAttribute('data-visible', 'false');
    await advance(page, SETTLE_MS);

    const tv = await anchor(page, 'tv');
    await page.touchscreen.tap(tv.x, tv.y);
    await advance(page, SETTLE_MS);
    expect(await view(page)).toBe('tv');
    await expect(pad).toHaveAttribute('data-visible', 'true');
  });

  test('flies to the computer without uploading a texture on the way', async ({ page }) => {
    await recordUploads(page);
    await page.goto('/?seed=1');
    await waitForRunning(page);
    await page.touchscreen.tap(195, 30);
    await page.waitForTimeout(SETTLE_MS);
    // The portrait room view crops the computer out: what only its flight draws is uploaded here.
    await untilIdle(page);
    const since = await page.evaluate(() => performance.now());
    await page.getByRole('button', { name: 'Use the computer' }).tap();
    await expect(page.locator('[data-pc-screen]')).toHaveAttribute('data-live', 'true');
    expect(await largeUploadsSince(page, since)).toBe(0);
  });

  test.describe('with reduced motion', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } });

    test('shows the computer chip only once the camera has settled in the room view', async ({ page }) => {
      await openRoom(page);
      await lookAround(page, () => page.touchscreen.tap(195, 30));
      const chip = page.getByRole('button', { name: 'Use the computer' });
      await chip.tap();
      await advanceUntil(page, () => live(page));
      await untilReader(page);
      await reader(page).getByRole('button', { name: 'Close the résumé' }).tap();
      await advanceUntil(page, async () => (await view(page)) === 'room');
      // The cut to the room is under way: no chip over the very monitor it points to.
      await expect(chip).toHaveCount(0);
      await advance(page, SETTLE_MS);
      await expect(chip).toBeVisible();
    });
  });

  test.describe('held sideways', () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test('also pops the reader out to the whole screen', async ({ page }) => {
      await openRoom(page);
      await lookAround(page, () => page.touchscreen.tap(422, 20));
      const pc = await anchor(page, 'pc');
      if (pc.inFrame) await page.touchscreen.tap(pc.x, pc.y);
      else await page.getByRole('button', { name: 'Use the computer' }).tap();
      await advanceUntil(page, () => live(page));
      await untilReader(page);
      await expect(page.locator('.pc-screen')).toHaveAttribute('data-pc-mode', 'pop-out');
      await expect.poll(() => reader(page).boundingBox()).toEqual({ x: 0, y: 0, width: 844, height: 390 });
    });
  });
});

test('the flat television never loads the computer', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/?host=flat&seed=1');
  await waitForRunning(page);
  // Past every idle prefetch the room host would make.
  await page.waitForTimeout(2500);
  expect(requests.filter((url) => PC_CHUNK.test(url))).toEqual([]);
});
