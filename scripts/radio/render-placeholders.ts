/**
 * Renders the placeholder albums' music (scripts/radio/songs) to the files the radio
 * streams: offline through the game's own synth and master bus in Chromium, loudness
 * matched to the game's first stage, then encoded to AAC with Apple's `afconvert`
 * (macOS; an authoring-only tool like Blender, the results are committed).
 *
 *   pnpm build:radio-placeholders [--only night-shift,low-tide] [--covers-only] [--url http://localhost:5173]
 *
 * Paints the covers and disc prints first (scripts/radio/covers.ts), then writes
 * src/content/radio/albums/<album>/NN-slug.m4a and prints each track's length for
 * src/content/radio/albums.ts. Without --url it starts a private Vite server for the run.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { chromium } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { mp4Info } from '../../src/content/radio/audioFiles';
import { writeCovers } from './covers';
import type {} from './render-page';
import { PLACEHOLDER_SONGS, placeholderFile } from './songs';

const ROOT = resolve(import.meta.dirname, '../..');
const ALBUMS = join(ROOT, 'src/content/radio/albums');
/** The encoder settings docs/RADIO.md documents: AAC-LC, VBR quality 64 (≈ 80 kb/s), moov first. */
const AFCONVERT = ['-f', 'm4af', '-d', 'aac', '-s', '3', '-u', 'vbrq', '64'];
/** Every placeholder must land this close to the game's loudness. */
const LOUDNESS_TOLERANCE_DB = 1;
/** All placeholder audio together. */
const TOTAL_BUDGET_BYTES = 5.5e6;

const run = promisify(execFile);
const { values } = parseArgs({
  options: { url: { type: 'string' }, only: { type: 'string' }, 'covers-only': { type: 'boolean' } },
  strict: true,
});

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.listen(0, () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address ? resolvePort(address.port) : reject(new Error('no port')),
      );
    });
  });
}

async function main(): Promise<void> {
  const only = values.only?.split(',').filter(Boolean);
  const albums = Object.keys(PLACEHOLDER_SONGS).filter((id) => !only || only.includes(id));
  const problems = await writeCovers(only);
  if (values['covers-only']) return report(problems);
  let server: ViteDevServer | null = null;
  let base = values.url;
  if (!base) {
    const port = await freePort();
    server = await createServer({
      configFile: resolve(ROOT, 'vite.config.ts'),
      server: { port, strictPort: true },
      logLevel: 'error',
    });
    await server.listen();
    base = `http://localhost:${port}`;
  }
  const browser = await chromium.launch();
  const scratch = await mkdtemp(join(tmpdir(), 'radio-placeholders-'));
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => problems.push(error.message));
    await page.goto(`${base}/scripts/radio/render.html`);
    await page.waitForFunction(() => window.__radioRender !== undefined);
    const target = await page.evaluate(() => window.__radioRender?.reference() ?? Number.NaN);
    console.log(`Target loudness (level-luna): ${target.toFixed(2)} dB\n`);

    for (const album of albums) {
      const tracks = PLACEHOLDER_SONGS[album] ?? [];
      for (const [index, { slug }] of tracks.entries()) {
        const started = performance.now();
        const rendered = await page.evaluate(
          ({ album, index, target }) => window.__radioRender?.render(album, index, target),
          { album, index, target },
        );
        if (!rendered) throw new Error(`The renderer returned nothing for ${album} #${index + 1}`);
        const wav = join(scratch, `${album}-${slug}.wav`);
        const out = join(ALBUMS, album, placeholderFile(index, slug));
        await writeFile(wav, Buffer.from(rendered.wav, 'base64'));
        await mkdir(join(ALBUMS, album), { recursive: true });
        await run('afconvert', [...AFCONVERT, wav, out]);
        const info = mp4Info(new Uint8Array(await readFile(out)));
        const { size } = await stat(out);
        const off = rendered.loudnessDb - target;
        console.log(
          `${album}/${placeholderFile(index, slug)}  ${info.seconds?.toFixed(2)} s  ${(size / 1000).toFixed(0)} kB  ` +
            `loudness ${off >= 0 ? '+' : ''}${off.toFixed(2)} dB  peak ${rendered.peakDb.toFixed(1)} dBFS  ` +
            `gain ${rendered.gain.toFixed(3)}  (${((performance.now() - started) / 1000).toFixed(1)} s)`,
        );
        if (Math.abs(off) > LOUDNESS_TOLERANCE_DB) problems.push(`${album}/${slug} is ${off.toFixed(2)} dB off`);
        if (!info.moovBeforeMdat || info.codec !== 'aac-lc') problems.push(`${out} is not AAC-LC with moov first`);
      }
    }
    const total = await totalBytes();
    console.log(
      `\nAll placeholder audio: ${(total / 1e6).toFixed(2)} MB of ${(TOTAL_BUDGET_BYTES / 1e6).toFixed(1)} MB`,
    );
    if (total > TOTAL_BUDGET_BYTES) problems.push(`the placeholders take ${total} bytes`);
  } finally {
    await browser.close();
    await server?.close();
    await rm(scratch, { recursive: true, force: true });
  }
  report(problems);
}

function report(problems: readonly string[]): void {
  if (problems.length === 0) return;
  console.error(`\nProblems:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

async function totalBytes(): Promise<number> {
  let total = 0;
  for (const [album, tracks] of Object.entries(PLACEHOLDER_SONGS)) {
    for (const [index, { slug }] of tracks.entries()) {
      total += await stat(join(ALBUMS, album, placeholderFile(index, slug))).then(
        (file) => file.size,
        () => 0,
      );
    }
  }
  return total;
}

await main();
