/**
 * pnpm shot — deterministic screenshots of the game through the dev harness.
 *
 *   pnpm shot --scene title --frames 150 --out .shots/title.png    native canvas, ×3 nearest-neighbour
 *   pnpm shot --scene boot --frames 0:480:30 --out .shots/boot.png  contact sheet, one cell every 30 frames
 *   pnpm shot --host flat --page --out .shots/flat.png              full-page screenshot
 *
 * Options: --scene <id> --params <json> --frames <n | a:b:step> --scale <n> --cols <n>
 *          --seed <n> --host <flat|room> --page --viewport <WxH> --out <path> --url <base>
 *
 * Reuses a dev server already serving this app on :5173 (or --url); otherwise
 * starts Vite on a free port for the duration of the run.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
// Brings the `window.__arcade` typings into scope for the in-page callbacks below.
import type {} from '../src/app/harness/harness';

const APP_MARKER = 'reo-leo-arcade';
const READY_TIMEOUT_MS = 20_000;

interface FrameRange {
  readonly start: number;
  readonly end: number;
  readonly step: number;
}

const { values } = parseArgs({
  options: {
    scene: { type: 'string' },
    params: { type: 'string' },
    frames: { type: 'string' },
    scale: { type: 'string', default: '3' },
    cols: { type: 'string' },
    seed: { type: 'string', default: '1' },
    host: { type: 'string', default: 'flat' },
    page: { type: 'boolean', default: false },
    viewport: { type: 'string', default: '1280x900' },
    out: { type: 'string' },
    url: { type: 'string' },
  },
  strict: true,
});

function fail(message: string): never {
  console.error(`shot: ${message}`);
  process.exit(1);
}

function positiveInt(name: string, raw: string | undefined, fallback?: number): number {
  if (raw === undefined && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) fail(`--${name} must be a non-negative integer, got ${raw}`);
  return value;
}

function parseFrames(raw: string | undefined): number | FrameRange | null {
  if (raw === undefined) return null;
  const parts = raw.split(':');
  if (parts.length === 1) return positiveInt('frames', raw);
  if (parts.length !== 3) fail(`--frames must be N or A:B:STEP, got ${raw}`);
  const [start, end, step] = parts.map((part) => positiveInt('frames', part)) as [number, number, number];
  if (step === 0 || end < start) fail(`--frames range must have STEP > 0 and B >= A, got ${raw}`);
  return { start, end, step };
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address ? resolvePort(address.port) : reject(new Error('no port')),
      );
    });
  });
}

async function servesApp(base: string): Promise<boolean> {
  try {
    const response = await fetch(base, { signal: AbortSignal.timeout(800) });
    return response.ok && (await response.text()).includes(APP_MARKER);
  } catch {
    return false;
  }
}

async function startServer(): Promise<{ base: string; server: ViteDevServer | null }> {
  if (values.url) {
    if (!(await servesApp(values.url))) fail(`--url ${values.url} does not serve this app`);
    return { base: values.url.replace(/\/$/, ''), server: null };
  }
  if (await servesApp('http://localhost:5173/')) return { base: 'http://localhost:5173', server: null };
  const port = await freePort();
  const server = await createServer({
    configFile: resolve(import.meta.dirname, '../vite.config.ts'),
    logLevel: 'warn',
    server: { port, strictPort: true, hmr: false },
  });
  await server.listen();
  return { base: `http://localhost:${port}`, server };
}

function gameUrl(base: string, frames: number | null): string {
  // `debug` enables the harness in production builds too, so --url can point at `pnpm preview`.
  const query = new URLSearchParams({ debug: '', host: values.host ?? 'flat', seed: values.seed ?? '1' });
  if (values.scene) query.set('scene', values.scene);
  if (values.params) query.set('params', values.params);
  if (frames !== null) query.set('frames', String(frames));
  return `${base}/?${query}`;
}

/** Copies the native canvas into a nearest-neighbour upscale and returns PNG bytes. */
async function captureCanvas(page: Page, scale: number): Promise<Buffer> {
  const dataUrl = await page.evaluate((factor) => {
    const source = window.__arcade?.game.canvas;
    if (!source) throw new Error('window.__arcade is not available — is the harness enabled?');
    const out = document.createElement('canvas');
    out.width = source.width * factor;
    out.height = source.height * factor;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  }, scale);
  return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
}

/** Steps through a frame range and lays the frames out as a labelled grid, composed in the page. */
async function captureSheet(page: Page, range: FrameRange, scale: number, columns: number): Promise<Buffer> {
  const dataUrl = await page.evaluate(
    ({ range, scale, columns }) => {
      const arcade = window.__arcade;
      if (!arcade) throw new Error('window.__arcade is not available — is the harness enabled?');
      const source = arcade.game.canvas;
      const count = Math.floor((range.end - range.start) / range.step) + 1;
      const rows = Math.ceil(count / columns);
      const label = 16;
      const gap = 4;
      const cellW = source.width * scale;
      const cellH = source.height * scale + label;
      const sheet = document.createElement('canvas');
      sheet.width = Math.min(count, columns) * (cellW + gap) + gap;
      sheet.height = rows * (cellH + gap) + gap;
      const ctx = sheet.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.fillStyle = '#16141f';
      ctx.fillRect(0, 0, sheet.width, sheet.height);
      for (let i = 0; i < count; i++) {
        if (i > 0) arcade.step(range.step);
        const frame = range.start + i * range.step;
        const x = gap + (i % columns) * (cellW + gap);
        const y = gap + Math.floor(i / columns) * (cellH + gap);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(source, x, y + label, cellW, cellH - label);
        ctx.fillStyle = '#e8e4ff';
        ctx.font = 'bold 12px ui-monospace, monospace';
        ctx.fillText(`f${frame}  ${(frame / 60).toFixed(2)}s`, x + 2, y + 12);
      }
      return sheet.toDataURL('image/png');
    },
    { range, scale, columns },
  );
  return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
}

async function main(): Promise<void> {
  const frames = parseFrames(values.frames);
  const scale = Math.max(1, positiveInt('scale', values.scale, 3));
  const [viewportW, viewportH] = (values.viewport ?? '').split('x').map(Number);
  if (!viewportW || !viewportH) fail(`--viewport must be WxH, got ${values.viewport}`);
  const framesLabel =
    frames === null ? 'live' : typeof frames === 'number' ? `f${frames}` : `f${frames.start}-${frames.end}`;
  const out = resolve(values.out ?? `.shots/${values.scene ?? values.host ?? 'game'}-${framesLabel}.png`);

  const { base, server } = await startServer();
  const browser = await chromium.launch();
  const errors: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: viewportW, height: viewportH } });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const startFrame = frames === null ? null : typeof frames === 'number' ? frames : frames.start;
    await page.goto(gameUrl(base, startFrame));
    await page.waitForFunction(() => window.__arcadeReady === true, null, { timeout: READY_TIMEOUT_MS });
    if (errors.length > 0) fail(`page errors:\n  ${errors.join('\n  ')}`);

    let png: Buffer;
    if (values.page) png = await page.screenshot({ fullPage: true });
    else if (frames !== null && typeof frames !== 'number') {
      const count = Math.floor((frames.end - frames.start) / frames.step) + 1;
      png = await captureSheet(page, frames, scale, positiveInt('cols', values.cols, Math.min(4, count)));
    } else png = await captureCanvas(page, scale);

    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, png);
    console.log(out);
  } finally {
    await browser.close();
    await server?.close();
  }
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
