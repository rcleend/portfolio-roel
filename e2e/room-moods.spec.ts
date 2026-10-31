import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import type { RoomMood } from '../src/room/atmosphere/moods';
import { GPU_LAUNCH_ARGS } from './gpu';
import { trackErrors } from './helpers';
import { ATMOSPHERE_PROGRAMS, postersShown, ROOM_PROGRAMS, spotlightIn } from './programs';

test.use({
  launchOptions: { args: GPU_LAUNCH_ARGS },
  viewport: { width: 1440, height: 900 },
});

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('three night finishes are distinct, darker than the bake, and stay still under reduced motion', async ({
  page,
}) => {
  const errors = trackErrors(page);
  // Pin the programs on a normal flight. A slow GPU can skip every intermediate frame of a reduced-motion cut,
  // so the transient black veil's program may never compile. Reduced motion is then enabled for the idle checks.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/room-lab.html?clean&view=room&mood=honey');
  await page.waitForFunction(() => window.__roomLab?.room.view === 'room' && window.__roomLab.room.settled);
  const stats = () => page.evaluate(() => window.__roomLab?.room.stats);
  await postersShown(page, stats);
  await spotlightIn(page, stats);
  await expect.poll(async () => (await stats())?.backgroundPending).toBe(false);
  expect((await stats())?.programs).toBe(ROOM_PROGRAMS + ATMOSPHERE_PROGRAMS);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const colors = new Map<RoomMood, number[]>();
  for (const mood of ['honey', 'rose', 'midnight', 'original'] as const) {
    const before = (await stats())?.framesRendered ?? 0;
    await page.evaluate((next) => window.__roomLab?.room.setMood(next), mood);
    if (mood !== 'honey') await expect.poll(async () => (await stats())?.framesRendered).toBeGreaterThan(before);
    const screenshot = await page.locator('#stage canvas').screenshot();
    colors.set(
      mood,
      (await sharp(screenshot).stats()).channels.slice(0, 3).map((channel) => channel.mean),
    );
  }
  const luminance = (rgb: number[]) => (rgb[0] ?? 0) * 0.2126 + (rgb[1] ?? 0) * 0.7152 + (rgb[2] ?? 0) * 0.0722;
  const original = colors.get('original') ?? [];
  for (const mood of ['honey', 'rose', 'midnight'] as const) {
    expect(luminance(colors.get(mood) ?? []), `${mood} stays a night scene`).toBeLessThan(luminance(original));
  }
  const warmth = (mood: RoomMood) => {
    const rgb = colors.get(mood) ?? [];
    return (rgb[0] ?? 0) - (rgb[2] ?? 0);
  };
  expect(warmth('honey')).toBeGreaterThan(warmth('rose') + 6);
  expect(warmth('rose')).toBeGreaterThan(warmth('midnight') + 6);

  await page.evaluate(() => {
    window.__roomLab?.room.setMood('honey');
    window.__roomLab?.room.setAir({ haze: 0, dust: 0 });
  });
  const pixels = async () =>
    sharp(await page.locator('#stage canvas').screenshot())
      .removeAlpha()
      .raw()
      .toBuffer();
  const clean = await pixels();
  await page.evaluate(() => window.__roomLab?.room.setAir({ haze: 0, dust: 1 }));
  const dusty = await pixels();
  let flecks = 0;
  for (let i = 0; i < clean.length; i += 3) {
    if (Math.abs((clean[i] ?? 0) - (dusty[i] ?? 0)) > 3) flecks++;
  }
  expect(flecks, 'dust is visible').toBeGreaterThan(30);
  expect(flecks, 'dust remains fine motes, not a veil').toBeLessThan((1440 * 900) / 100);
  await page.evaluate(() => window.__roomLab?.room.setAir({ haze: 1, dust: 1 }));

  // Revisiting finishes reuses programs; changing one draws once, then rests even under reduced motion.
  const programs = (await stats())?.programs;
  for (const mood of ['honey', 'midnight', 'rose', 'original'] as const) {
    await page.evaluate((next) => window.__roomLab?.room.setMood(next), mood);
    await page.waitForTimeout(100);
  }
  expect((await stats())?.programs).toBe(programs);
  const resting = (await stats())?.framesRendered;
  await page.waitForTimeout(300);
  expect((await stats())?.framesRendered).toBe(resting);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect(errors).toEqual([]);
});

