#!/usr/bin/env node
// What the page shows while a visitor who left the TV early waits for the rest of the room's light on a software
// renderer: screenshots and the game's own picture (read off its canvas) at several moments, and what a key pressed
// during the wait does.
//   node scripts/perf/nogpuWait.mjs --dist .shots/flights/dist-base [--args "..."] [--shots dir] [--label name]
//        [--leave 0]   ms after the room is handed out at which the visitor leaves (a negative number: never)
//        [--press 12]  seconds after the leave at which the visitor presses Enter (omit: no key)
//        [--moments 0.5,2,6,10,20,40]  seconds after the room is handed out at which to look
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
const shots = option('shots', null);
const label = option('label', 'wait');
const leave = Number(option('leave', 0));
const pressAt = option('press', null) === null ? null : Number(option('press'));
const moments = option('moments', '0.5,2,6,10,20,40').split(',').map(Number);
const here = option('probes', null) ? resolve(option('probes')) : dirname(fileURLToPath(import.meta.url));

const server = await serve(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const { context, close } = await launch({ args });
try {
  const page = await context.newPage();
  await page.addInitScript(
    `window.__flightConfig = ${JSON.stringify(leave >= 0 ? { leaveAfterMs: leave } : {})}; window.__perfConfig = {};`,
  );
  await page.addInitScript({ path: join(here, 'flightProbe.js') });
  await page.addInitScript({ path: join(here, 'glProfiler.js') });
  const markAt = (name) =>
    page.evaluate((wanted) => window.__flight.marks.find((mark) => mark.name === wanted)?.at ?? null, name);
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
  /** The game's own picture (mean brightness of its canvas, 0–255), the still, the view, the scene. */
  const look = () =>
    page.evaluate(() => {
      const canvas = document.querySelector('.still-picture__canvas, .tv__canvas') ?? window.__arcade?.game.canvas;
      let brightness = null;
      try {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
        brightness = Math.round(sum / (data.length / 4) / 3);
      } catch (error) {
        brightness = String(error);
      }
      const still = document.getElementById('tv-still');
      const picture = document.querySelector('.still-picture');
      const state = window.__arcade?.state();
      return {
        at: Math.round(performance.now()),
        gameCanvasBrightness: brightness,
        canvasIn: canvas?.parentElement?.className ?? null,
        still: still
          ? {
              shown: still.dataset.shown,
              opacity: getComputedStyle(still).opacity,
              display: getComputedStyle(still).display,
            }
          : null,
        picture: picture ? { powered: picture.dataset.powered, opacity: getComputedStyle(picture).opacity } : null,
        view: document.querySelector('.room-host')?.getAttribute('data-view'),
        scene: state?.scene,
        transition: state?.transition,
        gameFrame: state?.frame,
        paused: state?.paused,
        roomShown: window.__room?.shown,
        power: window.__room?.powerState,
        generated: window.__room?.stats.generated,
        marks: window.__flight.marks.map((mark) => `${mark.name}@${Math.round(mark.at)}`).join(' '),
      };
    });
  await page.goto(`${base}/?debug`, { waitUntil: 'commit' });
  // Before the room is in: the game alone on the still.
  await sleep(3000);
  console.log(`before the room: ${JSON.stringify(await look())}`);
  await shoot('before-ready');
  const from = Date.now();
  while ((await markAt('room-ready')) === null) {
    if (Date.now() - from > 120_000) throw new Error('No room within 120 s');
    await sleep(50);
  }
  const ready = Date.now();
  let pressed = false;
  for (const moment of moments) {
    while ((Date.now() - ready) / 1000 < moment) {
      if (pressAt !== null && !pressed && (Date.now() - ready) / 1000 >= pressAt) {
        pressed = true;
        await page.keyboard.press('Enter');
        console.log(`pressed Enter ${((Date.now() - ready) / 1000).toFixed(1)} s after the room was handed out`);
      }
      await sleep(50);
    }
    console.log(`+${moment} s after ready: ${JSON.stringify(await look())}`);
    await shoot(`ready+${moment}s`);
  }
  // Until the camera has left and landed, or two minutes more.
  const until = Date.now() + 150_000;
  while ((await markAt('settle:room')) === null && Date.now() < until && leave >= 0) await sleep(200);
  await sleep(1500);
  console.log(`at the end: ${JSON.stringify(await look())}`);
  await shoot('end');
} catch (error) {
  console.log(`ERROR ${error}`);
} finally {
  await close();
  server.close();
}
