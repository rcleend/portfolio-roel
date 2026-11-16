import { type Browser, expect, type Page, type Request, test } from '@playwright/test';
import sharp from 'sharp';
import type {} from '../src/room/lab/main';
import { GPU_LAUNCH_ARGS } from './gpu';
import { trackErrors } from './helpers';
import { POSTERS_PATH, POSTERS_PROGRAMS, postersShown } from './programs';

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS } });

/** The decorated walls' draw calls in the room view: cards and skirts, or the cards alone on the lite path. */
const POSTERS_DRAW_CALLS = POSTERS_PATH === 'lite' ? 1 : 2;

/** The files the walls were once fetched from (a model and a baked atlas in two sizes): none is asked for any more. */
const POSTER_FILE = /\/posters(?:-1k|-2k)?\.(?:webp|glb)$/;
/** The lazy chunk as the dev server serves it: held back, the walls arrive late. */
const POSTER_CHUNK = /\/src\/room\/posters\/PosterWall\.ts(?:\?.*)?$/;
/**
 * Where the walls get to at the TV: up (uploaded between the game's frames, hidden there) on a hardware GPU, painted
 * with only the upload left on the lite path, which uploads on the first departure.
 */
const AT_TV = POSTERS_PATH === 'full' ? 'ready' : 'staged';

/** Waits until the walls have got as far at the TV as they get there (AT_TV). */
const doneAtTv = (page: Page, timeout = 10_000) =>
  page.waitForFunction((state) => window.__roomLab?.room.stats.posters === state, AT_TV, { timeout });

const stats = (page: Page) => page.evaluate(() => window.__roomLab?.room.stats);

/** The posters' old files this page has asked for, by name. */
function trackPosterRequests(page: Page): string[] {
  const names: string[] = [];
  page.on('request', (request: Request) => {
    const path = new URL(request.url()).pathname;
    if (POSTER_FILE.test(path)) names.push(path.slice(path.lastIndexOf('/') + 1));
  });
  return names;
}

/** The lab at the TV, powered on and running; `query` adds lab parameters (`&posters=0`, `&mockradio=1`). */
async function atTv(page: Page, query = ''): Promise<void> {
  await page.goto(`/room-lab.html?clean${query}`);
  await page.waitForFunction(() => window.__roomLab !== undefined);
  await page.evaluate(() => window.__roomLab?.room.ready);
  await page.waitForFunction(() => window.__roomLab?.surface.paused === false, null, { timeout: 20_000 });
}

/** Requests a view and waits until the camera has come to rest there and the room stopped rendering. */
async function settleAt(page: Page, view: 'tv' | 'room' | 'pc' | 'radio'): Promise<void> {
  await page.evaluate(
    (target) =>
      new Promise<void>((resolve) => {
        const room = window.__roomLab?.room;
        if (!room) throw new Error('No room');
        const stop = room.onSettle((settled) => {
          if (settled !== target) return;
          stop();
          resolve();
        });
        if (target === 'tv') room.focusTv();
        if (target === 'room') room.showRoom();
        if (target === 'pc') room.focusPc();
        if (target === 'radio') room.focusRadio();
      }),
    view,
  );
  await page.waitForFunction(() => window.__roomLab?.room.stats.renderLoopIdle === true, null, { timeout: 10_000 });
}

/** Cuts from the TV to the room view and reads the posters' state at the first frame the veil lifts. */
function postersWhenTheVeilLifts(page: Page): Promise<string | undefined> {
  return page.evaluate(
    () =>
      new Promise<string | undefined>((resolve) => {
        const room = window.__roomLab?.room;
        if (!room) throw new Error('No room');
        // The cut holds its black until the walls are up: at the first frame the veil lifts, they are there.
        let last = 0;
        const look = () => {
          const veil = room.stats.screenFade;
          if (veil < last) resolve(room.stats.posters);
          else {
            last = veil;
            requestAnimationFrame(look);
          }
        };
        room.showRoom();
        look();
      }),
  );
}

interface Resting {
  /** Draw calls of the last frame at rest at the TV, before and after the room view, at the PC and at the radio. */
  readonly tvBefore: number;
  readonly room: number;
  readonly tv: number;
  readonly pc: number;
  readonly radio: number;
  /** Programs compiled by the room view, once the posters are shown. */
  readonly programs: number;
}

