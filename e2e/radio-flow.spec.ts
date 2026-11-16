import { expect, type Page, test } from '@playwright/test';
import type {} from '../src/app/hosts/RoomHost';
import { GPU_LAUNCH_ARGS } from './gpu';
import {
  differingPixels,
  expectSixtyFrames,
  hostElement,
  paused,
  tapWayOut,
  trackErrors,
  waitForRunning,
} from './helpers';
import {
  FINISHED_RADIO_PROGRAMS,
  postersShown,
  FINISHED_ROOM_PROGRAMS as ROOM_PROGRAMS,
  spotlightIn,
} from './programs';
import { audioRequests, sound, spyOnAudio, timePickToSound, waitAudible } from './radioAudio';

/**
 * The CD player in the real app (docs/RADIO.md, docs/ROOM.md › The CD player): the room's radio with the app's
 * player in it, the placeholder shelf and real media, in real time. Everything runs under the strict autoplay
 * policy, so a play that is not inside a gesture fails here as it would on a phone.
 */
test.use({
  launchOptions: { args: [...GPU_LAUNCH_ARGS, '--autoplay-policy=document-user-activation-required'] },
  viewport: { width: 1440, height: 900 },
  // A trace's DOM snapshots run scripts in the page, which counts as user activation: keep traces without them.
  trace: { mode: 'retain-on-failure', snapshots: false },
});

/** Bare wall beside the window, outside every prop in the room and at the computer and the radio. */
const WALL = { x: 40, y: 450 };
/**
 * What the radio loads lazily: none of it may be fetched before the visitor has looked around the room. Code and
 * music only: the machine itself is generated with the room (docs/ROOM.md › The generated room).
 */
const LAZY_RADIO =
  /\/radio\/deckChunk|\/radio\/device\/|RadioDevice|RadioExperience|\/app\/radio\/(player|ui|labels)\/|\/content\/radio\/|\.m4a|\.mp3/;
/** The room's retired files: its models and textures (`/room/`), the startup still (`/startup/`). */
const ROOM_FILE = /^\/(room|startup)\/|\.(glb|gltf|ktx2)$/;

const stats = (page: Page) => page.evaluate(() => window.__room?.stats);
const view = (page: Page) => page.evaluate(() => window.__room?.view);
const announced = (page: Page) => page.locator('.radio__announcer');

/** The page on the TV with the game running and the radio's mechanical cues recorded from then on. */
async function open(page: Page, path = '/?seed=1'): Promise<void> {
  await spyOnAudio(page);
  // A first visit starts with the sound off; these visits have turned it on before.
  await page.addInitScript(() => localStorage.setItem('reo-leo:session', JSON.stringify({ version: 1, muted: false })));
  await page.goto(path);
  await waitForRunning(page);
  await page.evaluate(() => {
    const record = window as unknown as { __cues: string[] };
    record.__cues = [];
    void window.__room?.radio.load().then((deck) => deck.onCue((event) => record.__cues.push(event.cue)));
  });
}

const cues = (page: Page) => page.evaluate(() => (window as unknown as { __cues: string[] }).__cues);

async function settled(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__room?.settled === true)).toBe(true);
}

/** Looks around the room and waits for the camera to rest there. */
async function lookAround(page: Page): Promise<void> {
  await page.mouse.click(WALL.x, WALL.y);
  await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
  await settled(page);
}

async function anchor(page: Page, target: 'tv' | 'pc' | 'radio') {
  const found = await page.evaluate((name) => window.__room?.anchors.find((entry) => entry.target === name), target);
  if (!found) throw new Error(`The room has no ${target} anchor`);
  return found;
}

/** Clicks (or taps) the radio in the room view, waits for the landing and for every disc to have risen. */
async function goToRadio(page: Page, tap = false): Promise<void> {
  const radio = await anchor(page, 'radio');
  if (tap) await page.touchscreen.tap(radio.x, radio.y);
  else await page.mouse.click(radio.x, radio.y);
  await expect(hostElement(page)).toHaveAttribute('data-view', 'radio');
  await untilDiscsUp(page);
}

