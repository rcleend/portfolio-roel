#!/usr/bin/env node
// Development-only: the room's reference pictures, from fixed cameras, of the shipped room or the generated one
// (docs/ROOM.md › The generated room). The shipped set in docs/gen/reference/ is the record of the look the generated
// room is held to.
//
//   node scripts/gen-shots.mjs [--mode shipped|generated] [--tier high|medium|low] [--viewport desktop|phone]
//                              [--out dir] [--only name,name] [--compare dir] [--format jpg|png] [--mood rose|original]
//
// Writes <out>/<viewport>-<tier>/<name>.jpg: the four views (tv, room, pc, radio) and true-zoom crops (the view's own
// camera with a view offset, so a crop is drawn at full resolution, not enlarged) of each corner of the room.
// `--compare dir` also writes cmp-<name>.jpg beside each picture: that set's on the left, this run's on the right.
// Its own vite server on a free port, without hot reload (other checkouts' edits do not reload the page mid-run);
// headless Chromium on the GPU (ANGLE/Metal). CHROMIUM_PATH picks a browser binary.
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
const mode = option('mode', 'shipped');
const tier = option('tier', 'high');
const viewportName = option('viewport', 'desktop');
const only = option('only', '')?.split(',').filter(Boolean) ?? [];
const format = option('format', 'jpg');
/** The app's finish; `original` is the bake as it is, without one. */
const mood = option('mood', 'rose');
const compare = option('compare', '');
const outDir = join(resolve(option('out', mode === 'shipped' ? 'docs/gen/reference' : '.shots/gen/final')), `${viewportName}-${tier}`);
const compareDir = compare ? join(resolve(compare), `${viewportName}-${tier}`) : '';

/** CSS size, device pixels a CSS pixel, and how wide a view's and a crop's file is. */
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, dpr: 2, viewWidth: 1920, cropWidth: 1280 },
  phone: { width: 390, height: 844, dpr: 3, viewWidth: 585, cropWidth: 585 },
};
const viewport = VIEWPORTS[viewportName];
if (!viewport) throw new Error(`--viewport is desktop or phone, not ${viewportName}`);

/**
 * The crops: a box of the room (metres, min and max corner) that the named view's camera is zoomed onto, or a camera
 * of its own (`pose`) for what no view shows.
 */
const CROPS = {
  'desk-top': { view: 'room', box: [[-2.3, 0.72, -2.35], [-0.35, 1.4, -1.35]] },
  chair: { view: 'room', box: [[-1.7, 0, -1.35], [-0.85, 1.12, -0.55]] },
  basket: { view: 'room', box: [[-2.75, 0, -1.75], [-1.8, 0.42, -0.45]] },
  window: { view: 'room', box: [[-2.35, 0.95, -2.45], [-0.25, 2.7, -2.2]] },
  door: { pose: { position: [0.9, 1.5, -1.3], target: [-0.8, 1.1, 2.4], fov: 50 } },
  rug: { view: 'room', box: [[-1.5, 0, -0.95], [1.6, 0.05, 1.2]] },
  floor: { view: 'room', box: [[-2.8, 0, -1.4], [2.0, 0.02, 0.2]] },
  dresser: { view: 'room', box: [[0.3, 0, -2.4], [1.4, 1.42, -1.7]] },
  guitar: { view: 'room', box: [[1.4, 0, -2.4], [2.05, 1.5, -1.85]] },
  'lava-lamp': { view: 'room', box: [[0.3, 0.84, -2.2], [0.7, 1.42, -1.85]] },
  console: { view: 'room', box: [[1.55, 0, -0.45], [2.15, 0.12, 0.7]] },
  'tv-cabinet': { view: 'room', box: [[2.0, 0, -1.3], [2.8, 1.2, 1.1]] },
  plant: { view: 'tv', box: [[2.1, 0.48, -0.04], [2.42, 0.72, 0.28]] },
  robot: { view: 'tv', box: [[2.45, 0.48, -1.0], [2.7, 0.8, -0.75]] },
  posters: { view: 'room', box: [[-2.7, 1.25, -2.4], [2.8, 3.2, -1.2]] },
  slope: { pose: { position: [-1.6, 1.3, 1.6], target: [1.9, 2.2, -0.6], fov: 60 } },
  'radio-lid': { view: 'radio', box: [[0.94, 1.04, -2.2], [1.22, 1.28, -2.0]] },
};
const VIEWS = ['tv', 'room', 'pc', 'radio'];
const wanted = (name) => only.length === 0 || only.includes(name);

