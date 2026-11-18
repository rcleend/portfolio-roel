import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { GPU_LAUNCH_ARGS } from './gpu';
import { expectRest, expectSixtyFrames, frameRate, roomPace, trackErrors } from './helpers';

test.use({
  launchOptions: { args: GPU_LAUNCH_ARGS },
  viewport: { width: 1440, height: 900 },
});

const stats = (page: import('@playwright/test').Page) => page.evaluate(() => window.__roomLab?.room.stats);

test('the page asks for no model or texture, and one small picture for the startup still: the room is made in the browser', async ({
  page,
}) => {
  const errors = trackErrors(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.goto('/?seed=1');
  await page.waitForFunction(() => window.__room?.stats.generated === 'ready', null, { timeout: 30_000 });
  await page.evaluate(() => window.__room?.showRoom());
  await expect.poll(() => page.evaluate(() => window.__room?.view === 'room' && window.__room.settled)).toBe(true);
  await page.waitForTimeout(1500);
  // Nothing under /room/, and no model or image of the room's from anywhere but the startup still's one picture
  // (docs/ROOM.md › Startup): the size this window takes, in one format, fetched once.
  expect(requests.filter((path) => path.startsWith('/room/'))).toEqual([]);
  const still = requests.filter((path) => path.startsWith('/startup/'));
  expect(still).toHaveLength(1);
  expect(still[0]).toMatch(/^\/startup\/(still|small)-[0-9a-f]{8}\.(avif|webp)$/);
  expect(requests.filter((path) => /\.(glb|gltf|ktx2|webp)$/.test(path) && !path.startsWith('/startup/'))).toEqual([]);
  expect(errors).toEqual([]);
});

test('the room builds in a worker and lights what the TV view shows before the rest', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/room-lab.html?clean&mood=rose&autopower=0');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  await page.evaluate(() => window.__roomLab?.room.ready);
  // Ready means the opening view is lit and drawn; the whole room follows.
  const opening = await stats(page);
  expect(['opening', 'ready']).toContain(opening?.generated);
  expect(await page.evaluate(() => window.__roomLab?.room.shown)).toBe(true);
  expect(opening?.generatedStats?.builtIn).toBe('worker');
  // The TV view's own pass lit a small part of the room's flat surfaces (and every prop's vertices).
  // (A small share of many cells: the rug's relief alone is 5,625 of them.)
  expect(opening?.generatedStats?.openingShare).toBeGreaterThan(0.005);
  expect(opening?.generatedStats?.openingShare).toBeLessThan(0.3);
  expect(await page.evaluate(() => window.__roomLab?.room.generatedReady)).toBe(true);
  const state = await stats(page);
  expect(state?.generated).toBe('ready');
  const built = state?.generatedStats;
  expect(built?.complete).toBe(true);
  // Every light from every point of its emitter, on the top tier (rig.ts), once for each pass.
  expect(built?.views).toBeGreaterThan(200);
  // This GPU is quick: the full profile, and no unit of the rest had to be spaced out.
  expect(built?.profile).toBe('full');
  // The whole room at full detail (the modelled room it replaced: 353 k); a view draws less of it (the next expectation). 118 k
  // with the window, the wire basket and the bulb lamp finely made: measured, the same frame times as at 104 k; 126 k
  // with the TV set (11 k, where its model was 15.9 k): the TV view draws 64 k of them at the frame times of 56 k.
  expect(built?.triangles).toBeLessThan(130_000);
  await page.evaluate(() => window.__roomLab?.room.powerOn());
  await expect.poll(async () => (await stats(page))?.triangles).toBeLessThan(70_000);
  // The whole room is lit, so it rests (docs/ROOM.md › Frames › At rest). A game that runs gets each of its frames,
  // sixty a second; a paused one is a still picture in a view where nothing else moves (the air is the room's, not
  // this view's, and the lava lamp is out of sight), and the room draws no frame for it.
  await page.evaluate(() => window.__roomLab?.surface.resume());
  await expectSixtyFrames(page, 'with the game running at the TV');
  expect((await stats(page))?.pace, 'what the room draws by itself at the TV').toMatchObject({
    pace: 'still',
    moving: [],
    why: '',
  });
  await page.evaluate(() => window.__roomLab?.surface.pause());
  await expectRest(page, 'with the game paused at the TV', []);
  // The set's plastic is dark; the wall behind it and the cabinet under it are not black: the bake reached them.
  const shot = sharp(await page.locator('#stage canvas').screenshot());
  const { width = 1, height = 1 } = await shot.metadata();
  const { data, info } = await shot.raw().toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number): number[] => {
    const offset = (Math.round(y * height) * info.width + Math.round(x * width)) * info.channels;
    return [...data.subarray(offset, offset + 3)];
  };
  const [chin, wall, cabinet] = [at(0.5, 0.82), at(0.06, 0.2), at(0.3, 0.86)];
  const luma = (rgb: number[]) => (rgb[0] ?? 0) + (rgb[1] ?? 0) + (rgb[2] ?? 0);
  expect(luma(chin)).toBeLessThan(60);
  expect(luma(wall)).toBeGreaterThan(20);
  expect(luma(cabinet)).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('a visitor who leaves the TV at once sees the room only once all of it is lit', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/room-lab.html?clean&mood=rose');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  const seen = await page.evaluate(async () => {
    const room = window.__roomLab?.room;
    if (!room) throw new Error('No room');
    await room.ready;
    const atReady = room.stats.generated;
    const left = new Promise<string>((resolve) => room.onViewChange(() => resolve(room.stats.generated)));
    room.showRoom();
    return { atReady, atDeparture: await left };
  });
  // The camera did not set off before the rest of the room was baked.
  expect(seen.atDeparture).toBe('ready');
  // And what it then shows is lit: the floor in the middle of the room view is not black.
  await expect.poll(() => page.evaluate(() => window.__roomLab?.room.settled)).toBe(true);
  const shot = sharp(await page.locator('#stage canvas').screenshot());
  const { data, info } = await shot.raw().toBuffer({ resolveWithObject: true });
  const offset = (Math.round(info.height * 0.85) * info.width + Math.round(info.width * 0.5)) * info.channels;
  expect((data[offset] ?? 0) + (data[offset + 1] ?? 0) + (data[offset + 2] ?? 0)).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test('a GPU that is slow over the first views bakes the shorter profile, and its visitor still leaves for a lit room', async ({
  page,
}) => {
  const errors = trackErrors(page);
  // A slow GPU, as the page sees one: every fence takes 12 ms to be reached, however little was drawn before it. The
  // opening pass times its units by that wait, so its 143 views would take 1.7 s (bake/pace.ts allows 0.8 s).
  await page.addInitScript(() => {
    const proto = WebGL2RenderingContext.prototype;
    const made = new WeakMap<WebGLSync, number>();
    const fence = proto.fenceSync;
    proto.fenceSync = function (...args) {
      const sync = fence.apply(this, args);
      if (sync) made.set(sync, performance.now());
      return sync;
    };
    const wait = proto.clientWaitSync;
    proto.clientWaitSync = function (sync, ...rest) {
      const at = made.get(sync);
      if (at !== undefined && performance.now() - at < 12) return this.TIMEOUT_EXPIRED;
      return wait.call(this, sync, ...rest);
    };
  });
  await page.goto('/room-lab.html?clean&mood=rose');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  const seen = await page.evaluate(async () => {
    const room = window.__roomLab?.room;
    if (!room) throw new Error('No room');
    await room.ready;
    const left = new Promise<string>((resolve) => room.onViewChange(() => resolve(room.stats.generated)));
    const clicked = performance.now();
    room.showRoom();
    return { atDeparture: await left, waited: performance.now() - clicked };
  });
  expect(seen.atDeparture).toBe('ready');
  // The rest of the bake had the GPU to itself: a few units, not one behind every frame.
  expect(seen.waited).toBeLessThan(2500);
  const built = (await stats(page))?.generatedStats;
  expect(built?.profile).toBe('short');
  // The lowest tier's sample counts, once for each pass (the views timed before the bake started over do not count).
  expect(built?.views).toBeGreaterThan(100);
  expect(built?.views).toBeLessThan(200);
  // And what the room view shows is lit.
  await expect.poll(() => page.evaluate(() => window.__roomLab?.room.settled)).toBe(true);
  const shot = sharp(await page.locator('#stage canvas').screenshot());
  const { data, info } = await shot.raw().toBuffer({ resolveWithObject: true });
  const offset = (Math.round(info.height * 0.85) * info.width + Math.round(info.width * 0.5)) * info.channels;
  expect((data[offset] ?? 0) + (data[offset + 1] ?? 0) + (data[offset + 2] ?? 0)).toBeGreaterThan(30);
  expect(errors).toEqual([]);
});

