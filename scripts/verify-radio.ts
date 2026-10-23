/**
 * Checks the CD player's shelf (src/content/radio/albums.ts) against its files: ids,
 * counts, covers and disc prints, codecs, streaming order, bitrates and every track's
 * length (docs/RADIO.md › Your own albums). Prints the right `seconds` for any track
 * that is off, ready to paste. Exits non-zero on any problem.
 *
 *   pnpm verify:radio               the checks
 *   pnpm verify:radio --loudness    also measures every album against the game's music
 *                                   in Chromium and suggests a gainDb (advisory)
 */
import { readFile } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { createServer } from 'vite';
import { ALBUMS } from '../src/content/radio/albums';
import { audioFileInfo } from '../src/content/radio/audioFiles';
import { type FileReader, validateAlbums } from '../src/content/radio/validate';
import type {} from './radio/render-page';

const ROOT = resolve(import.meta.dirname, '..');
const FOLDER = join(ROOT, 'src/content/radio/albums');
/** Albums this much louder than the game get a suggested cut; quieter ones are left alone (gainDb ≤ 0). */
const LOUDNESS_SLACK_DB = 1;

const { values } = parseArgs({ options: { loudness: { type: 'boolean' } }, strict: true });

const disk: FileReader = {
  bytes: (album, name) =>
    readFile(join(FOLDER, album.id, name)).then(
      (buffer) => new Uint8Array(buffer),
      () => null,
    ),
  image: (album, name) =>
    sharp(join(FOLDER, album.id, name))
      .metadata()
      .then(
        ({ width, height, hasAlpha, format }) => ({ width, height, hasAlpha, format }),
        () => null,
      ),
};

async function main(): Promise<void> {
  const report = await validateAlbums(ALBUMS, disk);
  for (const album of ALBUMS) {
    console.log(`${album.id}  ${album.title} — ${album.artist}${album.placeholder ? '  (placeholder)' : ''}`);
    for (const track of album.tracks) {
      const bytes = await disk.bytes(album, track.file);
      const info = bytes ? audioFileInfo(track.file, bytes) : null;
      const seconds = info?.seconds?.toFixed(2) ?? '—';
      const size = bytes ? `${(bytes.length / 1000).toFixed(0)} kB` : 'remote or missing';
      console.log(`  ${track.file.padEnd(28)} ${seconds.padStart(7)} s  ${size}`);
    }
  }
  console.log(`\nPlaceholder audio: ${(report.placeholderAudioBytes / 1e6).toFixed(2)} MB`);

  if (report.corrections.length > 0) {
    console.log('\nPaste these lengths into src/content/radio/albums.ts:');
    for (const fix of report.corrections) {
      console.log(
        `  ${fix.album}, track ${fix.track}: { title: ${JSON.stringify(fix.title)}, …, seconds: ${fix.seconds} },`,
      );
    }
  }
  if (values.loudness) await loudness();
  if (report.problems.length > 0) {
    console.error(`\nThe shelf has problems:\n- ${report.problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\nThe shelf is in order.');
}

/** Decodes every local track in Chromium and compares its loudness with one pass of the game's level-luna. */
async function loudness(): Promise<void> {
  const port = await freePort();
  const server = await createServer({
    configFile: resolve(ROOT, 'vite.config.ts'),
    server: { port, strictPort: true },
    logLevel: 'error',
  });
  await server.listen();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/scripts/radio/render.html`);
    await page.waitForFunction(() => window.__radioRender !== undefined);
    const reference = await page.evaluate(() => window.__radioRender?.reference() ?? Number.NaN);
    console.log(`\nLoudness (advisory), against the game's level-luna at ${reference.toFixed(1)} dB:`);
    for (const album of ALBUMS) {
      const levels: number[] = [];
      for (const track of album.tracks) {
        if (/^https:/i.test(track.file)) continue;
        const url = `/src/content/radio/albums/${album.id}/${track.file}`;
        levels.push(await page.evaluate((path) => window.__radioRender?.loudness(path) ?? Number.NaN, url));
      }
      if (levels.length === 0) continue;
      const level = 10 * Math.log10(levels.reduce((sum, db) => sum + 10 ** (db / 10), 0) / levels.length);
      const over = level + (album.gainDb ?? 0) - reference;
      const advice = over > LOUDNESS_SLACK_DB ? `suggest gainDb: ${(-(level - reference)).toFixed(1)}` : 'fine';
      console.log(
        `  ${album.id.padEnd(20)} ${level.toFixed(1).padStart(6)} dB  (${over >= 0 ? '+' : ''}${over.toFixed(1)} dB)  ${advice}`,
      );
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createNetServer();
    probe.listen(0, () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === 'object' && address ? resolvePort(address.port) : reject(new Error('no port')),
      );
    });
  });
}

await main();
