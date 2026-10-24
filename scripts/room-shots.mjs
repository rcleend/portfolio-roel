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

async function openLab(viewport, query = '') {
  const page = await browser.newPage({ viewport, deviceScaleFactor: viewport.dpr ?? 2 });
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
