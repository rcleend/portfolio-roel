/**
 * pnpm tsx scripts/level-tour.ts — plays scripted moments of both levels
 * through the dev harness and saves a PNG of each, for visual review.
 *
 *   pnpm tsx scripts/level-tour.ts --out .shots/tour              every moment
 *   pnpm tsx scripts/level-tour.ts --only boss,pause --url http://localhost:5204
 *
 * Input is driven with `window.__arcade.game.input.virtual`, so several
 * actions can be held at once (run + jump + attack), and every run is
 * deterministic (fixed seed, fixed steps). Fails on any page error.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
// Brings the `window.__arcade` typings into scope for the in-page callbacks below.
import type {} from '../src/app/harness/harness';
import type { Action } from '../src/game/input/bindings';

/** Hold these actions for this many frames (nothing held = wait). */
interface Hold {
  readonly hold: readonly Action[];
  readonly frames: number;
}

/** Save the current frame as `<moment>-<name>.png`. */
interface Capture {
  readonly capture: string;
}

/** Save `count` frames, `every` frames apart, as one labelled contact sheet `<moment>-<name>.png`. */
interface Sheet {
  readonly sheet: string;
  readonly every: number;
  readonly count: number;
}

type TourStep = Hold | Capture | Sheet;

interface Moment {
  readonly name: string;
  readonly params: Record<string, unknown>;
  readonly steps: readonly TourStep[];
}

const wait = (frames: number): Hold => ({ hold: [], frames });
const hold = (frames: number, ...actions: Action[]): Hold => ({ hold: actions, frames });
const capture = (name: string): Capture => ({ capture: name });
const sheet = (name: string, every: number, count: number): Sheet => ({ sheet: name, every, count });

const MOMENTS: readonly Moment[] = [
  {
    name: 'run-luna',
    params: { levelId: 'luna', characterId: 'hackerman', autopilot: true },
    steps: [sheet('film', 90, 40)],
  },
  {
    name: 'run-scripe',
    params: { levelId: 'scripe', characterId: 'artsy', autopilot: true },
    steps: [sheet('film', 90, 40)],
  },
  {
    name: 'finale-luna',
    params: { levelId: 'luna', characterId: 'strategy', startAt: 'arena', skipIntro: true, autopilot: true },
    steps: [sheet('film', 45, 30)],
  },
  {
    name: 'finale-scripe',
    params: { levelId: 'scripe', characterId: 'hackerman', startAt: 'arena', skipIntro: true, autopilot: true },
    steps: [sheet('film', 60, 30)],
  },
  {
    name: 'intro',
    params: { levelId: 'luna', characterId: 'hackerman' },
    steps: [wait(70), capture('mission'), wait(110), capture('hints')],
  },
  {
    name: 'customer',
    params: { levelId: 'luna', characterId: 'hackerman', skipIntro: true },
    steps: [
      hold(80, 'right'),
      capture('approach'),
      hold(40, 'attack'),
      capture('hit'),
      hold(90, 'attack'),
      capture('won'),
      wait(20),
      capture('stroll'),
    ],
  },
  {
    name: 'bubble',
    params: { levelId: 'scripe', characterId: 'artsy', skipIntro: true },
    steps: [hold(95, 'right'), wait(70), capture('shout'), wait(30), capture('incoming')],
  },
  {
    name: 'highlight',
    params: { levelId: 'luna', characterId: 'strategy', skipIntro: true },
    steps: [
      hold(150, 'right', 'attack'),
      hold(54, 'right'),
      hold(20, 'jump'),
      wait(14),
      capture('card-open'),
      wait(160),
      capture('card'),
      hold(2, 'attack'),
      wait(20),
      capture('after'),
    ],
  },
  {
    name: 'skills-hackerman',
    params: { levelId: 'luna', characterId: 'hackerman', skipIntro: true },
    steps: [
      hold(20, 'right'),
      hold(2, 'skill1'),
      wait(6),
      capture('full-stack'),
      hold(2, 'skill2'),
      wait(50),
      capture('agent-summon'),
    ],
  },
  {
    name: 'skills-artsy',
    params: { levelId: 'luna', characterId: 'artsy', skipIntro: true },
    steps: [
      hold(20, 'right'),
      hold(2, 'skill1'),
      wait(12),
      capture('ux-elixir'),
      wait(40),
      capture('ux-elixir-calm'),
      hold(2, 'skill2'),
      wait(6),
      capture('power-chord'),
      wait(40),
      capture('power-chord-stunned'),
    ],
  },
  {
    name: 'skills-strategy',
    params: { levelId: 'luna', characterId: 'strategy', skipIntro: true },
    steps: [
      hold(20, 'right'),
      hold(2, 'skill1'),
      wait(26),
      capture('north-star'),
      hold(2, 'skill2'),
      wait(20),
      capture('churn-shield'),
    ],
  },
  {
    name: 'cable-car',
    params: { levelId: 'luna', characterId: 'artsy', startAt: 0, skipIntro: true },
    steps: [hold(30, 'right'), hold(16, 'right', 'jump'), wait(40), capture('boarded'), wait(120), capture('riding')],
  },
  {
    name: 'gate',
    params: { levelId: 'luna', characterId: 'hackerman', skipIntro: true },
    steps: [hold(200, 'right', 'attack'), hold(330, 'right'), capture('gate')],
  },
  {
    name: 'scope-creep',
    params: { levelId: 'scripe', characterId: 'strategy', skipIntro: true },
    steps: [hold(400, 'right', 'attack'), hold(140, 'right'), capture('vines')],
  },
  {
    name: 'boss',
    params: { levelId: 'luna', characterId: 'hackerman', startAt: 'arena', skipIntro: true },
    steps: [hold(60, 'right'), capture('warning'), wait(60), capture('landed'), hold(120, 'attack'), capture('fight')],
  },
  {
    name: 'boss-scripe',
    params: { levelId: 'scripe', characterId: 'artsy', startAt: 'arena', skipIntro: true },
    steps: [hold(60, 'right'), wait(70), hold(150, 'attack'), capture('fight')],
  },
  {
    name: 'pause',
    params: { levelId: 'scripe', characterId: 'hackerman', skipIntro: true },
    steps: [hold(40, 'right'), hold(2, 'pause'), wait(10), capture('menu'), hold(2, 'down'), wait(4), capture('focus')],
  },
];

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: '.shots/tour' },
    only: { type: 'string' },
    url: { type: 'string' },
    scale: { type: 'string', default: '2' },
  },
  strict: true,
});

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