async function untilDiscsUp(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__room?.radio.deck?.live), { timeout: 5000 }).toBe(true);
  if (await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    await expect
      .poll(() => page.evaluate(() => window.__room?.radio.deck?.layout.discs.length ?? 0))
      .toBeGreaterThanOrEqual(5);
    return;
  }
  // The last disc rises by the landing + 1.2 s on a warm visit, later on a cold one (its print uploads first).
  await expect
    .poll(async () => (await cues(page)).filter((cue) => cue === 'disc-rise').length, { timeout: 8000 })
    .toBeGreaterThanOrEqual(5);
  await page.waitForTimeout(800);
}

/** Where a disc of the shelf is on the page at the radio (its floating slot, or the seat). */
async function disc(page: Page, id: string) {
  const find = () => page.evaluate((name) => window.__room?.radio.deck?.layout.discs.find((d) => d.disc === name), id);
  // On a loaded machine the lid can reach its angle before the device has published the discs' places.
  await expect.poll(async () => (await find()) !== undefined, { message: `No disc ${id} at the radio` }).toBe(true);
  const found = await find();
  if (!found) throw new Error(`No disc ${id} at the radio`);
  return found;
}

/** Clicks a key on the 3D model, at the middle of its projected rect. */
async function pressModelKey(page: Page, key: 'play-pause' | 'stop' | 'previous' | 'next'): Promise<void> {
  const rect = await page.evaluate((name) => window.__room?.radio.deck?.layout.keys[name], key);
  if (!rect) throw new Error(`No ${key} key`);
  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/** How many media elements have ever been asked to play. */
async function elementsPlayed(page: Page): Promise<number> {
  return page.evaluate(() => window.__spy.audios.filter((element) => element.played.length > 0).length);
}

test('plays a CD on the radio, keeps it going around the room and makes way for the game at the TV', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const errors = trackErrors(page);
  const media = audioRequests(page);
  await open(page);
  await lookAround(page);
  await goToRadio(page);
  await expect(hostElement(page)).toHaveAttribute('aria-label', /At the CD player/);
  expect(await paused(page)).toBe(true);
  expect(media).toEqual([]);

  const gekke = await disc(page, 'gekke-synth-lange-frans');
  const elapsed = await timePickToSound(page, () => page.mouse.click(gekke.x, gekke.y));
  expect(elapsed).toBeLessThanOrEqual(1000);
  expect((await sound(page))?.src).toMatch(/gekke-synth-lange-frans\/gekke-synth-lange-frans/);
  await expect(announced(page)).toHaveText(
    'Playing gekkeSynthLangeFrans, track 1 of 1, from gekkeSynthLangeFrans by Roel Leenders.',
  );

  // ▷II on the model pauses; ■ stops at 0:00; ▷II plays the song again from the top.
  await pressModelKey(page, 'play-pause');
  await expect.poll(async () => (await sound(page))?.paused).toBe(true);
  await expect(announced(page)).toHaveText('Paused.');
  await pressModelKey(page, 'stop');
  await expect(announced(page)).toHaveText('Stopped.');
  expect(await sound(page)).toMatchObject({ paused: true, src: expect.stringMatching(/gekke-synth-lange-frans/) });
  await pressModelKey(page, 'play-pause');
  const again = await waitAudible(page);
  expect(again.src).toMatch(/gekke-synth-lange-frans/);
  expect(again.time).toBeLessThan(3);

  // Escape: back to the room, the music a little farther off.
  await page.keyboard.press('Escape');
  await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
  await expect.poll(async () => (await sound(page))?.volume, { timeout: 3000 }).toBeCloseTo(0.79, 2);
  expect((await sound(page))?.paused).toBe(false);
  await settled(page);

  // The TV takes the floor: the radio fades out and waits while the game plays.
  const tv = await anchor(page, 'tv');
  await page.mouse.click(tv.x, tv.y);
  await expect.poll(async () => (await sound(page))?.paused, { timeout: 2000 }).toBe(true);
  await expect.poll(() => paused(page), { timeout: 5000 }).toBe(false);
  // …and gives it back when the visitor looks away.
  await page.mouse.click(WALL.x, WALL.y);
  await expect.poll(async () => (await sound(page))?.paused, { timeout: 2000 }).toBe(false);
  await expect.poll(async () => (await sound(page))?.volume, { timeout: 3000 }).toBeCloseTo(0.79, 2);
  await settled(page);

  // A radio the visitor paused stays paused through a game at the TV.
  await goToRadio(page);
  await pressModelKey(page, 'play-pause');
  await expect.poll(async () => (await sound(page))?.paused).toBe(true);
  await page.keyboard.press('Escape');
  await settled(page);
  await page.mouse.click(tv.x, tv.y);
  await expect(hostElement(page)).toHaveAttribute('data-view', 'tv');
  await settled(page);
  await page.mouse.click(WALL.x, WALL.y);
  await settled(page);
  await page.waitForTimeout(800);
  expect((await sound(page))?.paused).toBe(true);

  expect(await elementsPlayed(page)).toBe(1);
  expect(errors).toEqual([]);
});

