#!/usr/bin/env node
// Whether the radio's disc labels ever show on a software renderer: leaves the TV as the room is handed out, goes to
// the radio and watches `room.stats` there for a while, with screenshots.
//   node scripts/perf/nogpuRadio.mjs --dist .shots/flights/dist-base [--args "--disable-gpu --enable-unsafe-swiftshader"]
//        [--seconds 60] [--shots dir] [--label name]
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDir, launch, serve, sleep } from './nogpuLib.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const dist = resolve(option('dist', 'dist'));
const args = option('args', '--disable-gpu --enable-unsafe-swiftshader').split(' ').filter(Boolean);
const seconds = Number(option('seconds', 60));
const shots = option('shots', null);
const label = option('label', 'radio');
const here = option('probes', null) ? resolve(option('probes')) : dirname(fileURLToPath(import.meta.url));

const server = await serve(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const { context, close } = await launch({ args });
try {
  const page = await context.newPage();
  await page.addInitScript('window.__flightConfig = { leaveAfterMs: 0 }; window.__perfConfig = {};');
  await page.addInitScript({ path: join(here, 'flightProbe.js') });
  await page.addInitScript({ path: join(here, 'glProfiler.js') });
  const marks = () => page.evaluate(() => window.__flight.marks.map((mark) => `${mark.name}@${Math.round(mark.at)}`));
  const waitForMark = async (name, timeout = 240_000) => {
    const from = Date.now();
    while (!(await marks()).some((mark) => mark.startsWith(`${name}@`))) {
      if (Date.now() - from > timeout) throw new Error(`No "${name}" within ${timeout} ms`);
      await sleep(100);
    }
  };
  const shoot = async (name) => {
    if (!shots) return;
    ensureDir(shots);
    const file = join(shots, `${label}-${name}.png`);
    await page.screenshot({ path: file });
    try {
      execFileSync(
        'sips',
        [
          '-s',
          'format',
          'jpeg',
          '-s',
          'formatOptions',
          '80',
          '-Z',
          '1280',
          file,
          '--out',
          join(shots, `${label}-${name}-view.jpg`),
        ],
        { stdio: 'ignore' },
      );
    } catch {}
  };
  await page.goto(`${base}/?debug`, { waitUntil: 'commit' });
  await waitForMark('settle:room');
  await sleep(1500);
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Music by me' || b.getAttribute('aria-label') === 'Music by me',
    );
    if (!button) throw new Error('No "Music by me"');
    button.click();
  });
  await waitForMark('settle:radio');
  const arrived = Date.now();
  console.log(`marks: ${(await marks()).join('  ')}`);
  let last = '';
  const shotAt = [5, 15, 30, seconds];
  while ((Date.now() - arrived) / 1000 < seconds + 0.5) {
    const elapsed = (Date.now() - arrived) / 1000;
    const state = await page.evaluate(() => {
      const stats = window.__room.stats;
      return {
        radioReady: stats.radioReady,
        radioTexturePixels: stats.radioTexturePixels,
        backgroundPending: stats.backgroundPending,
        posters: stats.posters,
        ambient: stats.radioAmbient,
        lid: Math.round(stats.radioLidDegrees),
        images: performance
          .getEntriesByType('resource')
          .filter((entry) => /disc|cover/.test(entry.name))
          .map((entry) => `${entry.name.split('/').pop()}@${Math.round(entry.responseEnd)}`),
      };
    });
    const text = JSON.stringify(state);
    if (text !== last) console.log(`+${elapsed.toFixed(1)} s at the radio: ${text}`);
    last = text;
    if (shotAt.length && elapsed >= shotAt[0]) await shoot(`${shotAt.shift()}s`);
    await sleep(500);
  }
} catch (error) {
  console.log(`ERROR ${error}`);
} finally {
  await close();
  server.close();
}
