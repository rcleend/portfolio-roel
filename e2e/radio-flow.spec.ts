import { expect, type Page, test } from '@playwright/test';
import type {} from '../src/app/hosts/RoomHost';
import { GPU_LAUNCH_ARGS } from './gpu';
import { hostElement, paused, trackErrors, waitForRunning } from './helpers';
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
/** Shader programs after the first room view and at the computer (e2e/pc-monitor.spec.ts); the discs add one. */
const BASE_PROGRAMS = 7;
/** What the radio loads lazily: none of it may be fetched before the visitor has looked around the room. */
const LAZY_RADIO =
  /\/radio\/device\/|RadioDevice|RadioExperience|\/app\/radio\/(player|ui|labels)\/|\/content\/radio\/|radio-closeup|radio-skin|\.m4a|\.mp3/;

const stats = (page: Page) => page.evaluate(() => window.__room?.stats);
const view = (page: Page) => page.evaluate(() => window.__room?.view);
const announced = (page: Page) => page.locator('.radio__announcer');

/** The page on the TV with the game running and the radio's mechanical cues recorded from then on. */
async function open(page: Page, path = '/?seed=1'): Promise<void> {
  await spyOnAudio(page);
  await page.goto(path);
  await waitForRunning(page);
  await page.evaluate(() => {
    const record = window as unknown as { __cues: string[] };
    record.__cues = [];
    window.__room?.radio.onCue((event) => record.__cues.push(event.cue));
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
  await expect.poll(() => page.evaluate(() => window.__room?.radio.live), { timeout: 5000 }).toBe(true);
  // The last disc rises by the landing + 1.2 s on a warm visit, later on a cold one (its print uploads first).
  await expect
    .poll(async () => (await cues(page)).filter((cue) => cue === 'disc-rise').length, { timeout: 8000 })
    .toBeGreaterThanOrEqual(5);
  await page.waitForTimeout(800);
}

/** Where a disc of the shelf is on the page at the radio (its floating slot, or the seat). */
async function disc(page: Page, id: string) {
  const found = await page.evaluate((name) => window.__room?.radio.layout.discs.find((d) => d.disc === name), id);
  if (!found) throw new Error(`No disc ${id} at the radio`);
  return found;
}

/** Clicks a key on the 3D model, at the middle of its projected rect. */
async function pressModelKey(page: Page, key: 'play-pause' | 'stop' | 'previous' | 'next'): Promise<void> {
  const rect = await page.evaluate((name) => window.__room?.radio.layout.keys[name], key);
  if (!rect) throw new Error(`No ${key} key`);
  await page.mouse.click(rect.left + rect.width / 2, rect.top + rect.height / 2);
}

/** Frames the room draws over `ms` of real time. */
async function framesOver(page: Page, ms: number): Promise<number> {
  const before = (await stats(page))?.framesRendered ?? 0;
  await page.waitForTimeout(ms);
  return ((await stats(page))?.framesRendered ?? 0) - before;
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

  const insertCoin = await disc(page, 'insert-coin');
  const elapsed = await timePickToSound(page, () => page.mouse.click(insertCoin.x, insertCoin.y));
  expect(elapsed).toBeLessThanOrEqual(1000);
  expect((await sound(page))?.src).toMatch(/insert-coin\/01-attract-mode/);
  await expect(announced(page)).toHaveText('Playing Attract Mode, track 1 of 3, from Insert Coin by 8-Bit Lodgers.');

  // ▷II on the model pauses; ■ stops on track 1 at 0:00; ⏭ chooses track 2; ▷II plays it.
  await pressModelKey(page, 'play-pause');
  await expect.poll(async () => (await sound(page))?.paused).toBe(true);
  await expect(announced(page)).toHaveText('Paused.');
  await pressModelKey(page, 'stop');
  await expect(announced(page)).toHaveText('Stopped.');
  expect(await sound(page)).toMatchObject({ paused: true, src: expect.stringMatching(/01-attract-mode/) });
  await pressModelKey(page, 'next');
  await pressModelKey(page, 'play-pause');
  const second = await waitAudible(page);
  expect(second.src).toMatch(/insert-coin\/02-high-score-dreams/);
  expect(second.time).toBeLessThan(3);

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
  const first = await disc(page, 'insert-coin');
  await page.mouse.click(first.x, first.y);
  await waitAudible(page);
  const fourth = await disc(page, 'solar-drive');
  await page.mouse.click(fourth.x, fourth.y);
  await expect.poll(async () => (await sound(page))?.src, { timeout: 3000 }).toMatch(/solar-drive\/01-overdrive/);
  const swapped = await waitAudible(page);
  expect(swapped.time).toBeLessThan(3);
  await expect(announced(page)).toHaveText('Playing Overdrive, track 1 of 2, from Solar Drive by Neon Rafters.');
  expect(await page.evaluate(() => window.__spy.audios.length)).toBe(1);
  expect(await elementsPlayed(page)).toBe(1);
  expect(await page.evaluate(() => window.__spy.decodes)).toBe(0);
  // The game's audio context and the radio's own for its mechanical sounds: no more.
  expect(await page.evaluate(() => window.__spy.contexts)).toBeLessThanOrEqual(2);
});

test('the keyboard alone reaches the radio, plays a CD, pauses it and gets back to the TV', async ({ page }) => {
  await open(page);
  const host = hostElement(page);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'room');
  await settled(page);
  const hotspot = page.getByRole('button', { name: 'Play some music' });
  for (let press = 0; press < 3; press++) await page.keyboard.press('Tab');
  await expect(hotspot).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(host).toHaveAttribute('data-view', 'radio');
  // Landed: the keyboard is on the first CD, ringed for a keyboard user.
  const cds = page.getByRole('toolbar', { name: 'CDs' });
  const nightShift = cds.getByRole('button', { name: 'Night Shift by Studio Attic, 2 tracks' });
  await expect(nightShift).toBeFocused({ timeout: 3000 });
  await expect(nightShift).toHaveCSS('outline-color', 'rgb(255, 200, 61)');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(cds.getByRole('button', { name: /^Low Tide by Harbour Lights/ })).toBeFocused();
  const elapsed = await timePickToSound(page, () => page.keyboard.press('Enter'));
  expect(elapsed).toBeLessThanOrEqual(1000);
  expect((await sound(page))?.src).toMatch(/low-tide\/01-slow-water/);
  await expect(cds.getByRole('button', { name: /^Low Tide by Harbour Lights/ })).toHaveAttribute(
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
    await expect.poll(() => page.evaluate(() => window.__room?.radio.live)).toBe(true);
    await expect.poll(async () => (await stats(page))?.radioLidDegrees).toBe(84);
    const lowTide = await disc(page, 'low-tide');
    const elapsed = await timePickToSound(page, () => page.mouse.click(lowTide.x, lowTide.y));
    expect(elapsed).toBeLessThanOrEqual(350);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    // A swap switches at once too, to the disc that was picked.
    const nightShift = await disc(page, 'night-shift');
    await page.mouse.click(nightShift.x, nightShift.y);
    await expect.poll(async () => (await sound(page))?.src).toMatch(/night-shift\/01-kettle-on/);
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
  const toggle = page.getByRole('button', { name: 'Mute sound' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await lookAround(page);
  await goToRadio(page);
  const sunday = await disc(page, 'sunday-roast');
  await page.mouse.click(sunday.x, sunday.y);
  await expect(announced(page)).toHaveText(
    'Playing Coffee Break, track 1 of 2, from Sunday Roast by Trio Placeholder. Sound is off.',
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
  await page.getByRole('button', { name: 'Mute sound' }).click();
  await expect.poll(async () => (await sound(page))?.muted).toBe(false);
  await expect.poll(async () => (await mechanics()).every((gain) => gain === 1)).toBe(true);
});

test.describe('performance', () => {
  test('loads nothing of the radio before the game runs and the first look around', async ({ page }) => {
    const lazy: string[] = [];
    page.on('request', (request) => {
      if (LAZY_RADIO.test(request.url())) lazy.push(new URL(request.url()).pathname);
    });
    const media = audioRequests(page);
    await open(page);
    expect(lazy).toEqual([]);
    await page.mouse.click(WALL.x, WALL.y);
    await settled(page);
    expect(lazy).toEqual([]);
    // Looking around for a while: the radio's halves arrive at idle, but no music before a pick.
    await expect.poll(() => lazy.some((url) => /RadioExperience/.test(url)), { timeout: 8000 }).toBe(true);
    expect(lazy.some((url) => /radio-closeup/.test(url))).toBe(true);
    expect(media).toEqual([]);
  });

  test('rests at the radio, ticks once a second playing, and draws nothing at the computer', async ({ page }) => {
    test.setTimeout(90_000);
    await open(page);
    await lookAround(page);
    expect((await stats(page))?.programs).toBe(BASE_PROGRAMS);
    // The computer first: still the pinned program count, the radio's own is not compiled yet.
    const pc = await anchor(page, 'pc');
    await page.mouse.click(pc.x, pc.y);
    await expect(page.locator('[data-pc-state="reader"]')).toBeAttached({ timeout: 10_000 });
    expect((await stats(page))?.programs).toBe(BASE_PROGRAMS);
    await page.mouse.click(WALL.x, WALL.y);
    await settled(page);

    await goToRadio(page);
    expect((await stats(page))?.programs).toBe(BASE_PROGRAMS + 1);
    // Resting with nothing in the player (past the float's rest 7.2 s after the last input, and the sharper skin's
    // one frame as it swaps in then): no frame at all.
    await page.mouse.move(1430, 890);
    await page.waitForTimeout(9000);
    expect(await framesOver(page, 2000)).toBe(0);
    // Playing, resting: the seated disc is its radial average; only the LCD's clock draws.
    const lowTide = await disc(page, 'low-tide');
    await page.mouse.click(lowTide.x, lowTide.y);
    await waitAudible(page);
    await page.mouse.move(1430, 890);
    await page.waitForTimeout(9000);
    expect(await framesOver(page, 2000)).toBeLessThanOrEqual(2);
    // Paused, still within the visitor's attention: the blinking time, past the float's rest.
    await pressModelKey(page, 'play-pause');
    await expect.poll(async () => (await sound(page))?.paused).toBe(true);
    await page.mouse.move(1430, 890);
    await page.waitForTimeout(9000);
    expect(await framesOver(page, 2000)).toBeLessThanOrEqual(4);
    await pressModelKey(page, 'play-pause');
    await waitAudible(page);

    // The music plays on at the computer, which still draws nothing.
    await page.keyboard.press('Escape');
    await settled(page);
    await page.mouse.click(pc.x, pc.y);
    await expect(page.locator('[data-pc-state="reader"]')).toBeAttached({ timeout: 10_000 });
    await page.waitForTimeout(1000);
    expect(await view(page)).toBe('pc');
    expect((await sound(page))?.paused).toBe(false);
    await expect.poll(async () => (await sound(page))?.volume, { timeout: 3000 }).toBeCloseTo(0.56, 2);
    expect(await framesOver(page, 2000)).toBe(0);
    expect((await stats(page))?.programs).toBe(BASE_PROGRAMS + 1);
  });

  test('keeps the flights to and from the radio, and the arrival, free of long frames at 6× CPU', async ({ page }) => {
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

  test('a tap on the cabinet opens the radio with a bar of keys that also press the model', async ({ page }) => {
    await open(page);
    await page.touchscreen.tap(195, 90);
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
    const box = await bar.boundingBox();
    expect(box?.y ?? 0).toBeGreaterThan(844 - 64 - 40);
    for (const button of await bar.getByRole('button').all()) {
      const size = await button.boundingBox();
      expect(size?.width).toBeGreaterThanOrEqual(44);
      expect(size?.height).toBeGreaterThanOrEqual(44);
    }

    const nightShift = await disc(page, 'night-shift');
    await page.touchscreen.tap(nightShift.x, nightShift.y);
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
    await bar.getByRole('button', { name: 'Look around the room' }).tap();
    await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
    expect((await sound(page))?.paused).toBe(false);
  });

  test.describe('held sideways', () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test('the bar becomes a rail down the right edge', async ({ page }) => {
      await open(page);
      await page.touchscreen.tap(60, 60);
      await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
      await settled(page);
      await goToRadio(page, true);
      await expect(page.locator('.radio')).toHaveAttribute('data-rail', 'true');
      const box = await page.getByRole('toolbar', { name: 'CD player controls' }).boundingBox();
      expect(box?.x ?? 0).toBeGreaterThanOrEqual(844 - 64 - 50);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeCloseTo(844, 0);
      expect(box?.height ?? 0).toBeGreaterThan(200);
      // The discs are framed clear of the rail.
      const layout = await page.evaluate(() => window.__room?.radio.layout.discs ?? []);
      for (const anchor of layout) expect(anchor.x + anchor.radius).toBeLessThanOrEqual(box?.x ?? 0);
    });
  });
});

test('the flat television never loads the radio', async ({ page }) => {
  const lazy: string[] = [];
  page.on('request', (request) => {
    if (LAZY_RADIO.test(request.url()) || /radio-base/.test(request.url())) lazy.push(request.url());
  });
  await page.goto('/?host=flat&seed=1');
  await waitForRunning(page);
  await page.waitForTimeout(5000);
  expect(lazy).toEqual([]);
});
