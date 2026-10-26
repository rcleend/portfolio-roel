#!/usr/bin/env node
// Development-only: screenshots the room lab in Playwright Chromium for visual review.
//   node scripts/room-shots.mjs [--only name,name] [--out .shots/room]
// Uses the GPU (ANGLE/Metal) in headless mode; set ROOM_SHOTS_GL=swiftshader to force
// software GL, and CHROMIUM_PATH to pick a browser binary.
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const only = option('only', '')?.split(',').filter(Boolean) ?? [];
const outDir = resolve(option('out', '.shots/room'));

const cachedChromium = join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(cachedChromium) ? cachedChromium : undefined);
const glArgs =
  process.env.ROOM_SHOTS_GL === 'swiftshader'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const address = server.httpServer?.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 5173}`;
const browser = await chromium.launch({ executablePath, args: glArgs });
await mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** posters-detail crops in CSS pixels of the 1440×900 room view: the densest cluster, taped corners, the corkboard. */
const POSTERS_DETAIL_CLIPS = {
  cluster: { x: 570, y: 165, width: 420, height: 270 },
  oblivion: { x: 80, y: 172, width: 120, height: 90 },
  corkboard: { x: 92, y: 318, width: 120, height: 80 },
  slope: { x: 830, y: 20, width: 340, height: 220 },
  /** B1's top-left tape, lifted 6 mm off the wall. */
  tape: { x: 565, y: 175, width: 90, height: 60 },
  /** A flat tape on the pale slope (the Avatar print's lower-right corner), 0.3 mm over its skirt. */
  'tape-slope': { x: 1095, y: 150, width: 90, height: 60 },
};

async function openLab(viewport, query = '', { clock = false } = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: viewport.dpr ?? 2 });
  // A fake clock installed later would restart performance.now(), and the radio's timelines with it.
  if (clock) await page.clock.install();
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') console.log(`[page ${msg.type()}] ${msg.text()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) console.log(`[http ${response.status()}] ${response.url()}`);
  });
  page.on('pageerror', (error) => console.log(`[page error] ${error.message}`));
  await page.goto(`${base}/room-lab.html?clean${query}`);
  await page.waitForFunction(() => window.__roomLab !== undefined);
  await page.evaluate(() => window.__roomLab.room.ready);
  return page;
}

async function shot(page, name) {
  if (process.env.SHOT_DEBUG) console.log(name, 'page time', await page.evaluate(() => performance.now()));
  const path = join(outDir, `${name}.png`);
  await page.screenshot({ path });
  console.log(`wrote ${path}`);
}

/** Puts the screen in a known state: powered on, game paused on a fixed frame. */
async function poweredStill(page, frame = 120) {
  await page.evaluate(async (n) => {
    const { room, surface } = window.__roomLab;
    await room.powerOn();
    surface.pause();
    surface.showFrame(n);
  }, frame);
  await sleep(150);
}

/** Flies to the computer with the lab's test card on its still and live screen, and waits for the landing. */
async function atComputer(page) {
  await page.evaluate(() => window.__roomLab.room.focusPc());
  await page.waitForFunction(() => window.__roomLab.room.pc.live);
  // Past the live screen's 160 ms fade.
  await sleep(400);
}

async function pcState(page) {
  return page.evaluate(() => {
    const { room } = window.__roomLab;
    const { programs, pcTexturePixels, pixelRatio } = room.stats;
    return { placement: room.pc.placement, live: room.pc.live, programs, pcTexturePixels, pixelRatio };
  });
}

