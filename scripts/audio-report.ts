/**
 * Renders every track and effect offline in Chromium (through the audio lab)
 * and prints the level table: the same figures the end-to-end audio checks
 * assert on, for tuning by numbers rather than by ear.
 *
 *   pnpm exec tsx scripts/audio-report.ts [--url http://localhost:5205] [--only id,id]
 *
 * Without --url it starts a private Vite server for the run.
 */
import { createServer as createNetServer } from 'node:net';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import type {} from '../src/game/audio/lab/main';

const { values } = parseArgs({ options: { url: { type: 'string' }, only: { type: 'string' } }, strict: true });

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.listen(0, () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port')),
      );
    });
  });
}

const db = (value: number): string => (Number.isFinite(value) ? value.toFixed(1).padStart(6) : '  -inf');

async function main(): Promise<void> {
  let server: ViteDevServer | null = null;
  let base = values.url;
  if (!base) {
    const port = await freePort();
    server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
    await server.listen();
    base = `http://localhost:${port}`;
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => console.error('page error:', error.message));
    // Vite may reload the page once while it optimises dependencies; settle before measuring.
    await page.goto(`${base}/audio-lab.html`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__audioLab !== undefined);
    const only = values.only?.split(',');
    const { musicIds, sfxIds } = await page.evaluate(() => ({
      musicIds: [...(window.__audioLab?.musicIds ?? [])],
      sfxIds: [...(window.__audioLab?.sfxIds ?? [])],
    }));
    console.log('track            bpm   pass   loop  peak  loud   rms  tail nan');
    for (const id of musicIds.filter((entry) => !only || only.includes(entry))) {
      const r = await page.evaluate((track) => window.__audioLab?.measureTrack(track), id);
      if (!r) continue;
      console.log(
        `${id.padEnd(15)} ${r.bpm.toFixed(0).padStart(4)} ${r.passSeconds.toFixed(1).padStart(6)} ${(r.loopSeconds?.toFixed(1) ?? '-').padStart(6)}${db(r.peakDb)}${db(r.loudnessDb)}${db(r.rmsDb)}${db(r.tailPeakDb)} ${r.nonFinite}`,
      );
    }
    console.log('\neffect            len  peak  loud   rms  tail nan');
    for (const id of sfxIds.filter((entry) => !only || only.includes(entry))) {
      const r = await page.evaluate((effect) => window.__audioLab?.measureSfx(effect), id);
      if (!r) continue;
      console.log(
        `${id.padEnd(17)}${r.lengthSeconds.toFixed(2).padStart(5)}${db(r.peakDb)}${db(r.loudnessDb)}${db(r.rmsDb)}${db(r.tailPeakDb)} ${r.nonFinite}`,
      );
    }
  } finally {
    await browser.close();
    await server?.close();
  }
}

await main();