test('a CD picked while another plays takes its place, on the one element', async ({ page }) => {
  await open(page);
  await lookAround(page);
  await goToRadio(page);
  const first = await disc(page, 'gekke-synth-lange-frans');
  await page.mouse.click(first.x, first.y);
  await waitAudible(page);
  const fourth = await disc(page, 'midnight-mirage');
  await page.mouse.click(fourth.x, fourth.y);
  await expect
    .poll(async () => (await sound(page))?.src, { timeout: 3000 })
    .toMatch(/midnight-mirage\/midnight-mirage/);
  const swapped = await waitAudible(page);
  expect(swapped.time).toBeLessThan(3);
  await expect(announced(page)).toHaveText(
    'Playing Midnight Mirage, track 1 of 1, from Midnight Mirage by Roel Leenders.',
  );
  expect(await page.evaluate(() => window.__spy.audios.length)).toBe(1);
  expect(await elementsPlayed(page)).toBe(1);
  await page.waitForFunction(() => window.__room?.stats.rainReady);
  expect(await page.evaluate(() => window.__spy.decodes)).toBe(1);
  // One decode for the rain; the radio still streams. Contexts: game, rain, and the radio's mechanical cues.
  expect(await page.evaluate(() => window.__spy.contexts)).toBeLessThanOrEqual(3);
});

test('the keyboard alone reaches the radio, plays a CD, pauses it and gets back to the TV', async ({ page }) => {
  await open(page);
  const host = hostElement(page);
  await expect(page.locator('.tv-way-out')).toBeAttached();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'room');
  await settled(page);
  const item = page.getByRole('button', { name: /^Music/ });
  for (let press = 0; press < 2; press++) await page.keyboard.press('Tab');
  await expect(item).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'radio');
  // Landed: the keyboard is on the first CD, ringed for a keyboard user.
  const cds = page.getByRole('toolbar', { name: 'CDs' });
  const firstCd = cds.getByRole('button', { name: "It's all in your head by Roel Leenders ft. Bram Reker, 1 track" });
  await expect(firstCd).toBeFocused({ timeout: 3000 });
  await expect(firstCd).toHaveCSS('outline-color', 'rgb(255, 255, 255)');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(cds.getByRole('button', { name: /^DROP THE BOMBS by Roel Leenders/ })).toBeFocused();
  // Chosen the moment the camera lands, before it is out of the radio: it comes up and over to its column first (no
  // disc passes through another), then flies in: 1.2–1.6 s by the choreography (docs/ROOM.md › Known gaps), against
  // 1 s for a disc already out. Measured alone at 0e275c7, eight runs: 1395–1420 ms (the room of models before it:
  // 1225–1419 ms, the same ceiling), so the old 1.5 s left a loaded machine 80 ms and the bound is the storyboard's.
  const elapsed = await timePickToSound(page, () => page.keyboard.press('Enter'));
  test.info().annotations.push({ type: 'keyboard pick to sound', description: `${Math.round(elapsed)} ms` });
  expect(elapsed).toBeLessThanOrEqual(1600);
  expect((await sound(page))?.src).toMatch(/drop-the-bombs\/drop-the-bombs/);
  await expect(cds.getByRole('button', { name: /^DROP THE BOMBS by Roel Leenders/ })).toHaveAttribute(
    'aria-current',
    'true',
  );

  await page.keyboard.press('Tab');
  const controls = page.getByRole('toolbar', { name: 'CD player controls' });
  await expect(controls.getByRole('button', { name: 'Pause' })).toBeFocused();
  await page.keyboard.press(' ');
  await expect.poll(async () => (await sound(page))?.paused).toBe(true);
  await expect(controls.getByRole('button', { name: 'Play' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(host).toHaveAttribute('data-view', 'room');
  await expect(host).toBeFocused();
  await settled(page);
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'tv');
});

