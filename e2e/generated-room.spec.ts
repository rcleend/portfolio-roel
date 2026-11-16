import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { GPU_LAUNCH_ARGS } from './gpu';
import { expectSixtyFrames, trackErrors } from './helpers';

test.use({
  launchOptions: { args: GPU_LAUNCH_ARGS },
  viewport: { width: 1440, height: 900 },
});

const stats = (page: import('@playwright/test').Page) => page.evaluate(() => window.__roomLab?.room.stats);

test('the page asks for no model, texture or still: the room is made in the browser', async ({ page }) => {
  const errors = trackErrors(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
  await page.goto('/?seed=1');
  await page.waitForFunction(() => window.__room?.stats.generated === 'ready', null, { timeout: 30_000 });
  await page.evaluate(() => window.__room?.showRoom());
  await expect.poll(() => page.evaluate(() => window.__room?.view === 'room' && window.__room.settled)).toBe(true);
  await page.waitForTimeout(1500);
  // Nothing under /room/ or /startup/, and no model or image of the room's from anywhere.
  expect(requests.filter((path) => /^\/(room|startup)\//.test(path))).toEqual([]);
  expect(requests.filter((path) => /\.(glb|gltf|ktx2|webp)$/.test(path))).toEqual([]);
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
  // The whole room at full detail (the modelled room it replaced: 353 k); a view draws less of it (the next expectation). 118 k
  // with the window, the wire basket and the bulb lamp finely made: measured, the same frame times as at 104 k.
  expect(built?.triangles).toBeLessThan(125_000);
  await page.evaluate(() => window.__roomLab?.room.powerOn());
  await expect.poll(async () => (await stats(page))?.triangles).toBeLessThan(70_000);
  // Sixty frames a second whether or not anything moves: the paused game still gets frames.
  await page.evaluate(() => window.__roomLab?.surface.pause());
  await expectSixtyFrames(page, 'with the game paused at the TV');
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
  const before = await lamp();
  await expect.poll(async () => (await lamp()).wax).not.toBe(before.wax);
  // Reduced motion: one pose, and nothing asks for it to change.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => (await stats(page))?.lavaRunning).toBe(false);
  const still = await lamp();
  await page.waitForTimeout(400);
  expect((await lamp()).wax).toBe(still.wax);
  // At the TV the lamp is out of sight and rests.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => (await stats(page))?.lavaRunning).toBe(true);
  await page.evaluate(() => window.__roomLab?.room.focusTv());
  await expect.poll(async () => (await stats(page))?.lavaRunning).toBe(false);
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
