import { expect, type Page, test } from '@playwright/test';
import sharp from 'sharp';
import type {} from '../src/room/lab/main';
import { GPU_LAUNCH_ARGS } from './gpu';
import { differingPixels, SIXTY_FRAMES, trackErrors } from './helpers';
import { postersShown, ROOM_PROGRAMS, spotlightIn } from './programs';

/**
 * The CD player in the room lab (`?mockradio=1`: five numbered discs and a fake player that answers the radio
 * like the app). Once the radio is prepared the page's clock is paused and moved on frame by frame, so the lid,
 * the discs and the key presses are checked on exact ticks of the storyboard (docs/ROOM.md › The CD player).
 */

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS }, viewport: { width: 1440, height: 900 } });

/** The camera lands this long after the request (CameraRig's FLIGHT_MS). */
const LANDING = 1100;
const FRAME = 16;
const stats = (page: Page) => page.evaluate(() => window.__roomLab?.room.stats);
const log = (page: Page) =>
  page.evaluate(() => (window.__roomLab?.radio?.log ?? []).map(({ at, event, detail }) => ({ at, event, detail })));

/** Moves the paused clock on in frames, so the room draws between timers as in real time. */
async function advance(page: Page, ms: number): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += FRAME) await page.clock.runFor(Math.min(FRAME, ms - elapsed));
}

/** Records every program the page links, to know when the GPU has finished compiling them (in real time). */
function watchPrograms(): void {
  const linked: [WebGL2RenderingContext, WebGLProgram][] = [];
  const link = WebGL2RenderingContext.prototype.linkProgram;
  WebGL2RenderingContext.prototype.linkProgram = function (this: WebGL2RenderingContext, program: WebGLProgram) {
    linked.push([this, program]);
    link.call(this, program);
  };
  (window as unknown as { __programsReady: () => boolean }).__programsReady = () =>
    linked.every(([gl, program]) => {
      // A program three has since deleted (or a lost context's) is no longer being compiled.
      if (gl.isContextLost() || !gl.isProgram(program)) return true;
      const parallel = gl.getExtension('KHR_parallel_shader_compile');
      return !parallel || gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR) === true;
    });
}

/**
 * Waits, with the page's clock still, for the GPU to finish the programs it is compiling. The discs' program is
 * compiled on the approach and the discs rise once it is ready; three looks for that on a timer, so on the paused
 * clock, moved on faster than real time, a busy machine would otherwise land the camera before the GPU is done.
 */
async function programsCompiled(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __programsReady: () => boolean }).__programsReady()), {
      timeout: 15_000,
    })
    .toBe(true);
}

/** The lab in the room view with the radio prepared and the clock paused; returns the page's time. */
async function inRoom(page: Page, query = ''): Promise<void> {
  await page.addInitScript(watchPrograms);
  await page.clock.install();
  await page.goto(`/room-lab.html?clean&mockradio=1${query}`);
  await page.waitForFunction(() => window.__roomLab !== undefined);
  await page.evaluate(() => window.__roomLab?.room.ready);
  await page.waitForFunction(() => window.__roomLab?.surface.paused === false, null, { timeout: 20_000 });
  await page.evaluate(() => window.__roomLab?.room.showRoom());
  await page.waitForFunction(() => window.__roomLab?.room.stats.radioReady === true, null, { timeout: 20_000 });
  await page.waitForTimeout(1300);
  await postersShown(page, () => stats(page));
  await spotlightIn(page, () => stats(page));
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await advance(page, 1000);
}

/** Flies to the radio at a known moment of the paused clock and returns it, once the GPU has its programs. */
async function goToRadio(page: Page): Promise<number> {
  const start = await page.evaluate(() => {
    window.__roomLab?.room.focusRadio();
    return performance.now();
  });
  await programsCompiled(page);
  return start;
}

async function atRadio(page: Page, query = ''): Promise<number> {
  await inRoom(page, query);
  const start = await goToRadio(page);
  await advance(page, LANDING + 1400);
  return start;
}

/** Frames drawn while the clock moves on `ms`. */
async function framesOver(page: Page, ms: number): Promise<number> {
  const before = (await stats(page))?.framesRendered ?? 0;
  await advance(page, ms);
  return ((await stats(page))?.framesRendered ?? 0) - before;
}