async function startServer(): Promise<{ base: string; server: ViteDevServer | null }> {
  if (values.url) return { base: values.url.replace(/\/$/, ''), server: null };
  const port = await freePort();
  const server = await createServer({
    configFile: resolve(import.meta.dirname, '../vite.config.ts'),
    logLevel: 'warn',
    server: { port, strictPort: true, hmr: false },
  });
  await server.listen();
  return { base: `http://localhost:${port}`, server };
}

async function capturePng(page: Page, scale: number): Promise<Buffer> {
  const dataUrl = await page.evaluate((factor) => {
    const source = window.__arcade?.game.canvas;
    if (!source) throw new Error('window.__arcade is not available');
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

/** Steps through `count` frames `every` frames apart and lays them out 5 wide at native size, labelled with seconds. */
async function captureSheet(page: Page, step: Sheet): Promise<Buffer> {
  const dataUrl = await page.evaluate(({ every, count }) => {
    const arcade = window.__arcade;
    if (!arcade) throw new Error('window.__arcade is not available');
    const source = arcade.game.canvas;
    const columns = 5;
    const label = 12;
    const sheet = document.createElement('canvas');
    sheet.width = columns * (source.width + 2);
    sheet.height = Math.ceil(count / columns) * (source.height + label + 2);
    const ctx = sheet.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = '#16141f';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    for (let i = 0; i < count; i++) {
      if (i > 0) arcade.step(every);
      const x = (i % columns) * (source.width + 2);
      const y = Math.floor(i / columns) * (source.height + label + 2);
      ctx.drawImage(source, x, y + label);
      ctx.fillStyle = '#e8e4ff';
      ctx.font = '10px ui-monospace, monospace';
      ctx.fillText(`${((i * every) / 60).toFixed(1)}s`, x + 2, y + 10);
    }
    return sheet.toDataURL('image/png');
  }, step);
  return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
}

async function play(page: Page, base: string, moment: Moment, outDir: string, scale: number): Promise<string[]> {
  const query = new URLSearchParams({
    debug: '',
    host: 'flat',
    seed: '1',
    scene: 'level',
    frames: '0',
    params: JSON.stringify(moment.params),
  });
  await page.goto(`${base}/?${query}`);
  await page.waitForFunction(() => window.__arcadeReady === true);
  const saved: string[] = [];
  for (const step of moment.steps) {
    if ('capture' in step) {
      const file = resolve(outDir, `${moment.name}-${step.capture}.png`);
      await writeFile(file, await capturePng(page, scale));
      saved.push(file);
      continue;
    }
    if ('sheet' in step) {
      const file = resolve(outDir, `${moment.name}-${step.sheet}.png`);
      await writeFile(file, await captureSheet(page, step));
      saved.push(file);
      continue;
    }
    await page.evaluate(
      ({ actions, frames }) => {
        const arcade = window.__arcade;
        if (!arcade) throw new Error('window.__arcade is not available');
        for (const action of actions) arcade.game.input.virtual.press(action);
        arcade.step(frames);
        for (const action of actions) arcade.game.input.virtual.release(action);
      },
      { actions: step.hold, frames: step.frames },
    );
  }
  return saved;
}

async function main(): Promise<void> {
  const only = values.only?.split(',');
  const moments = MOMENTS.filter((moment) => !only || only.includes(moment.name));
  const outDir = resolve(values.out ?? '.shots/tour');
  await mkdir(outDir, { recursive: true });
  const { base, server } = await startServer();
  const browser = await chromium.launch();
  const errors: string[] = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    for (const moment of moments) {
      for (const file of await play(page, base, moment, outDir, Number(values.scale))) console.log(file);
    }
  } finally {
    await browser.close();
    await server?.close();
  }
  if (errors.length > 0) {
    console.error(`level-tour: page errors:\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(`level-tour: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