/** Draw calls of the last frame at rest in each view, after one room view (where the posters go up, if `decorated`). */
async function restingCalls(page: Page, decorated: boolean): Promise<Resting> {
  const calls = async (): Promise<number> => (await stats(page))?.drawCalls ?? -1;
  await atTv(page, decorated ? '&mockradio=1' : '&mockradio=1&posters=0');
  // A paused game draws the same as a playing one, and lets a software GPU's loop come to rest at the TV too.
  await page.evaluate(() => window.__roomLab?.surface.pause());
  await page.waitForFunction(() => window.__roomLab?.room.stats.renderLoopIdle === true, null, { timeout: 10_000 });
  const tvBefore = await calls();
  await settleAt(page, 'room');
  if (decorated) await postersShown(page, () => stats(page));
  // The radio prepares on the room view's idle time (the playing TV leaves it none), so both pages wait for it here.
  await page.waitForFunction(() => window.__roomLab?.room.stats.radioReady === true, null, { timeout: 20_000 });
  await page.waitForFunction(() => window.__roomLab?.room.stats.renderLoopIdle === true, null, { timeout: 10_000 });
  const room = await calls();
  const programs = (await stats(page))?.programs ?? -1;
  await settleAt(page, 'pc');
  const pc = await calls();
  await settleAt(page, 'tv');
  const tv = await calls();
  await settleAt(page, 'radio');
  return { tvBefore, room, tv, pc, radio: await calls(), programs };
}

test.describe('the decorated walls', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('add one program and their draw calls to the room view, and nothing at rest anywhere else', async ({
    browser,
  }) => {
    // Two pages walk all five views each; on a software GPU under load that alone can take most of 30 s.
    test.setTimeout(60_000);
    const bare = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const without = await restingCalls(bare, false);
    await bare.close();

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = trackErrors(page);
    const decorated = await restingCalls(page, true);
    expect((await stats(page))?.postersTexturePixels).toBeGreaterThan(0);
    await page.close();

    expect(decorated.programs - without.programs).toBe(POSTERS_PROGRAMS);
    expect(decorated.room - without.room).toBe(POSTERS_DRAW_CALLS);
    // The per-pose rule hides the node wherever no piece is in the resting frame (docs/ROOM.md › Posters).
    for (const view of ['tvBefore', 'tv', 'pc', 'radio'] as const) expect(decorated[view], view).toBe(without[view]);
    expect(errors).toEqual([]);
  });

  test('are painted at the TV without a fetch, uploaded there on a hardware GPU, and shown before the room view settles', async ({
    page,
  }) => {
    const errors = trackErrors(page);
    const requested = trackPosterRequests(page);
    await atTv(page);
    // On a hardware GPU the atlas goes up between the game's frames at the TV (hidden there); the lite path keeps it
    // on the CPU until the first departure.
    await doneAtTv(page);
    expect((await stats(page))?.postersTexturePixels).toBe(POSTERS_PATH === 'full' ? 2048 * 1024 : 0);
    const postersAtSettle = await page.evaluate(
      () =>
        new Promise<string | undefined>((resolve) => {
          const room = window.__roomLab?.room;
          if (!room) throw new Error('No room');
          const stop = room.onSettle((view) => {
            if (view !== 'room') return;
            stop();
            resolve(room.stats.posters);
          });
          room.showRoom();
        }),
    );
    expect(postersAtSettle).toBe('ready');
    // The atlas is the 2K at this size.
    expect((await stats(page))?.postersTexturePixels).toBe(2048 * 1024);
    // And it is a picture: the cluster over the radio reads as paper and ink in the night's light, not as the black
    // or the blank grey a painting lost on its way to the GPU leaves (a bitmap of GPU pixels from a worker did).
    await page.evaluate(() => window.__roomLab?.surface.pause());
    await page.waitForFunction(() => window.__roomLab?.room.stats.renderLoopIdle === true, null, { timeout: 10_000 });
    const cluster = await page.screenshot({ clip: { x: 570, y: 165, width: 420, height: 270 } });
    const { channels } = await sharp(cluster).removeAlpha().stats();
    const mean = channels.reduce((sum, channel) => sum + channel.mean, 0) / channels.length;
    const spread = Math.max(...channels.map((channel) => channel.stdev));
    expect(mean).toBeGreaterThan(40);
    expect(spread).toBeGreaterThan(30);
    expect(requested).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('stay bare with ?posters=0 and ask for none of their files', async ({ page }) => {
    const requested = trackPosterRequests(page);
    await atTv(page, '&posters=0');
    await settleAt(page, 'room');
    expect((await stats(page))?.posters).toBe('off');
    expect(await page.evaluate(() => window.__roomLab?.room.postersReady)).toBe(false);
    expect(requested).toEqual([]);
  });

  test('paint the 1K on a device with little memory', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 });
    });
    const errors = trackErrors(page);
    const requested = trackPosterRequests(page);
    await atTv(page);
    await settleAt(page, 'room');
    await postersShown(page, () => stats(page));
    expect((await stats(page))?.postersTexturePixels).toBe(1024 * 512);
    expect(requested).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('are painted on the main thread, a sheet per idle unit, where the painter has no OffscreenCanvas', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, 'OffscreenCanvas');
    });
    const errors = trackErrors(page);
    await atTv(page);
    await settleAt(page, 'room');
    await postersShown(page, () => stats(page));
    expect((await stats(page))?.postersTexturePixels).toBe(2048 * 1024);
    expect(errors).toEqual([]);
  });

  test('come back after the GPU context is lost and restored: painted again, uploaded again', async ({ page }) => {
    const errors = trackErrors(page);
    await atTv(page);
    await page.evaluate(() => window.__roomLab?.surface.pause());
    await settleAt(page, 'room');
    await postersShown(page, () => stats(page));
    // The painted pixels were let go once they were up: a new context gets a new painting.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const canvas = document.querySelector('canvas');
          const context = canvas?.getContext('webgl2');
          const lose = context?.getExtension('WEBGL_lose_context');
          if (!canvas || !lose) throw new Error('No WEBGL_lose_context');
          canvas.addEventListener('webglcontextrestored', () => resolve(), { once: true });
          canvas.addEventListener('webglcontextlost', () => setTimeout(() => lose.restoreContext(), 50), {
            once: true,
          });
          lose.loseContext();
        }),
    );
    await postersShown(page, () => stats(page));
    expect((await stats(page))?.postersTexturePixels).toBe(2048 * 1024);
    expect(errors).toEqual([]);
  });

  test('reveal a late arrival with a fade and end shown', async ({ page }) => {
    const errors = trackErrors(page);
    // The walls' chunk is held until the camera has come to rest in the room (a fixed delay raced a loaded machine).
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(POSTER_CHUNK, async (route) => {
      await held;
      await route.continue();
    });
    await atTv(page);
    await settleAt(page, 'room');
    expect((await stats(page))?.posters).toBe('loading');
    release();
    // At the first frame they are shown, the pieces in frame are fading in (on the full path; the lite path pops).
    const fadingWhenShown = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const look = () => {
            const shown = window.__roomLab?.room.stats;
            if (shown?.posters === 'ready') resolve(shown.postersFading);
            else requestAnimationFrame(look);
          };
          look();
        }),
      null,
    );
    expect(fadingWhenShown).toBe(POSTERS_PATH === 'full');
    await postersShown(page, () => stats(page));
    // The fade rendered frames after the camera came to rest; then it ended and the room is idle again.
    await page.waitForFunction(() => window.__roomLab?.room.stats.renderLoopIdle === true, null, { timeout: 10_000 });
    expect((await stats(page))?.postersFading).toBe(false);
    expect(errors).toEqual([]);
  });
});