/** Holds the room to its sixty frames a second over a second of the paused clock (one frame a step of it). */
async function expectSixtyFrames(page: Page, where: string): Promise<void> {
  const drawn = await framesOver(page, 1000);
  expect(drawn, `frames a second ${where}`).toBeGreaterThanOrEqual(SIXTY_FRAMES.min);
  expect(drawn, `frames a second ${where}`).toBeLessThanOrEqual(SIXTY_FRAMES.max);
}

/**
 * The most pixels that differ between any two of `shots` frames of the stage, `every` ms of the paused clock apart:
 * 0 when nothing in the picture moves, however many frames were drawn meanwhile.
 */
async function pixelsMoving(page: Page, shots: number, every: number): Promise<number> {
  const frames: Buffer[] = [];
  for (let shot = 0; shot < shots; shot++) {
    if (shot > 0) await advance(page, every);
    frames.push(await page.locator('#stage canvas').screenshot());
  }
  let most = 0;
  for (let i = 1; i < frames.length; i++)
    most = Math.max(most, await differingPixels(frames[0] as Buffer, frames[i] as Buffer));
  return most;
}

/** The centre of disc `index` on the page (its anchor). */
async function disc(page: Page, index: number) {
  const anchor = await page.evaluate((i) => window.__roomLab?.room.radio.deck?.layout.discs[i], index);
  if (!anchor) throw new Error(`No disc ${index}`);
  return anchor;
}

test('opens the lid on the storyboard and raises the discs by the landing + 1.4 s', async ({ page }) => {
  const errors = trackErrors(page);
  await inRoom(page);
  expect((await stats(page))?.programs).toBe(ROOM_PROGRAMS);
  const start = await goToRadio(page);
  const lidAt = async (ms: number) => {
    const now = await page.evaluate(() => performance.now());
    await advance(page, start + ms - now);
    return (await stats(page))?.radioLidDegrees ?? Number.NaN;
  };
  expect(await lidAt(700)).toBeCloseTo(0, 0);
  expect(Math.abs((await lidAt(840)) - 5)).toBeLessThanOrEqual(1);
  expect(Math.abs((await lidAt(1079)) - 72)).toBeLessThanOrEqual(1);
  expect(Math.abs((await lidAt(1309)) - 87.2)).toBeLessThanOrEqual(1);
  expect(Math.abs((await lidAt(2000)) - 84)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.__roomLab?.room.radio.deck?.live)).toBe(true);
  expect((await stats(page))?.programs).toBe(ROOM_PROGRAMS + 1);

  await lidAt(LANDING + 1400);
  const events = await log(page);
  const rises = events.filter((entry) => entry.detail?.startsWith('disc-rise'));
  const flips = events.filter((entry) => entry.detail?.startsWith('disc-flip'));
  expect(rises).toHaveLength(5);
  expect(flips).toHaveLength(5);
  expect((rises[0]?.at ?? 0) - start).toBeGreaterThanOrEqual(LANDING);
  // Each turns over in its own column, out in front of the radio.
  expect((flips.at(-1)?.at ?? Number.POSITIVE_INFINITY) - start).toBeLessThanOrEqual(LANDING + 1000);
  // The choreography is over: the discs float (the device's ambient motion), on the room's own sixty frames.
  expect((await stats(page))?.radioAmbient).toBe(true);
  await expectSixtyFrames(page, 'with the discs afloat');
  for (const cue of ['lid-push', 'lid-unlatch', 'lid-swing', 'lid-stop', 'power-on']) {
    expect(events.filter((entry) => entry.detail === cue)).toHaveLength(1);
  }
  expect(errors).toEqual([]);
});

test('a pick seats the disc at +900 ms, presses ▷II in the model and starts it playing', async ({ page }) => {
  await atRadio(page);
  const target = await disc(page, 1);
  await page.mouse.move(target.x, target.y);
  await advance(page, 400);
  await page.mouse.down();
  await page.mouse.up();
  await advance(page, 1200);
  const events = await log(page);
  const pick = events.find((entry) => entry.event === 'intent' && entry.detail === 'pick mock-2');
  const seated = events.find((entry) => entry.event === 'seated');
  if (!pick || !seated) throw new Error(`No pick or seat: ${JSON.stringify(events.slice(-12))}`);
  expect(seated.detail).toBe('mock-2');
  expect(Math.abs(seated.at - pick.at - 900)).toBeLessThanOrEqual(FRAME + 1);
  const after = events.filter((entry) => entry.at >= pick.at).map((entry) => entry.detail);
  for (const cue of ['disc-pick', 'disc-seat', 'key-down', 'key-up', 'spin-up']) expect(after).toContain(cue);
  const layout = await page.evaluate(() =>
    window.__roomLab?.room.radio.deck?.layout.discs.find((d) => d.disc === 'mock-2'),
  );
  expect(layout?.inPlayer).toBe(true);
});