test('the main app fixes Velvet dusk and removes the mood controls', async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?scene=title&paused&frame=180&mood=honey');
  await page.waitForFunction(() => window.__room?.powerState === 'on');
  expect(await page.evaluate(() => window.__room?.mood)).toBe('rose');
  await expect(page.locator('#mood-panel')).toHaveCount(0);
  await expect(page.getByRole('slider', { name: /haze|dust/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('dust drifts at a low rate, rests when hidden or reduced, and stops with the finish', async ({ page }) => {
  const errors = trackErrors(page);
  // Seat the radio's discs without entrance animation, then enable motion. Dust must not depend on game/lava ticks.
  await page.goto('/room-lab.html?clean&view=room&mood=honey&mockradio=1');
  await page.waitForFunction(() => window.__roomLab?.room.view === 'room' && window.__roomLab.room.settled);
  const stats = () => page.evaluate(() => window.__roomLab?.room.stats);
  await expect.poll(async () => (await stats())?.backgroundPending).toBe(false);
  await page.evaluate(() => window.__roomLab?.room.focusRadio());
  await page.waitForFunction(() => window.__roomLab?.room.radio.deck?.live && window.__roomLab.room.settled);
  await page.waitForTimeout(200);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const before = (await stats())?.framesRendered ?? 0;
  await page.waitForTimeout(500);
  const drift = ((await stats())?.framesRendered ?? 0) - before;
  // SwiftShader can spend most of this interval rasterising the room. Pin a running clock there, not a minimum FPS.
  expect(drift).toBeGreaterThan(process.env.ROOM_GL === 'swiftshader' ? 0 : 3);
  expect(drift).toBeLessThan(17);
  expect((await stats())?.lavaRunning).toBe(false);

  const expectRest = async () => {
    await page.waitForTimeout(200);
    const rested = (await stats())?.framesRendered;
    await page.waitForTimeout(300);
    expect((await stats())?.framesRendered).toBe(rested);
  };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectRest();
  await page.evaluate(() => window.__roomLab?.room.setAir({ haze: 1, dust: 0 }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expectRest();
  await page.evaluate(() => window.__roomLab?.room.setAir({ haze: 1, dust: 1 }));
  await page.locator('#stage').evaluate((element) => {
    element.style.display = 'none';
  });
  await expectRest();
  await page.locator('#stage').evaluate((element) => {
    element.style.removeProperty('display');
  });
  const shown = (await stats())?.framesRendered ?? 0;
  await expect.poll(async () => (await stats())?.framesRendered).toBeGreaterThan(shown + 2);
  await page.evaluate(() => window.__roomLab?.room.setMood('original'));
  await expectRest();
  await page.evaluate(() => {
    window.__roomLab?.room.setMood('honey');
    window.__roomLab?.room.dispose();
  });
  await expectRest();
  expect(errors).toEqual([]);
});

test('every finish reaches the TV, radio, computer and the live computer screen', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/room-lab.html?clean&view=room&mood=midnight&mockpc=1&mockradio=1');
  await page.waitForFunction(() => window.__roomLab?.room.view === 'room' && window.__roomLab.room.settled);
  const screen = page.locator('[data-pc-screen]');
  const mean = async (png: Buffer) => (await sharp(png).stats()).channels.slice(0, 3).map((channel) => channel.mean);
  const distance = (a: number[], b: number[]) =>
    Math.max(...a.map((value, index) => Math.abs(value - (b[index] ?? 0))));
  for (const view of ['tv', 'radio', 'pc'] as const) {
    await page.evaluate((next) => {
      const room = window.__roomLab?.room;
      if (next === 'tv') room?.focusTv();
      if (next === 'radio') room?.focusRadio();
      if (next === 'pc') room?.focusPc();
    }, view);
    await page.waitForFunction((next) => window.__roomLab?.room.view === next && window.__roomLab.room.settled, view);
    if (view === 'tv')
      await page.evaluate(() => {
        window.__roomLab?.surface.pause();
        window.__roomLab?.surface.showFrame(40);
      });
    const colors = new Map<RoomMood, number[]>();
    const screenColors = new Map<RoomMood, number[]>();
    const tvPictures = new Map<RoomMood, Buffer>();
    for (const mood of ['original', 'honey', 'rose', 'midnight'] as const) {
      const before = await page.evaluate(() => window.__roomLab?.room.stats.framesRendered ?? 0);
      await page.evaluate((next) => window.__roomLab?.room.setMood(next), mood);
      await expect.poll(() => page.evaluate(() => window.__roomLab?.room.stats.framesRendered)).toBeGreaterThan(before);
      const rendered = await page.locator('#stage canvas').screenshot();
      colors.set(mood, await mean(rendered));
      if (view === 'tv') {
        // Inside the TV's picture at this viewport: its game graphics must retain their contrast and sharpness.
        tvPictures.set(
          mood,
          await sharp(rendered)
            .extract({ left: 540, top: 300, width: 360, height: 260 })
            .removeAlpha()
            .raw()
            .toBuffer(),
        );
      }
      if (view === 'pc') {
        await expect(screen).toHaveAttribute('data-live', 'true');
        screenColors.set(mood, await mean(await screen.screenshot()));
        if (mood === 'original') await expect(screen).toHaveCSS('filter', 'none');
        else await expect(screen).not.toHaveCSS('filter', 'none');
      }
    }
    for (const mood of ['honey', 'rose', 'midnight'] as const) {
      expect(distance(colors.get(mood) ?? [], colors.get('original') ?? []), `${view}: ${mood}`).toBeGreaterThan(1);
      if (view === 'pc') {
        const tint = distance(screenColors.get(mood) ?? [], screenColors.get('original') ?? []);
        expect(tint, `live PC: ${mood} retains a subtle tint`).toBeGreaterThan(0.3);
        expect(tint, `live PC: ${mood} keeps the source readable`).toBeLessThan(7);
      }
      if (view === 'tv') {
        const original = tvPictures.get('original');
        const finished = tvPictures.get(mood);
        if (!original || !finished) throw new Error('Missing TV picture');
        const range = (pixels: Buffer) => {
          const luma = new Float64Array(pixels.length / 3);
          for (let i = 0; i < luma.length; i++)
            luma[i] =
              (pixels[i * 3] ?? 0) * 0.2126 + (pixels[i * 3 + 1] ?? 0) * 0.7152 + (pixels[i * 3 + 2] ?? 0) * 0.0722;
          luma.sort();
          return { dark: luma[Math.floor(luma.length * 0.1)] ?? 0, light: luma[Math.floor(luma.length * 0.95)] ?? 0 };
        };
        const source = range(original);
        const picture = range(finished);
        // Removing the old bezel spill darkens the picture slightly. Judge readable contrast rather than equal pixels.
        expect(picture.dark, `${mood} adds no haze over dark picture detail`).toBeLessThanOrEqual(source.dark + 1);
        expect(picture.light, `${mood} retains bright picture detail`).toBeGreaterThan(source.light * 0.9);
        expect(picture.light - picture.dark, `${mood} retains the game's contrast`).toBeGreaterThan(
          (source.light - source.dark) * 0.9,
        );
      }
    }
    if (view === 'tv') {
      // Dust and illuminated haze can surround the tube, but neither is allowed over its picture.
      await page.evaluate(() => window.__roomLab?.room.setAir({ haze: 0, dust: 0 }));
      const clear = await sharp(await page.locator('#stage canvas').screenshot())
        .extract({ left: 540, top: 300, width: 360, height: 260 })
        .removeAlpha()
        .raw()
        .toBuffer();
      const dusty = tvPictures.get('midnight');
      if (!dusty) throw new Error('Missing TV picture');
      let difference = 0;
      for (let i = 0; i < clear.length; i++) difference += Math.abs((clear[i] ?? 0) - (dusty[i] ?? 0));
      expect(difference / clear.length, 'no haze or particles across the game').toBeLessThan(0.5);
      await page.evaluate(() => window.__roomLab?.room.setAir({ haze: 1, dust: 1 }));
    }
  }
  // A Honey close-up must not flash or change colour when the live screen and rendered glass hand over.
  await page.evaluate(() => window.__roomLab?.room.setMood('honey'));
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const live = await mean(await screen.screenshot());
  const bounds = await screen.boundingBox();
  if (!bounds) throw new Error('The computer has no screen placement');
  await screen.evaluate((element) => {
    element.style.visibility = 'hidden';
  });
  const still = await mean(await page.screenshot({ clip: bounds }));
  expect(distance(live, still)).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test('a finish preserves the computer, radio and TV views and survives resize and context restore', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto('/room-lab.html?clean&view=room&mood=midnight&mockpc=1&mockradio=1');
  await page.waitForFunction(() => window.__roomLab?.room.view === 'room' && window.__roomLab.room.settled);
  await page.evaluate(() => window.__roomLab?.room.focusPc());
  await page.waitForFunction(() => window.__roomLab?.room.pc.live);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__roomLab?.room.focusRadio());
  await page.waitForFunction(() => window.__roomLab?.room.radio.deck?.live);
  await page.evaluate(() => window.__roomLab?.room.focusTv());
  await page.waitForFunction(() => window.__roomLab?.room.view === 'tv' && window.__roomLab.room.settled);
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#stage canvas');
    const gl = canvas?.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('No context loss extension');
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 100);
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__roomLab?.room.showRoom());
  await page.waitForFunction(() => window.__roomLab?.room.view === 'room' && window.__roomLab.room.settled);
  const image = await sharp(await page.locator('#stage canvas').screenshot()).stats();
  expect(image.channels[0]?.mean).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});
