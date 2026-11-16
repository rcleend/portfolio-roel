#!/usr/bin/env node
// Development-only: close-range pictures of the room's props, the shipped models or the generated ones, from the same
// fixed cameras (docs/ROOM.md › The generated room › Close inspection). A prop is judged at arm's length, from several
// sides, before and after its generator changes.
//
//   node scripts/gen-closeups.mjs --label <name> [--mode shipped|generated] [--tier high|medium|low]
//                                 [--only asset,asset/angle] [--out dir] [--full] [--studio] [--mood rose|original]
//
// Writes <out>/<label>/<asset>-<angle>.jpg. `--studio` lights the generated props with a plain key and fill instead of
// the room's bake (their form and albedo, whatever the rig says). `--full` keeps the drawing buffer's own pixels (2176 × 1360) instead of
// 1600 wide. `node scripts/gen-closeups.mjs --sheet a,b,c [--only ...]` lays the pictures of labels a, b and c side by
// side into <out>/sheets/<asset>-<angle>.jpg.
// Its own vite server on a free port, without hot reload; headless Chromium on the GPU (ANGLE/Metal).
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
const mode = option('mode', 'generated');
const tier = option('tier', 'high');
const mood = option('mood', 'rose');
const label = option('label', mode);
const only = option('only', '')?.split(',').filter(Boolean) ?? [];
const full = args.includes('--full');
/** The generated props under a plain key and fill instead of the room's bake: their form and albedo, whatever the rig. */
const studio = args.includes('--studio');
const out = resolve(option('out', '.shots/closeups'));
const sheet = option('sheet', '');

/** 2176 × 1360 device pixels: under the top tier's 3 MP, so the picture is drawn at the page's own pixel ratio. */
const VIEWPORT = { width: 1088, height: 680, dpr: 2 };