test('a disc seats, and its music starts, even when no frame is drawn (a hidden tab, a locked phone)', async ({
  page,
}) => {
  await atRadio(page);
  const target = await disc(page, 2);
  await page.mouse.move(target.x, target.y);
  await advance(page, 400);
  // From here on the browser draws nothing: frames asked for never come.
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  const before = (await stats(page))?.framesRendered ?? 0;
  await page.mouse.down();
  await page.mouse.up();
  await advance(page, 1400);
  const events = await log(page);
  const pick = events.find((entry) => entry.event === 'intent' && entry.detail === 'pick mock-3');
  const seated = events.find((entry) => entry.event === 'seated');
  if (!pick || !seated) throw new Error(`No pick or seat: ${JSON.stringify(events.slice(-12))}`);
  expect(seated.detail).toBe('mock-3');
  // On time, give or take the timer's grace.
  expect(seated.at - pick.at).toBeGreaterThanOrEqual(900);
  expect(seated.at - pick.at).toBeLessThanOrEqual(900 + 200);
  expect(((await stats(page))?.framesRendered ?? 0) - before).toBeLessThanOrEqual(1);
});

test('the panel around the keys is lit and legible, and nothing of the radio is fetched', async ({ page }) => {
  const errors = trackErrors(page);
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (/GL_INVALID|WebGL:/.test(message.text())) warnings.push(message.text());
  });
  const fetched: string[] = [];
  page.on('request', (request) => fetched.push(new URL(request.url()).pathname));
  await atRadio(page);
  // The radio is generated and lit with the room (docs/ROOM.md › The generated room): no close-up model, no skin.
  expect(fetched.filter((path) => /^\/(room|startup)\//.test(path) || /\.(glb|gltf|ktx2|webp)$/.test(path))).toEqual(
    [],
  );
  expect((await stats(page))?.radioReady).toBe(true);
  // The front panel around the keys: lit grey plastic, not black (parts hung before their light was baked would be),
  // with the keys' legends and grooves standing out of it.
  const keys = await page.evaluate(() => window.__roomLab?.room.radio.deck?.layout.keys);
  if (!keys) throw new Error('No key rects');
  const rects = Object.values(keys);
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.left + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
  const png = await page.screenshot({ clip: { x: left, y: top, width: right - left, height: bottom - top } });
  const { channels } = await sharp(png).removeAlpha().stats();
  const mean = channels.reduce((sum, channel) => sum + channel.mean, 0) / channels.length;
  const contrast = Math.max(...channels.map((channel) => channel.stdev));
  test.info().annotations.push({ type: 'key panel', description: `mean ${mean.toFixed(1)}, σ ${contrast.toFixed(1)}` });
  // Measured 48 and 15 of 255 at 0e275c7; the bounds leave the room's light room to be tuned.
  expect(mean).toBeGreaterThan(25);
  expect(mean).toBeLessThan(140);
  expect(contrast).toBeGreaterThan(6);
  expect(warnings).toEqual([]);
  expect(errors).toEqual([]);
});

test('the keys press themselves for the app and answer the pointer', async ({ page }) => {
  await atRadio(page);
  const before = (await log(page)).length;
  await page.evaluate(() => window.__roomLab?.radio?.press('next'));
  await advance(page, 300);
  const pressed = (await log(page)).slice(before).map((entry) => entry.detail);
  expect(pressed).toEqual(['key-down', 'key-up']);
  // The ⏭ key in the model under the pointer: pressed while held, a press intent at once.
  const key = await page.evaluate(() => window.__roomLab?.room.radio.deck?.layout.keys.next);
  if (!key) throw new Error('No key rect');
  await page.mouse.move(key.left + key.width / 2, key.top + key.height / 2);
  await page.mouse.down();
  await advance(page, 200);
  await page.mouse.up();
  await advance(page, 300);
  const pointer = (await log(page)).slice(before + 2).map((entry) => `${entry.event} ${entry.detail}`);
  expect(pointer).toContain('intent press next');
  expect(pointer).toContain('cue key-down');
  expect(pointer).toContain('cue key-up');
});

