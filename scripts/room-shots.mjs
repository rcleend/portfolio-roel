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

async function sectionShot(section, viewport, name) {
  const page = await openLab(viewport, '&autopower=0');
  await poweredStill(page);
  await page.evaluate((target) => window.__roomLab.room.focusSection(target), section);
  await sleep(1600);
  await shot(page, name);
  await page.close();
}

const scenarios = {
  async 'desk-desktop'() {
    await sectionShot('desk', { width: 1440, height: 900 }, 'desk-desktop');
  },
  async 'drawer-desktop'() {
    await sectionShot('drawer', { width: 1440, height: 900 }, 'drawer-desktop');
  },
  async 'desk-phone'() {
    await sectionShot('desk', { width: 390, height: 844, dpr: 3 }, 'desk-phone');
  },
  async 'drawer-phone'() {
    await sectionShot('drawer', { width: 390, height: 844, dpr: 3 }, 'drawer-phone');
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
    const page = await openLab({ width: 1440, height: 900 });
    await page.waitForFunction(() => !window.__roomLab.surface.paused);
    const framesPerSecond = () =>
      page.evaluate(async () => {
        const { room } = window.__roomLab;
        const start = room.stats.framesRendered;
        await new Promise((r) => setTimeout(r, 1000));
        return room.stats.framesRendered - start;
      });
    console.log('tv view, game running:', await framesPerSecond(), 'frames/s');
    await page.evaluate(() => window.__roomLab.surface.pause());
    await sleep(200);
    console.log('tv view, game paused:', await framesPerSecond(), 'frames/s');
    await page.evaluate(() => window.__roomLab.room.showRoom());
    await sleep(1600);
    console.log('room view (lava visible):', await framesPerSecond(), 'frames/s');
    console.log('stats:', JSON.stringify(await page.evaluate(() => window.__roomLab.room.stats)));
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
