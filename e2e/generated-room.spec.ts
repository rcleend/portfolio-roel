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
  expect(built?.triangles).toBeLessThan(70_000);
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