test('a room that cannot be built hands over to the flat television', async ({ page }) => {
  // Neither the worker nor the main thread's own copy of the generators can be had.
  await page.route(/\/gen\/(worker|scene)\.ts/, (route) => route.abort());
  await page.goto('/?seed=1');
  await expect(page.locator('[data-host="flat"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-host="room"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.getElementById('game')?.dataset.phase)).toBe('running');
});

test("the lava lamp's wax moves by the clock and stands still on request", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/room-lab.html?clean&mood=rose&view=room');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  expect(await page.evaluate(() => window.__roomLab?.room.generatedReady)).toBe(true);
  // The wax's vertices as one number (dev only: GeneratedRoom hands itself out).
  const lamp = () =>
    page.evaluate(() => {
      type Wax = { geometry: { getAttribute(name: string): { array: Float32Array } } };
      const room = (globalThis as unknown as { __generatedRoom: { lava: { meshes: Wax[] } } }).__generatedRoom;
      const positions = room.lava.meshes[0]?.geometry.getAttribute('position').array ?? new Float32Array();
      return { wax: positions.reduce((sum, value, index) => sum + value * (index % 7), 0) };
    });
  await expect.poll(async () => (await stats(page))?.lavaRunning).toBe(true);
  // The wax is posed in the frames the room draws, and the room at rest draws them for it: it says the lamp moves.
  expect((await roomPace(page))?.moving).toContain('lava');
  const before = await lamp();
  await expect.poll(async () => (await lamp()).wax).not.toBe(before.wax);
  // Reduced motion: one pose, and nothing asks for it to change. The rain and the dust stand still too, so the room
  // draws no frame at all.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await stats(page))?.lavaRunning).toBe(false);
  const still = await lamp();
  await expectRest(page, 'under reduced motion', []);
  expect((await lamp()).wax).toBe(still.wax);
  // At the TV the lamp is out of sight and rests.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => (await stats(page))?.lavaRunning).toBe(true);
  await page.evaluate(() => window.__roomLab?.room.focusTv());
  await expect.poll(async () => (await stats(page))?.lavaRunning).toBe(false);
  expect(errors).toEqual([]);
});

test('a hidden page draws nothing and moves nothing, and rests as before once it is shown again', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/room-lab.html?clean&mood=rose&view=room');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  // The first seconds after the room is whole are drawn at full pace (the camera arrives, the last of its making is
  // shown); then it rests at the pace of the rain.
  await expect.poll(() => frameRate(page), { timeout: 20_000, intervals: [0] }).toBeLessThanOrEqual(36);
  await expectRest(page, 'in the room view', ['air', 'lava']);
  // The tab goes to the back (as the browser says it: document.hidden and its event). The rain and the lava move by
  // the time of the frame they are drawn in, so with no frame they do not move either.
  const lamp = () =>
    page.evaluate(() => {
      type Wax = { geometry: { getAttribute(name: string): { array: Float32Array } } };
      const room = (globalThis as unknown as { __generatedRoom: { lava: { meshes: Wax[] } } }).__generatedRoom;
      const positions = room.lava.meshes[0]?.geometry.getAttribute('position').array ?? new Float32Array();
      return positions.reduce((sum, value, index) => sum + value * (index % 7), 0);
    });
  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => (value ? 'hidden' : 'visible'),
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
  await setHidden(true);
  await expect.poll(async () => (await roomPace(page))?.pace).toBe('still');
  const frames = async () => (await stats(page))?.framesRendered ?? 0;
  await page.waitForTimeout(150);
  const [drawn, wax] = [await frames(), await lamp()];
  await page.waitForTimeout(1500);
  expect(await frames(), 'frames drawn while hidden').toBe(drawn);
  expect(await lamp(), 'the wax while hidden').toBe(wax);
  await setHidden(false);
  await expectRest(page, 'shown again', ['air', 'lava']);
  await expect.poll(lamp).not.toBe(wax);
  expect(errors).toEqual([]);
});