test.describe('under reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

  test('the cut from the TV opens on decorated walls once they are painted there', async ({ page }) => {
    const errors = trackErrors(page);
    await atTv(page);
    // The cut holds only for what is left of the painting and the upload (PosterWall.holdsCut): on the lite path the
    // upload; on a hardware GPU nothing is left by then.
    await doneAtTv(page);
    expect(await postersWhenTheVeilLifts(page)).toBe('ready');
    expect(errors).toEqual([]);
  });

  test('on a slow CPU too, the walls get as far at the TV and are up when the veil lifts', { tag: '@frames' }, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    // At 6x the TV-side units (the import, the painting, on a hardware GPU the program and the strips) must not
    // queue behind the room's longer units for the whole stay at the TV (IdleWork runs the first queued unit that fits
    // the idle period); on the lite path the held black runs what is left (the strips) in whole idle periods, so the cut
    // still opens on decorated walls.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    const errors = trackErrors(page);
    await atTv(page);
    await doneAtTv(page, 15_000);
    expect(await postersWhenTheVeilLifts(page)).toBe('ready');
    expect(errors).toEqual([]);
  });

  test('a late arrival fades in here too: a fade is not motion', async ({ page }) => {
    const errors = trackErrors(page);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(POSTER_CHUNK, async (route) => {
      await held;
      await route.continue();
    });
    await atTv(page);
    await settleAt(page, 'room');
    expect((await stats(page))?.posters).toBe('loading');
    release();
    const fadingWhenShown = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          const look = () => {
            const shown = window.__roomLab?.room.stats;
            if (shown?.posters === 'ready') resolve(shown.postersFading);
            else requestAnimationFrame(look);
          };
          look();
        }),
      null,
    );
    expect(fadingWhenShown).toBe(POSTERS_PATH === 'full');
    await page.waitForFunction(() => window.__roomLab?.room.stats.renderLoopIdle === true, null, { timeout: 10_000 });
    expect((await stats(page))?.postersFading).toBe(false);
    expect(errors).toEqual([]);
  });

  test('a cut to the computer or the radio never waits for the walls, hidden at rest there', async ({ page }) => {
    await atTv(page, '&mockradio=1');
    await doneAtTv(page);
    // Their black lasts as long as without the posters: no hold (the radio's own hold waits on its close-up only).
    const heldFrames = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const room = window.__roomLab?.room;
          if (!room) throw new Error('No room');
          let black = 0;
          const stop = room.onSettle((view) => {
            if (view !== 'pc') return;
            stop();
            resolve(black);
          });
          const look = () => {
            if (room.stats.screenFade === 1) black++;
            requestAnimationFrame(look);
          };
          room.focusPc();
          look();
        }),
    );
    expect(heldFrames).toBeLessThanOrEqual(2);
  });
});