test.describe('with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('cuts to the open radio, and a CD is heard within 0.35 s with nothing animating', async ({ page }) => {
    await open(page);
    await lookAround(page);
    const radio = await anchor(page, 'radio');
    await page.mouse.click(radio.x, radio.y);
    await expect.poll(() => page.evaluate(() => window.__room?.radio.deck?.live)).toBe(true);
    await expect.poll(async () => (await stats(page))?.radioLidDegrees).toBe(84);
    const lowTide = await disc(page, 'drop-the-bombs');
    const elapsed = await timePickToSound(page, () => page.mouse.click(lowTide.x, lowTide.y));
    expect(elapsed).toBeLessThanOrEqual(350);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    // A swap switches at once too, to the disc that was picked.
    const firstCd = await disc(page, 'its-all-in-your-head');
    await page.mouse.click(firstCd.x, firstCd.y);
    await expect.poll(async () => (await sound(page))?.src).toMatch(/its-all-in-your-head\/its-all-in-your-head/);
    expect((await waitAudible(page)).time).toBeLessThan(2);
  });
});

test('the sound toggle silences the music and the mechanics, and a CD chosen meanwhile says so', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    // The nodes each audio context feeds its speakers through, in the order the contexts were made.
    const outputs: { node: AudioNode; context: BaseAudioContext }[] = [];
    (window as unknown as { __outputs: typeof outputs }).__outputs = outputs;
    const connect = AudioNode.prototype.connect as (this: AudioNode, ...args: unknown[]) => unknown;
    AudioNode.prototype.connect = function (this: AudioNode, ...args: unknown[]) {
      if (args[0] === this.context.destination) outputs.push({ node: this, context: this.context });
      return connect.apply(this, args);
    } as AudioNode['connect'];
  });
  const toggle = page.locator('.sound-toggle');
  await toggle.click();
  await expect(toggle).toHaveAttribute('data-muted', 'true');
  await lookAround(page);
  await goToRadio(page);
  const last = await disc(page, 'async-002');
  await page.mouse.click(last.x, last.y);
  await expect(announced(page)).toHaveText(
    'Playing Async_002, track 1 of 1, from Async_002 by Roel Leenders. Sound is off.',
  );
  await expect.poll(async () => (await sound(page))?.paused, { timeout: 3000 }).toBe(false);
  await page.waitForTimeout(1200);
  expect((await sound(page))?.muted).toBe(true);
  // The radio's mechanics go through their own small context: its output is silent too.
  const mechanics = () =>
    page.evaluate(() => {
      const outputs = (window as unknown as { __outputs: { node: AudioNode; context: BaseAudioContext }[] }).__outputs;
      const radio = outputs.at(-1)?.context;
      return outputs
        .filter((output) => output.context === radio && output.node instanceof GainNode)
        .map((output) => (output.node as GainNode).gain.value);
    });
  const gains = await mechanics();
  expect(gains.length).toBeGreaterThan(0);
  expect(gains.every((gain) => gain === 0)).toBe(true);
  await page.locator('.sound-toggle').click();
  await expect.poll(async () => (await sound(page))?.muted).toBe(false);
  await expect.poll(async () => (await mechanics()).every((gain) => gain === 1)).toBe(true);
});

