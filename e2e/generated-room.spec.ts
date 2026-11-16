import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { GPU_LAUNCH_ARGS } from './gpu';
import { trackErrors } from './helpers';

test.use({
  launchOptions: { args: GPU_LAUNCH_ARGS },
  viewport: { width: 1440, height: 900 },
});

const stats = (page: import('@playwright/test').Page) => page.evaluate(() => window.__roomLab?.room.stats);

test('without the flag nothing of the generated room is fetched or drawn', async ({ page }) => {
  const errors = trackErrors(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/room-lab.html?clean&mood=rose');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  await page.evaluate(() => window.__roomLab?.room.ready);
  // Past the moment the generated room would have started (the first frame) and its chunk arrived.
  await page.waitForTimeout(1500);
  expect((await stats(page))?.generated).toBe('off');
  expect(await page.evaluate(() => window.__roomLab?.room.generatedReady)).toBe(false);
  expect(requests.filter((url) => /\/gen\/(GeneratedRoom|worker|scene)/.test(url))).toEqual([]);
  expect(errors).toEqual([]);
});

test("the generated room builds in a worker, bakes its light and takes the shipped pieces' place", async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/room-lab.html?clean&mood=rose&room=generated&autopower=0');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  expect(await page.evaluate(() => window.__roomLab?.room.generatedReady)).toBe(true);
  const state = await stats(page);
  expect(state?.generated).toBe('ready');
  const built = state?.generatedStats;
  expect(built?.builtIn).toBe('worker');
  // Every light from every point of its emitter, on the top tier (rig.ts).
  expect(built?.views).toBeGreaterThan(100);
  // The whole room at full detail (the shipped one: 353 k); a view draws less of it (the next expectation).
  expect(built?.triangles).toBeLessThan(110_000);
  // The opening view draws a third of the shipped set's triangles, in fewer calls.
  await page.evaluate(() => window.__roomLab?.room.powerOn());
  await expect.poll(async () => (await stats(page))?.triangles).toBeLessThan(70_000);
  // Sixty frames a second whether or not anything moves: the paused game still gets frames.
  await page.evaluate(() => window.__roomLab?.surface.pause());
  const before = (await stats(page))?.framesRendered ?? 0;
  await page.waitForTimeout(1000);
  const drawn = ((await stats(page))?.framesRendered ?? 0) - before;
  expect(drawn).toBeGreaterThan(45);
  expect(drawn).toBeLessThan(80);
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

test("the generated lava lamp takes the shipped one's place, moves by the clock and stands still on request", async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto('/room-lab.html?clean&mood=rose&room=generated&view=room');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  expect(await page.evaluate(() => window.__roomLab?.room.generatedReady)).toBe(true);
  // What the lamp is drawn with (dev only: GeneratedRoom hands itself out): the shipped glass and wax, and the wax's
  // vertices as one number.
  const lamp = () =>
    page.evaluate(() => {
      type Part = { isMesh?: boolean; visible: boolean; userData: Record<string, unknown>; parent: Part | null };
      type Wax = { geometry: { getAttribute(name: string): { array: Float32Array } } };
      const room = (
        globalThis as unknown as {
          __generatedRoom: {
            context: { stage: { scene: { traverse(visit: (part: Part) => void): void } } };
            lava: { meshes: Wax[] };
          };
        }
      ).__generatedRoom;
      const shipped: boolean[] = [];
      room.context.stage.scene.traverse((part) => {
        const lava = part.userData.supplied_asset === 'lava' || part.parent?.userData.supplied_asset === 'lava';
        if (part.isMesh && lava) shipped.push(part.visible);
      });
      const positions = room.lava.meshes[0]?.geometry.getAttribute('position').array ?? new Float32Array();
      return { shipped, wax: positions.reduce((sum, value, index) => sum + value * (index % 7), 0) };
    });
  await expect.poll(async () => (await stats(page))?.lavaRunning).toBe(true);
  const before = await lamp();
  expect(before.shipped.length).toBeGreaterThan(0);
  expect(before.shipped.every((visible) => !visible)).toBe(true);
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

test("the generated CD player takes the shipped one's place and the deck moves its parts", async ({ page }) => {
  const errors = trackErrors(page);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/room-lab.html?clean&mood=rose&room=generated&autopower=0&mockradio=1');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  expect(await page.evaluate(() => window.__roomLab?.room.generatedReady)).toBe(true);
  await page.evaluate(() => window.__roomLab?.room.powerOn());
  await page.evaluate(() => window.__roomLab?.room.showRoom());
  await expect.poll(async () => (await stats(page))?.radioReady, { timeout: 20_000 }).toBe(true);
  // The radio as drawn (dev only: GeneratedRoom hands itself out): the shipped meshes hidden, the generated parts in.
  const radio = () =>
    page.evaluate(() => {
      type Part = { isMesh?: boolean; visible: boolean; name: string; parent: Part | null; rotation: { x: number } };
      const room = (
        globalThis as unknown as {
          __generatedRoom: { context: { radio: { traverse(visit: (part: Part) => void): void } } };
        }
      ).__generatedRoom;
      const shipped: boolean[] = [];
      const generated: Record<string, boolean> = {};
      let lid = 0;
      room.context.radio.traverse((part) => {
        if (part.isMesh && /^Radio_Imported_Part_\d+_base$/.test(part.name)) shipped.push(part.visible);
        if (part.isMesh && part.name.startsWith('Generated radio')) generated[part.name] = part.visible;
        if (part.name === 'RadioLidPivot') lid = part.rotation.x;
      });
      return { shipped, generated, lid };
    });
  const shut = await radio();
  expect(shut.shipped).toHaveLength(7);
  expect(shut.shipped.every((visible) => !visible)).toBe(true);
  expect(shut.generated['Generated radio']).toBe(true);
  expect(shut.generated['Generated radioWell']).toBe(false);
  expect(shut.generated['Generated radioWellCover']).toBe(true);
  // No model, close-up or skin of the radio's is asked for on its account.
  expect(requests.filter((url) => /radio-closeup|radio-skin/.test(url))).toEqual([]);
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
  expect(requests.filter((url) => /radio-closeup|radio-skin/.test(url))).toEqual([]);
  expect(errors).toEqual([]);
});