type PosterPart = 'cards' | 'skirts';

/** The room view at rest, reduced motion and the game paused (a still frame), drawn without `hidden`; RGB rows. */
async function roomFrame(browser: Browser, hidden: readonly PosterPart[]): Promise<Buffer> {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  if (hidden.length > 0) {
    // posterKit.ts as served, its materials for the hidden parts made invisible (three skips their draws).
    await page.route(/\/src\/room\/posters\/posterKit\.ts(?:\?.*)?$/, async (route) => {
      const response = await route.fetch();
      const hide = hidden.map(
        (part) =>
          `{ const make = posterKit.${part}Material; posterKit.${part}Material = () => Object.assign(make(), { visible: false }); }`,
      );
      await route.fulfill({ response, body: `${await response.text()}\n${hide.join('\n')}\n` });
    });
  }
  await atTv(page);
  await page.evaluate(() => window.__roomLab?.surface.pause());
  await settleAt(page, 'room');
  await postersShown(page, () => stats(page));
  await page.waitForFunction(() => window.__roomLab?.room.stats.renderLoopIdle === true, null, { timeout: 10_000 });
  const png = await page.locator('canvas').first().screenshot();
  await page.close();
  return sharp(png).removeAlpha().raw().toBuffer();
}

test.describe('the skirts', () => {
  test.skip(POSTERS_PATH === 'lite', 'the lite path draws no skirts');

  // The skirts' contact shadows multiply the wall around and under each card; a card, and the tape over its corners
  // (0.2 mm above the skirt), must cover them wherever it is. A draw-order fault there turns the tape into dark blots
  // that no atlas check can see, so this compares rendered frames.
  test('darken the wall only: no pixel of a card or its tape is darker for them', async ({ browser }) => {
    // Device pixels: at DPR 2 a taped corner is some 20 px across.
    const width = 2880;
    const height = 1800;
    const decorated = await roomFrame(browser, []);
    const withoutSkirts = await roomFrame(browser, ['skirts']);
    const bare = await roomFrame(browser, ['cards', 'skirts']);
    const luma = (frame: Buffer, at: number) =>
      0.2126 * (frame[at * 3] ?? 0) + 0.7152 * (frame[at * 3 + 1] ?? 0) + 0.0722 * (frame[at * 3 + 2] ?? 0);
    // Where the cards change the bare room in both decorated frames, a card covers the pixel; 2 px in from the cards'
    // outlines, where an antialiased edge pixel rightly mixes in the skirt-darkened wall. Asking both frames keeps out
    // whatever differs between the three page loads by itself, such as a state caught at a moment of the page's own
    // timing: with one frame's card mask, a few such pixels once read 169 levels darker under a full suite's load.
    const covered = new Uint8Array(width * height);
    const changes = (frame: Buffer, at: number) => Math.abs(luma(frame, at) - luma(bare, at)) > 6;
    for (let at = 0; at < width * height; at++) {
      covered[at] = changes(withoutSkirts, at) && changes(decorated, at) ? 1 : 0;
    }
    const inside = (x: number, y: number) => {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) if (!covered[(y + dy) * width + x + dx]) return false;
      }
      return true;
    };
    let cards = 0;
    let darkened = 0;
    let deepest = 0;
    // The first few darkened pixels, so a failure says where to look: device x,y and the luma there decorated, without
    // the skirts and bare.
    const samples: string[] = [];
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        if (!inside(x, y)) continue;
        cards++;
        const at = y * width + x;
        const drop = luma(withoutSkirts, at) - luma(decorated, at);
        if (drop > 4) {
          darkened++;
          if (samples.length < 8) {
            const levels = [decorated, withoutSkirts, bare].map((frame) => luma(frame, at).toFixed(0)).join('/');
            samples.push(`${x},${y} ${levels}`);
          }
        }
        deepest = Math.max(deepest, drop);
      }
    }
    expect(cards).toBeGreaterThan(200_000);
    // Measured: skirts drawn over the cards (the fault) darken 620 such pixels, by up to 110 levels; in the right order
    // none, by at most 1.1 levels.
    expect(darkened, `darkened card pixels: ${samples.join('; ')}`).toBeLessThanOrEqual(5);
    expect(deepest).toBeLessThan(8);
  });
});