test.describe('performance', () => {
  test('loads nothing of the radio before the game runs and the first look around, and no file of the room ever', async ({
    page,
  }) => {
    const lazy: string[] = [];
    const files: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (ROOM_FILE.test(pathname)) files.push(pathname);
      if (LAZY_RADIO.test(request.url()) && !request.url().endsWith('/audio/attic-rain.mp3')) lazy.push(pathname);
    });
    const media = audioRequests(page);
    // Not `open`: it asks for the deck itself, to record its cues.
    await page.goto('/?seed=1');
    await waitForRunning(page);
    await expect.poll(async () => (await stats(page))?.generated, { timeout: 15_000 }).toBe('ready');
    await page.waitForTimeout(500);
    expect(lazy).toEqual([]);
    await page.mouse.click(WALL.x, WALL.y);
    await settled(page);
    // Looking around: the room's half almost at once (the deck's chunk behind the flight, its device prepared 0.4 s
    // after the camera rests), the player (the bigger job) 3 s on; no music before a pick.
    expect(lazy.some((url) => /RadioExperience/.test(url))).toBe(false);
    await expect.poll(() => lazy.some((url) => /\/radio\/device\//.test(url)), { timeout: 3000 }).toBe(true);
    await expect.poll(async () => (await stats(page))?.radioReady, { timeout: 5000 }).toBe(true);
    expect(lazy.some((url) => /RadioExperience/.test(url))).toBe(false);
    await expect.poll(() => lazy.some((url) => /RadioExperience/.test(url)), { timeout: 8000 }).toBe(true);
    expect(media).toEqual([]);
    // The device is ready on the generated radio's own parts: no close-up model and no skin were fetched for it,
    // nor anything else of the room's.
    expect(files).toEqual([]);
  });

  test('reduced motion: nothing moves at the radio but the playing clock, and the computer adds no program', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    test.setTimeout(90_000);
    await open(page);
    await lookAround(page);
    await postersShown(page, () => stats(page));
    await spotlightIn(page, () => stats(page));
    expect((await stats(page))?.programs).toBe(ROOM_PROGRAMS);
    // The computer first: still the pinned program count, the radio's own is not compiled yet.
    const pc = await anchor(page, 'pc');
    await page.mouse.click(pc.x, pc.y);
    await expect(page.locator('[data-pc-state="reader"]')).toBeAttached({ timeout: 10_000 });
    expect((await stats(page))?.programs).toBe(ROOM_PROGRAMS);
    await page.mouse.click(WALL.x, WALL.y);
    await settled(page);

    await goToRadio(page);
    expect((await stats(page))?.programs).toBe(ROOM_PROGRAMS + FINISHED_RADIO_PROGRAMS);
    // The stage as drawn, away from the pointer's hover; the app's own controls lie over it and do not move either.
    const canvas = page.locator('[data-host] canvas');
    const shot = () => canvas.screenshot();
    const apart = async (ms: number) => {
      const first = await shot();
      await page.waitForTimeout(ms);
      return differingPixels(first, await shot());
    };
    await page.mouse.move(1430, 890);
    await page.waitForTimeout(500);
    // Resting with nothing in the player: no float under reduced motion, no dust, no rain; the room draws its sixty
    // frames and every one is the same picture.
    expect((await stats(page))?.radioAmbient).toBe(false);
    expect(await apart(1000), 'pixels moving at the resting radio').toBe(0);
    await expectSixtyFrames(page, 'at the resting radio');
    // Playing: the seated disc is its radial average, the same image every frame; only the LCD's clock changes.
    const lowTide = await disc(page, 'drop-the-bombs');
    await page.mouse.click(lowTide.x, lowTide.y);
    await waitAudible(page);
    await page.mouse.move(1430, 890);
    await page.waitForTimeout(1000);
    // The clock ticks once a second: looked for over a few of them, and then small (some 2–4 thousand pixels around
    // the readout, measured; under 1 % of the frame's 1.3 million).
    const before = await shot();
    let ticking = 0;
    await expect
      .poll(async () => (ticking = await differingPixels(before, await shot())), { timeout: 6000, intervals: [500] })
      .toBeGreaterThan(0);
    expect(ticking, 'nothing but the readout changes').toBeLessThan(12_000);
    // Paused: under reduced motion the time does not blink (it would, twice a second, for a visitor who is there).
    await pressModelKey(page, 'play-pause');
    await expect.poll(async () => (await sound(page))?.paused).toBe(true);
    await page.mouse.move(1430, 890);
    await page.waitForTimeout(1000);
    expect(await apart(750), 'pixels moving with the disc paused').toBe(0);
    await pressModelKey(page, 'play-pause');
    await waitAudible(page);

    // The music plays on at the computer, where the room keeps its frames and nothing in it moves.
    await page.keyboard.press('Escape');
    await settled(page);
    await page.mouse.click(pc.x, pc.y);
    await expect(page.locator('[data-pc-state="reader"]')).toBeAttached({ timeout: 10_000 });
    await page.waitForTimeout(1000);
    expect(await view(page)).toBe('pc');
    expect((await sound(page))?.paused).toBe(false);
    await expect.poll(async () => (await sound(page))?.volume, { timeout: 3000 }).toBeCloseTo(0.56, 2);
    // Beside the monitor, clear of the live screen (whose own clock may turn a minute).
    const placement = await page.evaluate(() => window.__room?.pc.placement);
    if (!placement) throw new Error('No live screen');
    const beside = { x: 0, y: 0, width: Math.floor(placement.left) - 60, height: 900 };
    const room = await page.screenshot({ clip: beside });
    await page.waitForTimeout(1000);
    expect(
      await differingPixels(room, await page.screenshot({ clip: beside })),
      'pixels moving in the room at the computer while the music plays',
    ).toBe(0);
    await expectSixtyFrames(page, 'at the computer');
    expect((await stats(page))?.programs).toBe(ROOM_PROGRAMS + FINISHED_RADIO_PROGRAMS);
  });

  test('keeps the flights to and from the radio, and the arrival, free of long frames at 6× CPU', {
    tag: '@frames',
  }, async ({ page }) => {
    await open(page);
    await lookAround(page);
    // Prepared ahead of need, as for a visitor who looked around first: the device, the player and the prints.
    await expect(page.locator('.radio')).toBeAttached({ timeout: 10_000 });
    await expect
      .poll(async () => (await stats(page))?.radioReady === true && !(await stats(page))?.backgroundPending, {
        timeout: 15_000,
      })
      .toBe(true);
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const room = window.__room;
      if (!room) throw new Error('No room');
      const log = { flights: [] as { start: number; end: number }[], frames: [] as unknown[] };
      room.onViewChange(() => log.flights.push({ start: performance.now(), end: Number.POSITIVE_INFINITY }));
      room.onSettle(() => {
        const flight = log.flights.at(-1);
        if (flight) flight.end = performance.now();
      });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          scripts: { invoker: string; duration: number }[];
        })[]) {
          const scripts = entry.scripts
            .filter((s) => s.duration > 5)
            .map((s) => `${s.invoker} ${Math.round(s.duration)} ms`);
          log.frames.push({ start: entry.startTime, duration: entry.duration, scripts });
        }
      }).observe({ type: 'long-animation-frame' });
      (window as unknown as { __flightLog: typeof log }).__flightLog = log;
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    // A person's click: Playwright's default sends press and release in one task, which no hand does.
    const press = { delay: 80 };
    const radio = await anchor(page, 'radio');
    await page.mouse.click(radio.x, radio.y, press);
    await expect.poll(() => page.evaluate(() => window.__room?.settled), { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(2500);
    await page.mouse.click(WALL.x, 120, press);
    await expect.poll(() => view(page)).toBe('room');
    await expect.poll(() => page.evaluate(() => window.__room?.settled), { timeout: 10_000 }).toBe(true);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const { flights, frames } = await page.evaluate(
      () =>
        (
          window as unknown as {
            __flightLog: { flights: { start: number; end: number }[]; frames: { start: number; duration: number }[] };
          }
        ).__flightLog,
    );
    expect(flights.map(({ end }) => Number.isFinite(end))).toEqual([true, true]);
    // Both flights, and at the radio the lid's swing and the discs rising until they are ready to pick.
    const [there, back] = flights;
    const windows = [
      { start: there?.start ?? 0, end: (there?.end ?? 0) + 1500 },
      { start: back?.start ?? 0, end: back?.end ?? 0 },
    ];
    const during = frames.filter((frame) =>
      windows.some(({ start, end }) => frame.start < end && frame.start + frame.duration > start),
    );
    expect(during).toEqual([]);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a tap on the cabinet opens the radio with its play key, which also presses the model, and the way back', async ({
    page,
  }) => {
    await open(page);
    await tapWayOut(page);
    await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
    await settled(page);
    const radio = await anchor(page, 'radio');
    // The cabinet the radio stands on, below its front panel.
    await page.touchscreen.tap(radio.x, radio.y + 70);
    await expect(hostElement(page)).toHaveAttribute('data-view', 'radio');
    await expect(page.locator('.touchpad')).toHaveAttribute('data-visible', 'false');
    await untilDiscsUp(page);
    const bar = page.getByRole('toolbar', { name: 'CD player controls' });
    await expect(bar).toBeVisible();
    for (const button of await bar.getByRole('button').all()) {
      const size = await button.boundingBox();
      expect(size?.width).toBeGreaterThanOrEqual(44);
      expect(size?.height).toBeGreaterThanOrEqual(44);
    }
    // The way back is in the sound toggle's row, exactly its height and on its centre line.
    const toggle = await page.locator('.sound-toggle').boundingBox();
    const back = await bar.getByRole('button', { name: 'Back to the room' }).boundingBox();
    expect(back?.height).toBeCloseTo(toggle?.height ?? 0, 0);
    expect((back?.y ?? 0) + (back?.height ?? 0) / 2).toBeCloseTo((toggle?.y ?? 0) + (toggle?.height ?? 0) / 2, 0);
    // The discs hang clear of both.
    const layout = await page.evaluate(() => window.__room?.radio.deck?.layout.discs ?? []);
    for (const anchor of layout)
      expect(anchor.y - anchor.radius).toBeGreaterThanOrEqual((back?.y ?? 0) + (back?.height ?? 0));

    const firstCd = await disc(page, 'its-all-in-your-head');
    await page.touchscreen.tap(firstCd.x, firstCd.y);
    await waitAudible(page);
    const before = (await cues(page)).length;
    await bar.getByRole('button', { name: 'Pause' }).tap();
    await expect.poll(async () => (await sound(page))?.paused).toBe(true);
    // The model's own ▷II pressed with the bar's.
    await expect
      .poll(async () => (await cues(page)).slice(before))
      .toEqual(expect.arrayContaining(['key-down', 'key-up']));
    await bar.getByRole('button', { name: 'Play' }).tap();
    await waitAudible(page);
    await bar.getByRole('button', { name: 'Back to the room' }).tap();
    await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
    expect((await sound(page))?.paused).toBe(false);
  });

  test("the visit's first tap on a CD picks it without flashing its caption", async ({ page }) => {
    await open(page);
    await tapWayOut(page);
    await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
    await settled(page);
    await goToRadio(page, true);
    // Every frame from here: the plate's opacity, and when the finger went down and came up, in the page's time.
    await page.evaluate(() => {
      const record = window as unknown as { __plate: [number, number][]; __finger: Record<string, number> };
      record.__plate = [];
      record.__finger = {};
      const canvas = document.querySelector('.room-host canvas');
      for (const type of ['pointerdown', 'pointerup']) {
        canvas?.addEventListener(
          type,
          () => {
            record.__finger[type] ??= performance.now();
          },
          { capture: true },
        );
      }
      const sample = (): void => {
        const plate = document.querySelector('.radio__caption');
        record.__plate.push([performance.now(), plate ? Number(getComputedStyle(plate).opacity) : 0]);
        if (record.__plate.length < 90) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    // A real finger: down for 100 ms, then up (Playwright's own tap lifts it at once).
    const cdp = await page.context().newCDPSession(page);
    const dropTheBombs = await disc(page, 'drop-the-bombs');
    const point = { x: dropTheBombs.x, y: dropTheBombs.y };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await waitAudible(page);

    const { plate, finger } = await page.evaluate(() => {
      const record = window as unknown as { __plate: [number, number][]; __finger: Record<string, number> };
      return { plate: record.__plate, finger: record.__finger };
    });
    const down = finger.pointerdown ?? Number.NaN;
    const up = finger.pointerup ?? Number.NaN;
    expect(up - down).toBeGreaterThan(0);
    // The caption shows only under a finger that stays 250 ms; one lifted sooner never shows it at all. A finger the
    // loaded page delivered late is held for longer, so only its first 250 ms count.
    const hold = up - down < 250 ? Number.POSITIVE_INFINITY : 250;
    const seen = plate.filter(([time, opacity]) => time >= down && time - down < hold && opacity > 0);
    expect(seen).toEqual([]);
  });

  test.describe('held sideways', () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test('the way back and the play key become a rail down the right edge', async ({ page }) => {
      await open(page);
      await tapWayOut(page);
      await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
      await settled(page);
      await goToRadio(page, true);
      await expect(page.locator('.radio')).toHaveAttribute('data-rail', 'true');
      const box = await page.getByRole('toolbar', { name: 'CD player controls' }).boundingBox();
      expect(box?.x ?? 0).toBeGreaterThanOrEqual(844 - 100 - 50);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeCloseTo(844, 0);
      expect(box?.height ?? 0).toBeGreaterThan(140);
      // The discs are framed clear of the rail.
      const layout = await page.evaluate(() => window.__room?.radio.deck?.layout.discs ?? []);
      for (const anchor of layout) expect(anchor.x + anchor.radius).toBeLessThanOrEqual(box?.x ?? 0);
    });
  });
});