/** Each prop's cameras: where the eye stands, what it looks at, and the lens (vertical degrees). */
export const CLOSEUPS = {
  monitor: {
    front: { position: [-1.34, 1.07, -0.75], target: [-1.34, 1.04, -1.66], fov: 36 },
    'three-quarter': { position: [-0.62, 1.22, -1.0], target: [-1.34, 1.02, -1.85], fov: 32 },
    'three-quarter-left': { position: [-2.0, 1.3, -1.02], target: [-1.34, 1.02, -1.85], fov: 32 },
    top: { position: [-1.34, 2.05, -1.55], target: [-1.34, 1.0, -1.87], fov: 32 },
    low: { position: [-0.98, 0.83, -1.12], target: [-1.34, 0.98, -1.8], fov: 40 },
    side: { position: [-0.55, 1.12, -1.95], target: [-1.34, 1.04, -1.88], fov: 40 },
    chin: { position: [-1.3, 0.97, -1.36], target: [-1.36, 0.875, -1.66], fov: 34 },
    foot: { position: [-1.05, 0.9, -1.45], target: [-1.34, 0.82, -1.8], fov: 34 },
  },
  tower: {
    front: { position: [-1.95, 0.36, -0.95], target: [-1.95, 0.31, -1.74], fov: 42 },
    'three-quarter': { position: [-1.58, 0.42, -1.3], target: [-1.95, 0.3, -1.78], fov: 58 },
    panel: { position: [-1.9, 0.44, -1.33], target: [-1.95, 0.4, -1.74], fov: 34 },
    low: { position: [-1.7, 0.06, -1.2], target: [-1.95, 0.2, -1.76], fov: 50 },
  },
  keyboard: {
    front: { position: [-1.345, 1.06, -1.05], target: [-1.345, 0.8, -1.5], fov: 32 },
    'three-quarter': { position: [-0.93, 0.98, -1.18], target: [-1.345, 0.8, -1.5], fov: 32 },
    top: { position: [-1.345, 1.42, -1.47], target: [-1.345, 0.79, -1.505], fov: 28 },
    low: { position: [-0.93, 0.822, -1.27], target: [-1.345, 0.8, -1.5], fov: 30 },
    macro: { position: [-1.2, 0.91, -1.31], target: [-1.3, 0.805, -1.48], fov: 34 },
    back: { position: [-1.0, 0.9, -1.8], target: [-1.345, 0.8, -1.52], fov: 34 },
  },
  mouse: {
    'three-quarter': { position: [-0.76, 0.93, -1.37], target: [-0.91, 0.805, -1.575], fov: 30 },
    top: { position: [-0.91, 1.12, -1.545], target: [-0.91, 0.8, -1.575], fov: 30 },
    low: { position: [-0.72, 0.812, -1.44], target: [-0.91, 0.806, -1.575], fov: 30 },
    back: { position: [-0.93, 0.9, -1.33], target: [-0.91, 0.805, -1.575], fov: 30 },
    front: { position: [-0.82, 0.88, -1.8], target: [-0.91, 0.805, -1.575], fov: 30 },
  },
  chair: {
    front: { position: [-1.2, 0.85, 0.35], target: [-1.3, 0.58, -0.95], fov: 44 },
    'three-quarter': { position: [-0.25, 1.05, -0.2], target: [-1.28, 0.55, -0.98], fov: 40 },
    'three-quarter-left': { position: [-2.3, 1.0, -0.1], target: [-1.28, 0.55, -0.98], fov: 40 },
    seat: { position: [-1.72, 1.2, -1.72], target: [-1.3, 0.6, -0.98], fov: 52 },
    top: { position: [-1.28, 2.1, -0.85], target: [-1.28, 0.5, -0.99], fov: 34 },
    low: { position: [-0.72, 0.1, -0.42], target: [-1.28, 0.12, -0.99], fov: 40 },
    casters: { position: [-0.98, 0.22, -0.62], target: [-1.2, 0.06, -0.86], fov: 40 },
    underside: { position: [-0.85, 0.3, -0.6], target: [-1.28, 0.42, -0.99], fov: 46 },
  },
  lamp: {
    front: { position: [-2.05, 1.05, -1.2], target: [-2.06, 1.01, -2.03], fov: 36 },
    'three-quarter': { position: [-1.5, 1.25, -1.45], target: [-2.05, 1.01, -2.03], fov: 36 },
    low: { position: [-1.72, 0.84, -1.62], target: [-1.97, 1.08, -2.03], fov: 44 },
    top: { position: [-2.05, 1.9, -1.8], target: [-2.05, 1.0, -2.03], fov: 30 },
    head: { position: [-1.72, 1.2, -1.74], target: [-1.96, 1.15, -2.03], fov: 32 },
    foot: { position: [-1.85, 0.93, -1.72], target: [-2.09, 0.83, -2.03], fov: 32 },
  },
  desk: {
    'top-right': { position: [-0.7, 1.7, -1.55], target: [-0.7, 0.79, -1.85], fov: 42 },
    'top-left': { position: [-1.98, 1.45, -1.4], target: [-1.98, 0.79, -1.68], fov: 40 },
    front: { position: [-1.3, 1.0, 0.25], target: [-1.3, 0.55, -1.6], fov: 55 },
    pulls: { position: [-0.3, 0.72, -0.8], target: [-0.73, 0.5, -1.39], fov: 40 },
    cup: { position: [-0.75, 1.05, -1.75], target: [-0.5, 0.88, -2.15], fov: 34 },
  },
  others: {
    dresser: { position: [0.2, 1.35, -0.75], target: [1.05, 0.85, -2.05], fov: 48 },
    guitar: { position: [1.35, 0.95, -0.95], target: [2.02, 0.62, -1.8], fov: 42 },
    'tv-corner': { position: [1.15, 0.95, 0.55], target: [2.4, 0.62, -0.45], fov: 44 },
    console: { position: [1.45, 0.38, 0.45], target: [1.9, 0.05, -0.1], fov: 40 },
    window: { position: [-1.25, 1.55, -0.95], target: [-1.3, 1.75, -2.4], fov: 52 },
    basket: { position: [-1.95, 0.55, -0.75], target: [-2.45, 0.16, -1.45], fov: 42 },
    door: { position: [-0.5, 1.4, 0.4], target: [-0.8, 1.1, 2.4], fov: 55 },
    sheets: { position: [-1.15, 1.9, 0.55], target: [-2.15, 0, -0.65], fov: 52 },
  },
  rug: {
    corner: { position: [0.95, 0.5, 0.2], target: [1.4, 0.04, -0.3], fov: 40 },
    'corner-low': { position: [0.9, 0.1, -0.78], target: [1.42, 0.045, -0.33], fov: 36 },
    'corner-macro': { position: [1.25, 0.2, -0.05], target: [1.42, 0.04, -0.32], fov: 34 },
    edge: { position: [-0.45, 0.14, -1.45], target: [-0.3, 0.02, -0.9], fov: 40 },
    top: { position: [0.2, 1.3, 0.5], target: [0.2, 0.03, 0.45], fov: 30 },
    grazing: { position: [0.2, 0.22, 1.5], target: [0.1, 0.03, 0.4], fov: 30 },
    macro: { position: [0.32, 0.3, 0.62], target: [0.2, 0.035, 0.42], fov: 26 },
    far: { position: [-1.5, 1.5, 2.0], target: [0.3, 0.0, 0.3], fov: 46 },
  },
  plant: {
    front: { position: [1.58, 0.68, 0.117], target: [2.256, 0.6, 0.117], fov: 27 },
    'three-quarter': { position: [1.75, 0.86, 0.62], target: [2.256, 0.59, 0.117], fov: 28 },
    top: { position: [2.18, 1.3, 0.13], target: [2.256, 0.55, 0.117], fov: 26 },
    low: { position: [1.8, 0.5, -0.22], target: [2.256, 0.58, 0.117], fov: 28 },
    macro: { position: [1.95, 0.72, 0.3], target: [2.25, 0.63, 0.12], fov: 28 },
    pot: { position: [1.98, 0.6, 0.28], target: [2.256, 0.53, 0.117], fov: 26 },
  },
};