/** The lab with its mock collection, the screen on a still, and the radio's device prepared ahead of need. */
async function radioLab(viewport, options = {}) {
  const page = await openLab(viewport, `&autopower=0&mockradio=1${options.query ?? ''}`, {
    clock: options.clock ?? false,
  });
  if (options.reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await poweredStill(page);
  await page.waitForFunction(() => window.__roomLab.room.stats.radioReady, null, { timeout: 30_000 });
  await page.waitForFunction(() => !window.__roomLab.room.stats.backgroundPending, null, { timeout: 30_000 });
  return page;
}

/** Flies to the radio and waits for the landing and the lid, past the emergence. */
async function atRadio(page) {
  await page.evaluate(() => window.__roomLab.room.focusRadio());
  await page.waitForFunction(() => window.__roomLab.room.radio.deck?.live);
  await sleep(1800);
}

/** Clicks the floating disc at `index` (slot order) and waits for the insert, the press and the spin-up. */
async function pickDisc(page, index, wait = 2600) {
  const disc = await page.evaluate((i) => window.__roomLab.room.radio.deck?.layout.discs[i], index);
  await page.mouse.click(disc.x, disc.y);
  await sleep(wait);
}

/** The pointer on the floating disc at `index`, a little off its centre: it pays attention and tilts. */
async function hoverDisc(page, index) {
  const disc = await page.evaluate((i) => window.__roomLab.room.radio.deck?.layout.discs[i], index);
  await page.mouse.move(disc.x + disc.radius * 0.35, disc.y - disc.radius * 0.3, { steps: 6 });
  await sleep(1200);
}

async function radioState(page) {
  return page.evaluate(() => {
    const { room, radio } = window.__roomLab;
    const { programs, drawCalls, radioTexturePixels, radioLidDegrees, radioAmbient, pixelRatio } = room.stats;
    return {
      view: room.view,
      live: room.radio.deck?.live,
      lcd: radio?.deckState.lcd,
      programs,
      drawCalls,
      radioTexturePixels,
      radioLidDegrees: Math.round(radioLidDegrees * 10) / 10,
      radioAmbient,
      pixelRatio,
    };
  });
}

/**
 * Captures `times` (ms after `start` runs) on Playwright's paused fake clock (installed when the page opened),
 * stepping 16 ms at a time so every animation frame lands, and writes them as one labelled strip of `columns` tiles
 * (optionally cropped to `clip`).
 */
async function strip(page, name, times, start, { clip, columns = 4, scale = 0.25 } = {}) {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
  const advance = async (ms) => {
    for (let t = 0; t < ms; t += 16) await page.clock.runFor(Math.min(16, ms - t));
  };
  await advance(600);
  await start();
  const frames = [];
  let at = 0;
  for (const t of times) {
    await advance(t - at);
    at = t;
    frames.push({ t, png: await page.screenshot(clip ? { clip } : {}) });
  }
  const { width, height } = await sharp(frames[0].png).metadata();
  const tw = Math.round(width * scale);
  const th = Math.round(height * scale);
  const tiles = await Promise.all(
    frames.map(async (frame, i) => ({
      input: await sharp(frame.png)
        .resize(tw, th)
        .composite([
          {
            input: Buffer.from(
              `<svg width="84" height="22"><rect width="84" height="22" fill="black"/><text x="5" y="16" font-family="Menlo" font-size="14" fill="white">+${frame.t}</text></svg>`,
            ),
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toBuffer(),
      left: (i % columns) * tw,
      top: Math.floor(i / columns) * th,
    })),
  );
  const path = join(outDir, `${name}.png`);
  await sharp({
    create: { width: columns * tw, height: Math.ceil(frames.length / columns) * th, channels: 3, background: '#000' },
  })
    .composite(tiles)
    .png()
    .toFile(path);
  console.log(`wrote ${path}`);
  return page.evaluate(() =>
    (window.__roomLab.radio?.log ?? []).map((entry) => `${Math.round(entry.at)} ${entry.event} ${entry.detail ?? ''}`),
  );
}

/** Frames rendered per second over `ms` of real time while `during` holds. */
async function rate(page, ms = 1000) {
  return page.evaluate(async (span) => {
    const { room } = window.__roomLab;
    const start = room.stats.framesRendered;
    const began = performance.now();
    await new Promise((r) => setTimeout(r, span));
    return Math.round(((room.stats.framesRendered - start) / ((performance.now() - began) / 1000)) * 10) / 10;
  }, ms);
}

/** Frame rate over the first second of a flight (each lasts 1.1 s), then waits for the landing and settling. */
async function flightRate(page, action, settle = 600) {
  const value = await page.evaluate(async (name) => {
    const { room } = window.__roomLab;
    const start = room.stats.framesRendered;
    const began = performance.now();
    room[name]();
    await new Promise((r) => setTimeout(r, 1000));
    return (room.stats.framesRendered - start) / ((performance.now() - began) / 1000);
  }, action);
  await sleep(settle);
  return Math.round(value * 10) / 10;
}

/** The radio's frame rates and costs per state, as `label: value` lines. */
async function radioPerf(page, label) {
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  await page.evaluate(() => window.__roomLab.room.showRoom());
  await sleep(1800);
  const legs = { tv: [], radio: [] };
  for (let round = 0; round < 2; round++) {
    legs.tv.push(await flightRate(page, 'focusTv'), await flightRate(page, 'showRoom'));
    legs.radio.push(await flightRate(page, 'focusRadio', 1800), await flightRate(page, 'showRoom'));
  }
  await page.evaluate(() => window.__roomLab.room.focusRadio());
  await page.waitForFunction(() => window.__roomLab.room.radio.deck?.live);
  await sleep(1800);
  await page.mouse.move(4, 4);
  await sleep(7500);
  const rest = await rate(page);
  await hoverDisc(page, 0);
  const attentive = await rate(page);
  await page.mouse.move(4, 4);
  await sleep(1500);
  const floating = await rate(page);
  await pickDisc(page, 1, 2600);
  const playing = await rate(page, 2000);
  await sleep(7000);
  const playingRest = await rate(page, 2000);
  const result = {
    'flights room ↔ tv (frames/s)': legs.tv.join(', '),
    'flights room ↔ radio (frames/s)': legs.radio.join(', '),
    'radio legs / tv legs (median)': (median(legs.radio) / median(legs.tv)).toFixed(2),
    'at the radio, at rest': rest,
    'a disc paying attention (ambient)': attentive,
    'pointer gone, idle settling': floating,
    'just picked, spinning up': playing,
    'playing, at rest (clock ticks)': playingRest,
    stats: JSON.stringify(await radioState(page)),
  };
  for (const [key, value] of Object.entries(result)) console.log(`${label} ${key}: ${value}`);
}

/**
 * The posters' load from the TV through the first flight to the room and its landing: every rAF interval over
 * 16.7 ms (the main thread's long frames), when the walls became ready against the departure, and the flight's rate.
 */
async function postersPerf(page, label) {
  await page.waitForFunction(() => !window.__roomLab.surface.paused);
  await page.evaluate(() => {
    const frames = [];
    window.__postersFrames = frames;
    const tick = (now) => {
      frames.push([now, window.__roomLab.room.stats.posters]);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // The TV's idle unit fetches and decodes the tier behind the opening view.
  await sleep(4000);
  const result = await page.evaluate(async () => {
    const { room } = window.__roomLab;
    const frames = window.__postersFrames;
    const departed = performance.now();
    const before = room.stats.framesRendered;
    room.showRoom();
    await new Promise((r) => setTimeout(r, 1000));
    const flightRate = (room.stats.framesRendered - before) / ((performance.now() - departed) / 1000);
    await new Promise((r) => setTimeout(r, 1500));
    const long = (from, to) => {
      const spans = [];
      for (let i = 1; i < frames.length; i++) {
        const [now] = frames[i];
        if (now < from || now > to) continue;
        const span = now - frames[i - 1][0];
        if (span > 16.7) spans.push(Math.round(span));
      }
      return spans;
    };
    const ready = frames.find(([now, state]) => now >= departed && state === 'ready');
    return {
      'at the TV, long frames (ms)': long(0, departed).join(' ') || 'none',
      'departure to landing, long frames (ms)': long(departed, departed + 2500).join(' ') || 'none',
      'ready after departure (ms, first piece in frame at >= 400)': ready ? Math.round(ready[0] - departed) : 'never',
      'first flight (frames/s)': Math.round(flightRate * 10) / 10,
      stats: JSON.stringify(room.stats),
    };
  });
  for (const [key, value] of Object.entries(result)) console.log(`${label} ${key}: ${value}`);
}

/** Mean absolute difference (0–255, all channels) of two same-sized PNG screenshots. */
async function meanDifference(a, b) {
  const [left, right] = await Promise.all([a, b].map((png) => sharp(png).removeAlpha().raw().toBuffer()));
  let sum = 0;
  for (let i = 0; i < left.length; i++) sum += Math.abs(left[i] - right[i]);
  return sum / left.length;
}

const scenarios = {
  async 'pc-desktop'() {
    const page = await openLab({ width: 1440, height: 900 }, '&autopower=0&mockpc=1');
    await poweredStill(page);
    await atComputer(page);
    await shot(page, 'pc-desktop');
    console.log('pc-desktop:', JSON.stringify(await pcState(page)));
    await page.close();
  },
  async 'pc-phone'() {
    const page = await openLab({ width: 390, height: 844, dpr: 3 }, '&autopower=0&mockpc=1');
    await poweredStill(page);
    await atComputer(page);
    await shot(page, 'pc-phone');
    console.log('pc-phone:', JSON.stringify(await pcState(page)));
    await page.close();
  },
  async 'pc-flight'() {
    const page = await openLab({ width: 1440, height: 900 }, '&autopower=0&mockpc=1');
    await poweredStill(page);
    await page.evaluate(() => window.__roomLab.room.showRoom());
    await sleep(1600);
    // Frame-exact moments of the crane onto the desk, as in power-on.
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    await page.evaluate(() => window.__roomLab.room.focusPc());
    let elapsed = 0;
    for (const ms of [300, 600, 900, 1050]) {
      await page.clock.runFor(ms - elapsed);
      elapsed = ms;
      await shot(page, `pc-flight-${String(ms).padStart(4, '0')}`);
    }
    await page.close();
  },
  async 'pc-handoff'() {
    const page = await openLab({ width: 1440, height: 900, dpr: 2 }, '&autopower=0&mockpc=1');
    await poweredStill(page);
    await atComputer(page);
    const { left, top, width, height } = await page.evaluate(() => window.__roomLab.room.pc.placement);
    // A few pixels inside the picture: the rounded corners and the anti-aliased rim are not content.
    const clip = { x: left + 4, y: top + 4, width: width - 8, height: height - 8 };
    const shown = await page.screenshot({ clip });
    await page.evaluate(() => {
      document.querySelector('[data-pc-screen]').style.visibility = 'hidden';
    });
    await sleep(100);
    const still = await page.screenshot({ clip });
    await sharp(still).toFile(join(outDir, 'pc-handoff-still.png'));
    await sharp(shown).toFile(join(outDir, 'pc-handoff-live.png'));
    console.log(
      `pc hand-off: mean |Δ| ${(await meanDifference(still, shown)).toFixed(2)}/255 over ${width} × ${height} CSS px`,
    );
    await page.close();
  },
  async 'tv-desktop'() {
    const page = await openLab({ width: 1440, height: 900 }, '&autopower=0');
    await poweredStill(page);
    await shot(page, 'tv-desktop');
    await page.close();
  },
  async 'tv-off'() {
    const page = await openLab({ width: 1440, height: 900 }, '&autopower=0');
    await sleep(300);
    await shot(page, 'tv-off');
    await page.close();
  },
  async 'tv-phone'() {
    const page = await openLab({ width: 390, height: 844, dpr: 3 }, '&autopower=0');
    await poweredStill(page);
    await shot(page, 'tv-phone');
    await page.close();
  },
  async 'power-on'() {
    const page = await openLab({ width: 1440, height: 900 }, '&autopower=0');
    // Playwright's fake clock also drives requestAnimationFrame, so each shot lands on an
    // exact moment of the sequence however slow the capture is.
    await page.clock.install();
    // Stop the fake clock from also following wall time while screenshots are encoded.
    await page.clock.pauseAt(Date.now() + 1000);
    await page.evaluate(() => {
      window.__roomLab.surface.showFrame(60);
      void window.__roomLab.room.powerOn();
    });
    let elapsed = 0;
    // The LED leads the tube by 140 ms; the CRT timeline starts on the next frame.
    for (const ms of [100, 200, 300, 380, 440, 520, 640, 800]) {
      await page.clock.runFor(ms - elapsed);
      elapsed = ms;
      await shot(page, `power-on-${String(ms).padStart(3, '0')}`);
    }
    await page.close();
  },
  async 'game-running'() {
    const page = await openLab({ width: 1440, height: 900 });
    await page.waitForFunction(() => !window.__roomLab.surface.paused);
    await sleep(800);
    // Hover the centre of the picture: the crosshair must sit under the pointer.
    const box = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await sleep(100);
    await shot(page, 'game-running');
    // Probe the corners: the reported native pixel must match the picture under the pointer.
    for (const [x, y] of [
      [400, 140],
      [1040, 140],
      [400, 618],
      [1040, 618],
      [200, 450],
    ]) {
      await page.mouse.move(x, y);
      await sleep(60);
      const last = await page.evaluate(() => window.__roomLab.surface.pointerLog.at(-1));
      console.log(`pointer at css ${x},${y} -> ${last}`);
      if (x === 1040 && y === 618) await shot(page, 'pointer-br');
    }
    // Clicks on the picture and on the bezel/control panel must keep the TV view.
    await page.mouse.click(720, 400);
    const log = await page.evaluate(() => window.__roomLab.surface.pointerLog.slice(-3).join(' | '));
    await page.mouse.click(720, 750);
    await sleep(100);
    console.log(
      `click picture -> ${log}; after bezel click view = ${await page.evaluate(() => window.__roomLab.room.view)}`,
    );
    await page.close();
  },
  async 'room-view'() {
    const page = await openLab({ width: 1440, height: 900 });
    await page.waitForFunction(() => !window.__roomLab.surface.paused);
    await page.mouse.click(60, 450);
    await sleep(500);
    await shot(page, 'room-mid-flight');
    await sleep(1200);
    await shot(page, 'room-view');
    const state = await page.evaluate(() => ({
      view: window.__roomLab.room.view,
      paused: window.__roomLab.surface.paused,
      input: window.__roomLab.surface.input,
    }));
    console.log('after clicking outside the TV:', JSON.stringify(state));
    await page.close();
  },
  async 'back-to-tv'() {
    const page = await openLab({ width: 1440, height: 900 });
    await page.waitForFunction(() => !window.__roomLab.surface.paused);
    await page.evaluate(() => window.__roomLab.room.showRoom());
    await sleep(1600);
    // Centre of the TV picture in the 1440×900 room view.
    await page.mouse.click(1202, 529);
    await sleep(1600);
    await shot(page, 'back-to-tv');
    const state = await page.evaluate(() => ({
      view: window.__roomLab.room.view,
      paused: window.__roomLab.surface.paused,
      input: window.__roomLab.surface.input,
    }));
    console.log('after clicking the TV:', JSON.stringify(state));
    await page.close();
  },
  async perf() {
    const page = await openLab({ width: 1440, height: 900 }, '&mockpc=1');
    await page.waitForFunction(() => !window.__roomLab.surface.paused);
    const framesPerSecond = () =>
      page.evaluate(async () => {
        const { room } = window.__roomLab;
        const start = room.stats.framesRendered;
        await new Promise((r) => setTimeout(r, 1000));
        return room.stats.framesRendered - start;
      });
    /**
     * Frame rate over the first second of a flight (each lasts 1.1 s), then waits for the landing and
     * a settled room: 900 ms, or the landing's frames would count in the next leg's second.
     */
    const flight = async (action) => {
      const rate = await page.evaluate(async (name) => {
        const { room } = window.__roomLab;
        const start = room.stats.framesRendered;
        const began = performance.now();
        room[name]();
        await new Promise((r) => setTimeout(r, 1000));
        return (room.stats.framesRendered - start) / ((performance.now() - began) / 1000);
      }, action);
      await sleep(900);
      return rate;
    };
    const median = (rates) => [...rates].sort((a, b) => a - b)[Math.floor(rates.length / 2)];
    console.log('tv view, game running:', await framesPerSecond(), 'frames/s');
    await page.evaluate(() => window.__roomLab.surface.pause());
    await sleep(200);
    console.log('tv view, game paused:', await framesPerSecond(), 'frames/s');
    console.log('flight tv → room (first leave):', (await flight('showRoom')).toFixed(1), 'frames/s');
    console.log('room view (lava visible):', await framesPerSecond(), 'frames/s');
    console.log('stats:', JSON.stringify(await page.evaluate(() => window.__roomLab.room.stats)));
    // Each leg several times, compared by medians: software GL on a busy machine is noisy.
    const legs = { 'room → tv': [], 'tv → room': [], 'room → pc': [], 'pc → room': [] };
    for (let round = 0; round < Number(process.env.PERF_ROUNDS ?? 3); round++) {
      legs['room → tv'].push(await flight('focusTv'));
      legs['tv → room'].push(await flight('showRoom'));
      legs['room → pc'].push(await flight('focusPc'));
      legs['pc → room'].push(await flight('showRoom'));
    }
    for (const [leg, rates] of Object.entries(legs)) {
      console.log(
        `flight ${leg}: median ${median(rates).toFixed(1)} frames/s (${rates.map((r) => r.toFixed(1)).join(', ')})`,
      );
    }
    const pcLegs = (median(legs['room → pc']) + median(legs['pc → room'])) / 2;
    const tvLegs = (median(legs['room → tv']) + median(legs['tv → room'])) / 2;
    console.log('computer legs / TV legs:', (pcLegs / tvLegs).toFixed(2), '(budget ≥ 0.9)');
    await page.evaluate(() => window.__roomLab.room.focusPc());
    await page.waitForFunction(() => window.__roomLab.room.pc.live);
    await sleep(400);
    console.log('pc view, settled:', await framesPerSecond(), 'frames/s');
    console.log('stats at pc:', JSON.stringify(await page.evaluate(() => window.__roomLab.room.stats)));
    await page.evaluate(() => window.__roomLab.room.showRoom());
    await sleep(1600);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sleep(200);
    console.log('room view, reduced motion:', await framesPerSecond(), 'frames/s');
    await page.close();
  },
  async 'reduced-motion'() {
    const page = await openLab({ width: 1440, height: 900 }, '&autopower=0');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await page.clock.pauseAt(Date.now() + 1000);
    await page.evaluate(() => {
      window.__roomLab.surface.showFrame(30);
      void window.__roomLab.room.powerOn();
    });
    await page.clock.runFor(80);
    await shot(page, 'reduced-power-on-mid');
    await page.clock.runFor(300);
    await page.evaluate(() => window.__roomLab.room.showRoom());
    await page.clock.runFor(120);
    await shot(page, 'reduced-cut-mid');
    await page.clock.runFor(400);
    await shot(page, 'reduced-room');
    console.log('reduced motion, view:', await page.evaluate(() => window.__roomLab.room.view));
    await page.close();
  },
  async 'room-off'() {
    const page = await openLab({ width: 1440, height: 900 }, '&autopower=0');
    await page.evaluate(() => window.__roomLab.room.showRoom());
    await sleep(1600);
    await shot(page, 'room-off');
    await page.close();
  },
  async 'radio-desktop'() {
    const page = await radioLab({ width: 1440, height: 900 });
    await atRadio(page);
    await pickDisc(page, 1);
    await hoverDisc(page, 3);
    await shot(page, 'radio-desktop');
    console.log('radio-desktop:', JSON.stringify(await radioState(page)));
    await page.close();
  },
  async 'radio-wide'() {
    const page = await radioLab({ width: 3440, height: 1440, dpr: 1 });
    await atRadio(page);
    await pickDisc(page, 1);
    await hoverDisc(page, 3);
    await shot(page, 'radio-wide');
    console.log('radio-wide:', JSON.stringify(await radioState(page)));
    await page.close();
  },
  async 'radio-phone'() {
    const page = await radioLab({ width: 390, height: 844, dpr: 3 });
    await atRadio(page);
    await pickDisc(page, 1);
    await page.mouse.move(2, 2);
    await sleep(600);
    await shot(page, 'radio-phone');
    console.log('radio-phone:', JSON.stringify(await radioState(page)));
    await page.close();
  },
  async 'radio-arrival'() {
    const page = await radioLab({ width: 1440, height: 900, dpr: 1 }, { clock: true });
    await page.evaluate(() => window.__roomLab.room.showRoom());
    await sleep(1800);
    const times = [0, 200, 400, 600, 760, 840, 1000, 1100, 1300, 1600, 1900, 2200];
    const log = await strip(page, 'radio-arrival', times, () =>
      page.evaluate(() => window.__roomLab.room.focusRadio()),
    );
    console.log('radio-arrival log:', log.join(' | '));
    await page.close();
  },
  async 'radio-insert'() {
    const page = await radioLab({ width: 1440, height: 900, dpr: 1 }, { clock: true });
    await atRadio(page);
    const disc = await page.evaluate(() => window.__roomLab.room.radio.deck?.layout.discs[0]);
    await page.mouse.move(disc.x, disc.y);
    await sleep(800);
    const times = [0, 90, 200, 350, 500, 650, 720, 770, 840, 890, 1100, 1500];
    const log = await strip(page, 'radio-insert', times, async () => {
      await page.mouse.down();
      await page.mouse.up();
    });
    console.log('radio-insert log:', log.slice(-8).join(' | '));
    await page.close();
  },
  async 'radio-swap'() {
    const page = await radioLab({ width: 1440, height: 900, dpr: 1 }, { clock: true });
    await atRadio(page);
    await pickDisc(page, 1, 3000);
    const disc = await page.evaluate(() => window.__roomLab.room.radio.deck?.layout.discs[3]);
    await page.mouse.move(disc.x, disc.y);
    await sleep(800);
    const times = [0, 150, 300, 450, 600, 750, 900, 1050, 1200, 1400, 1700, 2100];
    const log = await strip(page, 'radio-swap', times, async () => {
      await page.mouse.down();
      await page.mouse.up();
    });
    console.log('radio-swap log:', log.slice(-10).join(' | '));
    await page.close();
  },
  async 'radio-leave'() {
    // A pick and then a leave 300 ms later: the insert commits, the shelf packs up and the lid shuts by the landing.
    const page = await radioLab({ width: 1440, height: 900, dpr: 1 }, { clock: true });
    await atRadio(page);
    const disc = await page.evaluate(() => window.__roomLab.room.radio.deck?.layout.discs[0]);
    await page.mouse.move(disc.x, disc.y);
    await sleep(800);
    const times = [0, 300, 400, 500, 600, 700, 800, 900, 1000, 1150, 1300, 1600];
    const log = await strip(page, 'radio-leave', times, async () => {
      await page.mouse.down();
      await page.mouse.up();
      for (let t = 0; t < 300; t += 16) await page.clock.runFor(Math.min(16, 300 - t));
      await page.evaluate(() => window.__roomLab.room.showRoom());
    });
    console.log('radio-leave log:', log.slice(-8).join(' | '));
    console.log('radio-leave:', JSON.stringify(await radioState(page)));
    await page.close();
  },
  async 'radio-leave-timing'() {
    // When the lid is shut (and still) after a leave `offset` ms into a first pick, against the camera's landing.
    for (const offset of [0, 150, 300, 600, 900]) {
      const page = await radioLab({ width: 1440, height: 900, dpr: 1 }, { clock: true });
      await atRadio(page);
      const disc = await page.evaluate(() => window.__roomLab.room.radio.deck?.layout.discs[0]);
      await page.mouse.move(disc.x, disc.y);
      await sleep(400);
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
      for (let t = 0; t < 600; t += 16) await page.clock.runFor(16);
      await page.mouse.down();
      await page.mouse.up();
      for (let t = 0; t < offset; t += 16) await page.clock.runFor(Math.min(16, offset - t));
      await page.evaluate(() => window.__roomLab.room.showRoom());
      let shut = null;
      let settled = null;
      let previous = Number.NaN;
      for (let t = 16; t <= 3000 && (shut === null || settled === null); t += 16) {
        await page.clock.runFor(16);
        const { lid, isSettled } = await page.evaluate(() => ({
          lid: window.__roomLab.room.stats.radioLidDegrees,
          isSettled: window.__roomLab.room.settled,
        }));
        if (shut === null && lid < 0.05 && Math.abs(lid - previous) < 0.01) shut = t;
        if (settled === null && isSettled) settled = t;
        previous = lid;
      }
      console.log(
        `radio-leave-timing: leave +${offset} ms into a pick -> lid shut at leave+${shut} ms, room settled at leave+${settled} ms`,
      );
      await page.close();
    }
  },
  async 'radio-press'() {
    const page = await radioLab({ width: 1440, height: 900, dpr: 2 }, { clock: true });
    await atRadio(page);
    const key = await page.evaluate(() => window.__roomLab.room.radio.deck?.layout.keys['play-pause']);
    const size = Math.max(key.width, key.height) * 2.4;
    const clip = {
      x: Math.round(key.left + key.width / 2 - size / 2),
      y: Math.round(key.top + key.height / 2 - size / 2),
      width: Math.round(size),
      height: Math.round(size),
    };
    const times = [0, 25, 50, 80, 110, 140, 180, 260];
    const log = await strip(
      page,
      'radio-press',
      times,
      () => page.evaluate(() => window.__roomLab.radio.press('play-pause')),
      {
        clip,
        scale: 2,
      },
    );
    console.log('radio-press log:', log.slice(-4).join(' | '));
    await page.close();
  },
  async 'radio-perf'() {
    const gl = process.env.ROOM_SHOTS_GL === 'swiftshader' ? 'swiftshader' : 'metal';
    const page = await radioLab({ width: 1440, height: 900, dpr: 2 });
    await radioPerf(page, gl);
    if (gl === 'metal') {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
      await radioPerf(page, 'metal 6×');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    }
    await page.close();
  },
  async 'posters-perf'() {
    const gl = process.env.ROOM_SHOTS_GL === 'swiftshader' ? 'swiftshader' : 'metal';
    for (const [viewport, aspect] of [
      [{ width: 1440, height: 900, dpr: 2 }, '16:10'],
      [{ width: 390, height: 844, dpr: 3 }, '9:19.5'],
    ]) {
      for (const query of ['&posters=0', '']) {
        for (const rateTimes of gl === 'metal' ? [1, 6] : [1]) {
          const page = await openLab(viewport, query);
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: rateTimes });
          await postersPerf(page, `${gl} ${rateTimes}× ${aspect}${query ? ' posters=0' : ''}`);
          await page.close();
        }
      }
    }
  },
  async 'posters-views'() {
    // What the walls cost at rest in each view, against ?posters=0: draw calls, programs and the room view's idle rate.
    const restRate = (page) =>
      page.evaluate(async () => {
        const { room } = window.__roomLab;
        const start = room.stats.framesRendered;
        await new Promise((r) => setTimeout(r, 2000));
        return (room.stats.framesRendered - start) / 2;
      });
    const settled = (page) => page.waitForFunction(() => window.__roomLab.room.settled);
    const calls = (page) => page.evaluate(() => window.__roomLab.room.stats.drawCalls);
    for (const [viewport, aspect] of [
      [{ width: 1440, height: 900, dpr: 2 }, '16:10'],
      [{ width: 390, height: 844, dpr: 3 }, '9:19.5'],
    ]) {
      for (const query of ['&posters=0', '']) {
        const label = `${aspect}${query ? ' posters=0' : ''}`;
        const page = await radioLab(viewport, { query });
        await page.evaluate(() => window.__roomLab.room.showRoom());
        await page.evaluate(() => window.__roomLab.room.postersReady);
        await settled(page);
        await sleep(1500);
        const room = { calls: await calls(page), idle: await restRate(page) };
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await sleep(500);
        const reduced = await restRate(page);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => window.__roomLab.room.focusPc());
        await settled(page);
        await sleep(800);
        const pc = await calls(page);
        await page.evaluate(() => window.__roomLab.room.focusRadio());
        await page.waitForFunction(() => window.__roomLab.room.radio.deck?.live);
        await sleep(1800);
        const radio = await calls(page);
        await page.evaluate(() => window.__roomLab.room.focusTv());
        await settled(page);
        await sleep(800);
        const tv = await calls(page);
        const { programs, posters, postersTexturePixels } = await page.evaluate(() => window.__roomLab.room.stats);
        console.log(
          `posters-views ${label}: draw calls room ${room.calls} pc ${pc} radio ${radio} tv ${tv}; room at rest ` +
            `${room.idle} frames/s (reduced motion ${reduced}); programs ${programs}; posters ${posters} ` +
            `${postersTexturePixels} px`,
        );
        await page.close();
      }
    }
  },
  async 'posters-tour'() {
    // The decorated walls from every view the camera visits, on a laptop and on a small phone.
    for (const viewport of [
      { width: 1440, height: 900, dpr: 2 },
      { width: 375, height: 667, dpr: 2 },
    ]) {
      const size = `${viewport.width}x${viewport.height}`;
      const page = await radioLab(viewport, { query: '&mockpc=1' });
      const settled = () => page.waitForFunction(() => window.__roomLab.room.settled);
      await page.evaluate(() => window.__roomLab.room.showRoom());
      await page.evaluate(() => window.__roomLab.room.postersReady);
      await settled();
      await sleep(1500);
      await shot(page, `posters-room-${size}`);
      await atComputer(page);
      await shot(page, `posters-pc-${size}`);
      await atRadio(page);
      await shot(page, `posters-radio-${size}`);
      await page.evaluate(() => window.__roomLab.room.focusTv());
      await settled();
      await sleep(800);
      await shot(page, `posters-tv-${size}`);
      console.log(
        `posters-tour ${size}:`,
        JSON.stringify(await page.evaluate(() => window.__roomLab.room.stats.posters)),
      );
      await page.close();
    }
  },
  async 'posters-detail'() {
    // The densest cluster and a taped corner, close: the room view at 1440×900 cropped at 2× the device pixels.
    const page = await openLab({ width: 1440, height: 900, dpr: 2 });
    await page.waitForFunction(() => !window.__roomLab.surface.paused);
    await page.evaluate(() => window.__roomLab.room.showRoom());
    await page.evaluate(() => window.__roomLab.room.postersReady);
    await sleep(1800);
    for (const [name, clip] of Object.entries(POSTERS_DETAIL_CLIPS)) {
      const path = join(outDir, `posters-detail-${name}.png`);
      await page.screenshot({ path, clip });
      console.log(`wrote ${path}`);
    }
    await page.close();
  },
  async 'room-phone'() {
    const page = await openLab({ width: 390, height: 844, dpr: 3 });
    await page.waitForFunction(() => !window.__roomLab.surface.paused);
    await page.evaluate(() => window.__roomLab.room.showRoom());
    await sleep(1600);
    await shot(page, 'room-phone');
    await page.close();
  },
};

try {
  for (const [name, run] of Object.entries(scenarios)) {
    if (only.length && !only.includes(name)) continue;
    await run();
  }
} finally {
  await browser.close();
  await server.close();
}