test("the deck moves the generated CD player's parts", async ({ page }) => {
  const errors = trackErrors(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/room-lab.html?clean&mood=rose&autopower=0&mockradio=1');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  expect(await page.evaluate(() => window.__roomLab?.room.generatedReady)).toBe(true);
  await page.evaluate(() => window.__roomLab?.room.powerOn());
  await page.evaluate(() => window.__roomLab?.room.showRoom());
  await expect.poll(async () => (await stats(page))?.radioReady, { timeout: 20_000 }).toBe(true);
  // The radio as drawn (dev only: GeneratedRoom hands itself out): its parts and its lid's pivot.
  const radio = () =>
    page.evaluate(() => {
      type Part = { isMesh?: boolean; visible: boolean; name: string; rotation: { x: number } };
      const room = (
        globalThis as unknown as {
          __generatedRoom: { radioParts: { group: { traverse(visit: (part: Part) => void): void } } };
        }
      ).__generatedRoom;
      const generated: Record<string, boolean> = {};
      let lid = 0;
      room.radioParts.group.traverse((part) => {
        if (part.isMesh && part.name.startsWith('Generated radio')) generated[part.name] = part.visible;
        if (part.name === 'RadioLidPivot') lid = part.rotation.x;
      });
      return { generated, lid };
    });
  const shut = await radio();
  expect(shut.generated['Generated radio']).toBe(true);
  expect(shut.generated['Generated radioWell']).toBe(false);
  expect(shut.generated['Generated radioWellCover']).toBe(true);
  // No model, close-up or skin is asked for on its account.
  expect(requests.filter((url) => /\.(glb|webp)(\?|$)/.test(url))).toEqual([]);
  // The visit: the lid opens to its 84°, the well and the lid's underside show, the discs come up.
  await page.evaluate(() => window.__roomLab?.room.focusRadio());
  await page.waitForFunction(() => window.__roomLab?.room.radio.deck?.live === true, null, { timeout: 20_000 });
  await expect.poll(async () => Math.round((await stats(page))?.radioLidDegrees ?? 0), { timeout: 10_000 }).toBe(84);
  const open = await radio();
  expect(open.lid).toBeCloseTo((-84 * Math.PI) / 180, 2);
  expect(open.generated['Generated radioWell']).toBe(true);
  expect(open.generated['Generated radioLidInner']).toBe(true);
  expect(open.generated['Generated radioWellCover']).toBe(false);
  // The generated keys are what the pointer finds: ▷II under its rect answers with the press cursor and its intent.
  const layout = await page.evaluate(() => window.__roomLab?.room.radio.deck?.layout);
  if (!layout) throw new Error('No layout');
  const key = layout.keys['play-pause'];
  await page.mouse.move(key.left + key.width / 2, key.top + key.height * 0.6);
  await expect.poll(() => page.evaluate(() => document.querySelector('canvas')?.dataset.cursor)).toBe('press');
  await page.mouse.down();
  await page.mouse.up();
  const presses = () =>
    page.evaluate(() => (window.__roomLab?.radio?.log ?? []).filter((entry) => entry.detail?.includes('play-pause')));
  await expect.poll(async () => (await presses()).length).toBeGreaterThan(0);
  // A pick seats the disc on the generated turntable and the music starts.
  const disc = layout.discs[1];
  if (!disc) throw new Error('No disc');
  await page.mouse.click(disc.x, disc.y);
  await expect
    .poll(() => page.evaluate(() => (window.__roomLab?.radio?.log ?? []).some((entry) => entry.event === 'seated')), {
      timeout: 10_000,
    })
    .toBe(true);
  // Leaving shuts it again.
  await page.evaluate(() => window.__roomLab?.room.showRoom());
  await expect.poll(async () => (await stats(page))?.radioLidDegrees, { timeout: 10_000 }).toBe(0);
  expect((await radio()).generated['Generated radioWell']).toBe(false);
  expect(requests.filter((url) => /\.(glb|webp)(\?|$)/.test(url))).toEqual([]);
  expect(errors).toEqual([]);
});