const names = Object.entries(CLOSEUPS).flatMap(([asset, angles]) =>
  Object.keys(angles).map((angle) => ({ asset, angle, pose: angles[angle] })),
);
const wanted = ({ asset, angle }) => only.length === 0 || only.includes(asset) || only.includes(`${asset}/${angle}`);

if (sheet) {
  // Side by side: one column a label, the label burnt in above it.
  const labels = sheet.split(',');
  const width = Number(option('width', 960));
  await mkdir(join(out, 'sheets'), { recursive: true });
  for (const each of names.filter(wanted)) {
    const file = `${each.asset}-${each.angle}.jpg`;
    const present = labels.filter((name) => existsSync(join(out, name, file)));
    if (present.length < 2) continue;
    const height = Math.round((width * VIEWPORT.height) / VIEWPORT.width);
    const tiles = await Promise.all(
      present.map(async (name, i) => ({
        input: await sharp(join(out, name, file))
          .resize({ width, height })
          .toBuffer(),
        top: 28,
        left: i * (width + 6),
      })),
    );
    const captions = present.map((name, i) => ({
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28"><rect width="100%" height="100%" fill="#111"/><text x="10" y="20" font-family="Helvetica" font-size="17" fill="#eee">${name} — ${each.asset} / ${each.angle}</text></svg>`,
      ),
      top: 0,
      left: i * (width + 6),
    }));
    await sharp({
      create: {
        width: present.length * width + (present.length - 1) * 6,
        height: height + 28,
        channels: 3,
        background: '#ff00ff',
      },
    })
      .composite([...tiles, ...captions])
      .jpeg({ quality: 88 })
      .toFile(join(out, 'sheets', file));
    console.log(`wrote ${join(out, 'sheets', file)}`);
  }
  process.exit(0);
}

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

/** Waits for frames drawn after now, so what is on the canvas is the camera as it was just set. */
async function frames(page, count = 4) {
  const start = await page.evaluate(() => window.__roomLab.room.stats.framesRendered);
  for (let tries = 0; tries < 40; tries++) {
    await sleep(100);
    if ((await page.evaluate(() => window.__roomLab.room.stats.framesRendered)) >= start + count) return;
    // The shipped room draws on demand: the paused game's frame, shown again, asks for one without moving anything.
    await page.evaluate(() => window.__roomLab.surface.showFrame(120));
  }
}