test('leaving sends the discs home and shuts the lid by the time the camera lands', async ({ page }) => {
  await atRadio(page);
  const start = await page.evaluate(() => {
    window.__roomLab?.room.showRoom();
    return performance.now();
  });
  expect(await page.evaluate(() => window.__roomLab?.room.radio.deck?.live)).toBe(false);
  await advance(page, LANDING);
  expect((await stats(page))?.radioLidDegrees).toBe(0);
  const events = (await log(page)).filter((entry) => entry.at >= start).map((entry) => entry.detail);
  expect(events.filter((detail) => detail?.startsWith('disc-sink'))).toHaveLength(5);
  expect(events).toContain('lid-close');
  expect(events).toContain('lid-latch');
});

test.describe('frames at the radio', () => {
  // Half a minute of the page's clock, moved on a frame at a time: a busy machine needs longer than the default.
  test.describe.configure({ timeout: 90_000 });

  test('keeps sixty frames a second afloat, at rest and playing, while only what should move does', async ({
    page,
  }) => {
    await atRadio(page);
    // Attentive: the discs float.
    await page.mouse.move(700, 500);
    await advance(page, 100);
    expect((await stats(page))?.radioAmbient).toBe(true);
    await expectSixtyFrames(page, 'with the discs afloat');
    expect(await pixelsMoving(page, 3, 200), 'the float shows').toBeGreaterThan(0);
    // Resting, empty player: the float has come to rest and the frames are one picture.
    await advance(page, 8000);
    expect((await stats(page))?.radioAmbient).toBe(false);
    await expectSixtyFrames(page, 'at rest');
    expect(await pixelsMoving(page, 4, 500), 'pixels moving at rest').toBe(0);
    // Playing: the seated disc is its radial average, the same image every frame; nothing else moves either.
    await page.evaluate(() => {
      const room = window.__roomLab?.room;
      room?.radio.deck?.setState({ loaded: 'mock-3', transport: 'playing', lcd: { kind: 'reading' } });
    });
    await advance(page, 9000);
    expect((await stats(page))?.radioAmbient).toBe(false);
    await expectSixtyFrames(page, 'playing');
    expect(await pixelsMoving(page, 4, 500), 'pixels moving while a disc plays').toBe(0);
    expect((await stats(page))?.programs).toBe(ROOM_PROGRAMS + 1);
    // Off screen the room asks for no frame at all, and for its sixty again once it is back.
    const stageShown = (shown: boolean) =>
      page.locator('#stage').evaluate((element, show) => {
        if (show) element.style.removeProperty('display');
        else element.style.display = 'none';
      }, shown);
    await stageShown(false);
    // The browser says so in its own time (an IntersectionObserver), not the page's clock's.
    await page.waitForTimeout(300);
    await advance(page, 300);
    expect(await framesOver(page, 1000), 'frames drawn off screen').toBe(0);
    await stageShown(true);
    await page.waitForTimeout(300);
    await advance(page, 300);
    await expectSixtyFrames(page, 'back on screen');
  });

  test('blinks a paused time only while the visitor is there', async ({ page }) => {
    await atRadio(page);
    await page.evaluate(() =>
      window.__roomLab?.room.radio.deck?.setState({
        loaded: 'mock-1',
        transport: 'paused',
        lcd: { kind: 'track', track: 1, seconds: 37, transport: 'paused' },
      }),
    );
    // Past the float's rest, inside the 30 s of attention: the blink alone, twice a second, on the LCD and nowhere else
    // (103 × 29 CSS px here) and nowhere else.
    await advance(page, 10_000);
    expect((await stats(page))?.radioAmbient).toBe(false);
    const blinking = await pixelsMoving(page, 5, 250);
    expect(blinking, 'the paused time blinks').toBeGreaterThan(0);
    expect(blinking, 'and nothing but the LCD changes').toBeLessThan(12_000);
    await advance(page, 25_000);
    expect(await pixelsMoving(page, 5, 250), 'pixels moving once the visitor has gone').toBe(0);
    await expectSixtyFrames(page, 'with the blink at rest');
  });
});