const cachedChromium = join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(cachedChromium) ? cachedChromium : undefined);

const server = await createServer({
  server: { port: 0, host: '127.0.0.1', hmr: false, watch: null },
  logLevel: 'error',
});
await server.listen();
const address = server.httpServer?.address();
const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 5173}`;
const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function save(page, name, width) {
  const png = await page.screenshot();
  await mkdir(outDir, { recursive: true });
  const path = join(outDir, `${name}.${format}`);
  const image = sharp(png).resize({ width });
  await (format === 'png' ? image.png() : image.jpeg({ quality: 85, mozjpeg: true })).toFile(path);
  console.log(`wrote ${path}`);
  if (!compareDir) return;
  const reference = join(compareDir, `${name}.jpg`);
  if (!existsSync(reference)) return;
  const left = await sharp(reference).resize({ width }).toBuffer();
  const right = await sharp(path).toBuffer();
  const { height = 1 } = await sharp(right).metadata();
  await sharp({ create: { width: width * 2 + 8, height, channels: 3, background: '#ff00ff' } })
    .composite([
      { input: left, top: 0, left: 0 },
      { input: right, top: 0, left: width + 8 },
    ])
    .jpeg({ quality: 88 })
    .toFile(join(resolve(outDir, '..'), `cmp-${viewportName}-${tier}-${name}.jpg`));
}

/** Waits for frames drawn after now, so what is on the canvas is the camera as it was just set. */
async function frames(page, count = 4) {
  const start = await page.evaluate(() => window.__roomLab.room.stats.framesRendered);
  for (let tries = 0; tries < 40; tries++) {
    await sleep(120);
    if ((await page.evaluate(() => window.__roomLab.room.stats.framesRendered)) >= start + count) return;
    // The shipped room draws on demand: the paused game's frame, shown again, asks for one without moving anything.
    await page.evaluate(() => window.__roomLab.surface.showFrame(120));
  }
}

/** Zooms every live camera onto a box of the room (or sets a pose of its own); null lets go. */
async function zoom(page, crop) {
  await frames(page, 2);
  const info = await page.evaluate(
    ({ crop, width, height }) => {
      // The cameras the last frame used (a resting view draws no frames until asked).
      const latest = Math.max(...[...window.__cams].map((cam) => cam.__last));
      const live = [...window.__cams].filter((cam) => latest - cam.__last < 100);
      const held = window.__pose;
      window.__pose = null;
      for (const cam of live) {
        cam.clearViewOffset();
        const rest = held?.rest.get(cam);
        if (!rest) continue;
        cam.position.copy(rest.position);
        cam.quaternion.copy(rest.quaternion);
        cam.fov = rest.fov;
        cam.updateProjectionMatrix();
      }
      if (!crop) return;
      if (crop.pose) {
        const rest = new Map(
          live.map((cam) => [cam, { position: cam.position.clone(), quaternion: cam.quaternion.clone(), fov: cam.fov }]),
        );
        window.__pose = { ...crop.pose, cams: new Set(live), rest };
        return;
      }
      const cam = live[0];
      if (!cam) throw new Error('no live camera');
      cam.updateMatrixWorld(true);
      const view = cam.matrixWorldInverse.elements;
      const projection = cam.projectionMatrix.elements;
      const apply = (m, [x, y, z, w]) => [0, 1, 2, 3].map((i) => m[i] * x + m[4 + i] * y + m[8 + i] * z + m[12 + i] * w);
      let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
      const [lo, hi] = crop.box;
      for (let corner = 0; corner < 8; corner++) {
        const point = [corner & 1 ? hi[0] : lo[0], corner & 2 ? hi[1] : lo[1], corner & 4 ? hi[2] : lo[2], 1];
        const clip = apply(projection, apply(view, point));
        if (clip[3] <= 0) continue;
        const [px, py] = [(clip[0] / clip[3] * 0.5 + 0.5) * width, (0.5 - clip[1] / clip[3] * 0.5) * height];
        [x0, y0, x1, y1] = [Math.min(x0, px), Math.min(y0, py), Math.max(x1, px), Math.max(y1, py)];
      }
      // A margin, then out to the viewport's shape about the box's middle.
      let [w, h] = [(x1 - x0) * 1.12, (y1 - y0) * 1.12];
      if (w / h < width / height) w = (h * width) / height;
      else h = (w * height) / width;
      // Never wider than the view itself: a box too wide for a phone's upright view is seen through its middle.
      if (w > width) [w, h] = [width, height];
      const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
      for (const each of live) each.setViewOffset(width, height, cx - w / 2, cy - h / 2, w, h);
      return { cams: window.__cams.size, live: live.map((c) => [c.position.toArray().map((v) => +v.toFixed(2)), c.fov, c.aspect]), rect: [cx - w / 2, cy - h / 2, w, h], frames: window.__roomLab.room.stats.framesRendered };
    },
    { crop, width: viewport.width, height: viewport.height },
  );
  if (process.env.SHOT_DEBUG) console.log(JSON.stringify(info));
  await frames(page);
  if (process.env.SHOT_DEBUG) console.log('frames', await page.evaluate(() => window.__roomLab.room.stats.framesRendered));
}

const go = {
  async tv(page) {
    await page.evaluate(() => window.__roomLab.room.focusTv());
  },
  async room(page) {
    await page.evaluate(() => window.__roomLab.room.showRoom());
  },
  async pc(page) {
    await page.evaluate(() => window.__roomLab.room.focusPc());
    await page.waitForFunction(() => window.__roomLab.room.pc.live, null, { timeout: 30_000 });
  },
  async radio(page) {
    await page.waitForFunction(() => window.__roomLab.room.stats.radioReady, null, { timeout: 30_000 });
    await page.evaluate(() => window.__roomLab.room.focusRadio());
    await page.waitForFunction(() => window.__roomLab.room.radio.deck?.live, null, { timeout: 30_000 });
  },
};

try {
  const page = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr,
  });
  page.on('pageerror', (error) => console.log(`[page error] ${error.message}`));
  page.on('console', (msg) => msg.type() === 'error' && console.log(`[page error] ${msg.text()}`));
  const query = `clean&mood=${mood}&quality=${tier}&autopower=0&mockpc=1&mockradio=1${mode === 'generated' ? '&room=generated' : ''}`;
  await page.goto(`${base}/room-lab.html?${query}`);
  await page.waitForFunction(() => window.__roomLab !== undefined);
  await page.evaluate(() => window.__roomLab.room.ready);
  // Every camera three.js updates, and when: the ones a frame has just used are the view's.
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => /deps\/three\.js/.test(name));
    const THREE = await import(/* @vite-ignore */ url);
    const proto = THREE.PerspectiveCamera.prototype;
    const original = proto.updateMatrixWorld;
    window.__cams = new Set();
    window.__pose = null;
    proto.updateMatrixWorld = function (...rest) {
      window.__cams.add(this);
      this.__last = performance.now();
      const pose = window.__pose;
      if (pose?.cams.has(this)) {
        this.position.set(...pose.position);
        this.lookAt(...pose.target);
        if (this.fov !== pose.fov) {
          this.fov = pose.fov;
          this.updateProjectionMatrix();
        }
      }
      return original.apply(this, rest);
    };
  });
  // The app's air (app/hosts/useRoom.ts).
  await page.evaluate(() => window.__roomLab.room.setAir({ haze: 0.7, dust: 0.3 }));
  await page.evaluate(() => window.__roomLab.room.postersReady);
  if (mode === 'generated') {
    const ok = await page.evaluate(() => window.__roomLab.room.generatedReady);
    const stats = await page.evaluate(() => window.__roomLab.room.stats.generatedStats);
    console.log(`generated ${ok}:`, JSON.stringify(stats));
  }
  await page.evaluate(async () => {
    const { room, surface } = window.__roomLab;
    await room.powerOn();
    surface.pause();
    surface.showFrame(120);
  });
  await page.waitForFunction(() => !window.__roomLab.room.stats.backgroundPending, null, { timeout: 30_000 });
  for (const view of VIEWS) {
    const crops = Object.entries(CROPS).filter(([name, crop]) => (crop.view ?? 'room') === view && wanted(name));
    if (!wanted(view) && crops.length === 0) continue;
    await go[view](page);
    await page.waitForFunction((v) => window.__roomLab.room.view === v && window.__roomLab.room.settled, view, {
      timeout: 30_000,
    });
    // Past the landing's fades, the radio's lid and its discs' emergence.
    await sleep(view === 'radio' ? 2600 : 1200);
    await frames(page);
    if (wanted(view)) await save(page, view, viewport.viewWidth);
    for (const [name, crop] of crops) {
      await zoom(page, crop);
      await save(page, name, viewport.cropWidth);
    }
    await zoom(page, null);
    // The radio is left through the room, as a visitor leaves it.
    if (view === 'pc' || view === 'radio') {
      await go.room(page);
      await page.waitForFunction(() => window.__roomLab.room.view === 'room' && window.__roomLab.room.settled);
    }
  }
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