/** The LCD's mean brightness (0–255) on the page at the radio, at this file's 1440 × 900 viewport. */
async function lcdBrightness(page: Page): Promise<number> {
  const shot = await page.screenshot({ clip: { x: 560, y: 560, width: 85, height: 20 } });
  return page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return 0;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0)) / 3;
    return sum / (data.length / 4);
  }, shot.toString('base64'));
}

/** Lit, "no dISC" reads about 136 here; the panel behind it, unlit, about 21, and a blank picture of it about 14. */
const LCD_LIT = 100;

test('the LCD lights again after the GPU process restarts (a laptop waking, a display change)', async ({
  playwright,
}) => {
  // Its own browser: a crashed GPU process counts against the worker's, which blocks WebGL after a few.
  const browser = await playwright.chromium.launch({ args: [...GPU_LAUNCH_ARGS] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(() => {
      const record = window as unknown as { __restored: boolean };
      record.__restored = false;
      addEventListener('webglcontextrestored', () => (record.__restored = true), true);
    });
    await open(page);
    await lookAround(page);
    await goToRadio(page);
    await expect.poll(() => lcdBrightness(page)).toBeGreaterThan(LCD_LIT);
    await page.keyboard.press('Escape');
    await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
    await settled(page);
    // A GPU reset wipes every canvas: the LCD's comes back blank, and the restored WebGL context uploads it as it is.
    await (await browser.newBrowserCDPSession()).send('Browser.crashGpuProcess');
    await expect.poll(() => page.evaluate(() => (window as unknown as { __restored: boolean }).__restored)).toBe(true);
    await goToRadio(page);
    await expect.poll(() => lcdBrightness(page)).toBeGreaterThan(LCD_LIT);
  } finally {
    await browser.close();
  }
});

test('the flat television never loads the radio', async ({ page }) => {
  const lazy: string[] = [];
  page.on('request', (request) => {
    if (LAZY_RADIO.test(request.url()) || ROOM_FILE.test(new URL(request.url()).pathname)) lazy.push(request.url());
  });
  await page.goto('/?host=flat&seed=1');
  await waitForRunning(page);
  await page.waitForTimeout(5000);
  expect(lazy).toEqual([]);
});