test.describe('with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('cuts to the open radio and shows nothing but changes of state', async ({ page }) => {
    await inRoom(page);
    const start = await goToRadio(page);
    await advance(page, 300);
    expect((await stats(page))?.radioLidDegrees).toBe(84);
    // The fade is over: the room goes on drawing, and every frame is the same picture.
    await advance(page, 400);
    expect((await stats(page))?.radioAmbient).toBe(false);
    expect(await pixelsMoving(page, 4, 500), 'pixels moving at the open radio').toBe(0);
    await expectSixtyFrames(page, 'at the open radio');
    const target = await disc(page, 0);
    await page.mouse.click(target.x, target.y);
    await advance(page, 400);
    // The disc seated in one frame, ▷II drawn pressed and released; now only the LCD's clock changes.
    expect(await pixelsMoving(page, 3, 1000), 'pixels moving while the disc plays').toBeLessThan(12_000);
    const events = (await log(page)).filter((entry) => entry.at >= start);
    const seated = events.find((entry) => entry.event === 'seated');
    const pick = events.find((entry) => entry.event === 'intent');
    expect((seated?.at ?? 0) - (pick?.at ?? 0)).toBeLessThan(50);
    const cues = events.filter((entry) => entry.event === 'cue').map((entry) => entry.detail);
    expect(
      cues.every((cue) =>
        ['lid-unlatch', 'lid-latch', 'disc-seat', 'key-down', 'key-up', 'power-on'].includes(cue ?? ''),
      ),
    ).toBe(true);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    test('lays the discs and keys out on the page for the app', async ({ page }) => {
      await atRadio(page);
      const layout = await page.evaluate(() => window.__roomLab?.room.radio.deck?.layout);
      if (!layout) throw new Error('No layout');
      expect(layout.discs).toHaveLength(5);
      for (const anchor of layout.discs) {
        expect(anchor.x - anchor.radius).toBeGreaterThanOrEqual(0);
        expect(anchor.x + anchor.radius).toBeLessThanOrEqual(viewport.width);
        expect(anchor.y - anchor.radius).toBeGreaterThanOrEqual(0);
        expect(anchor.radius).toBeGreaterThan(viewport.width < 500 ? 50 : 40);
      }
      for (const key of Object.values(layout.keys)) {
        expect(key.width).toBeGreaterThan(5);
        expect(key.left).toBeGreaterThan(0);
        expect(key.top + key.height).toBeLessThan(viewport.height);
      }
    });
  });
}

test('becomes scenery when its device cannot load', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text());
  });
  // The radio's one lazy chunk (deckChunk.ts: the deck and the device); its parts are the generated room's.
  await page.route(/\/radio\/deckChunk\.ts/, (route) => route.abort());
  await page.goto('/room-lab.html?clean&mockradio=1');
  await page.waitForFunction(() => window.__roomLab !== undefined);
  await page.evaluate(() => window.__roomLab?.room.ready);
  // The lab asks for the deck at once (the app: as the camera first leaves the TV).
  await page.waitForFunction(() => window.__roomLab?.room.radio.available === false, null, { timeout: 20_000 });
  expect(warnings.filter((text) => text.includes('CD player could not load'))).toHaveLength(1);
  await page.evaluate(() => window.__roomLab?.room.showRoom());
  await page.waitForFunction(() => window.__roomLab?.room.view === 'room' && window.__roomLab.room.settled);
  // The radio in the room view is not a target any more: a click there is a click on the room.
  const anchor = await page.evaluate(() => window.__roomLab?.room.anchors.find((entry) => entry.target === 'radio'));
  if (!anchor) throw new Error('No radio anchor');
  await page.mouse.move(anchor.x, anchor.y);
  expect(await page.evaluate(() => document.querySelector('canvas')?.dataset.cursor)).toBe('idle');
  await page.mouse.click(anchor.x, anchor.y);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__roomLab?.room.view)).toBe('room');
  // Asked for all the same, the camera stays where it is and nothing more is said.
  await page.evaluate(() => window.__roomLab?.room.focusRadio());
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__roomLab?.room.view)).toBe('room');
  expect(warnings.filter((text) => text.includes('CD player could not load'))).toHaveLength(1);
});