try {
  const page = await browser.newPage({
    viewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    deviceScaleFactor: VIEWPORT.dpr,
  });
  page.on('pageerror', (error) => console.log(`[page error] ${error.message}`));
  page.on('console', (msg) => msg.type() === 'error' && console.log(`[page error] ${msg.text()}`));
  const query = `clean&mood=${mood}&quality=${tier}&autopower=0&mockpc=1&mockradio=1${mode === 'generated' ? '&room=generated' : ''}`;
  await page.goto(`${base}/room-lab.html?${query}`);
  await page.waitForFunction(() => window.__roomLab !== undefined);
  await page.evaluate(() => window.__roomLab.room.ready);
  // Every camera three.js updates: while a pose is held, each stands where the pose says.
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => /deps\/three\.js/.test(name));
    const THREE = await import(/* @vite-ignore */ url);
    const proto = THREE.PerspectiveCamera.prototype;
    const original = proto.updateMatrixWorld;
    window.__pose = null;
    proto.updateMatrixWorld = function (...rest) {
      const pose = window.__pose;
      // The stage's own camera (and the finish's copies of it), never a bake's or a shadow's.
      if (pose && this.near < 0.05 && this.far > 20) {
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
  await page.evaluate(() => window.__roomLab.room.setAir({ haze: 0.7, dust: 0.3 }));
  await page.evaluate(() => window.__roomLab.room.postersReady);
  if (mode === 'generated') {
    const ok = await page.evaluate(() => window.__roomLab.room.generatedReady ?? true);
    const stats = await page.evaluate(() => window.__roomLab.room.stats.generatedStats);
    console.log(`generated ${ok}:`, JSON.stringify(stats));
  }
  if (studio && mode === 'generated')
    await page.evaluate(() => {
      const room = globalThis.__generatedRoom;
      const curve = (v) => {
        const c = (v / (v + 0.6)) * 1.25;
        return c + (c * c * (3 - 2 * c) - c) * 0.35;
      };
      for (const [name, mesh] of Object.entries(room.vertexLit)) {
        const data = room.gen.meshes[name];
        const colors = mesh.geometry.getAttribute('color');
        for (let i = 0; i < data.positions.length; i += 3) {
          const [nx, ny, nz] = [data.normals[i], data.normals[i + 1], data.normals[i + 2]];
          const key = Math.max(0, nx * 0.35 + ny * 0.62 + nz * 0.7);
          const fill = Math.max(0, -nx * 0.6 + ny * 0.3 + nz * 0.4) * 0.35;
          const light = 0.22 * Math.min(1, data.shade[i / 3]) + 1.25 * key + fill + 0.08 * Math.max(0, -ny);
          for (let c = 0; c < 3; c++) colors.array[i + c] = curve(data.albedo[i + c] * light);
        }
        colors.needsUpdate = true;
      }
    });
  await page.evaluate(async () => {
    const { room, surface } = window.__roomLab;
    await room.powerOn();
    surface.pause();
    surface.showFrame(120);
  });
  await page.waitForFunction(() => !window.__roomLab.room.stats.backgroundPending, null, { timeout: 30_000 });
  await page.evaluate(() => window.__roomLab.room.showRoom());
  await page.waitForFunction(() => window.__roomLab.room.view === 'room' && window.__roomLab.room.settled, null, {
    timeout: 30_000,
  });
  await sleep(1200);
  await mkdir(join(out, label), { recursive: true });
  for (const each of names.filter(wanted)) {
    await page.evaluate((pose) => {
      window.__pose = pose;
    }, each.pose);
    await frames(page, 5);
    const png = await page.screenshot();
    const path = join(out, label, `${each.asset}-${each.angle}.jpg`);
    const image = full ? sharp(png) : sharp(png).resize({ width: 1600 });
    await image.jpeg({ quality: 90, mozjpeg: true }).toFile(path);
    console.log(`wrote ${path}`);
  }
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
