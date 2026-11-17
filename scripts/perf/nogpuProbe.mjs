#!/usr/bin/env node
// What a visitor without a GPU gets: for one browser and one set of flags, whether WebGL contexts can be made, what
// draws them, and which host the production build then shows.
//   node scripts/perf/nogpuProbe.mjs --dist .shots/flights/dist-base [--browser cft|chrome] [--args "--disable-gpu"]
//                                    [--keep-swiftshader-flag] [--pref-off] [--label name]
// One JSON object per run on stdout.
import { resolve } from 'node:path';
import { gpuInfo, launch, serve, sleep, WEBGL_PROBE } from './nogpuLib.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const dist = resolve(option('dist', 'dist'));
const args = option('args', '').split(' ').filter(Boolean);
const browserName = option('browser', 'cft');

const server = await serve(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const { browser, context, close } = await launch({
  browser: browserName,
  args,
  keepSwiftshaderFlag: flag('keep-swiftshader-flag'),
  prefOff: flag('pref-off'),
});
const result = {
  label: option('label', null),
  browser: browserName,
  args,
  keptSwiftshaderFlag: flag('keep-swiftshader-flag'),
  prefOff: flag('pref-off'),
};
try {
  const page = await context.newPage();
  const consoleLines = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error')
      consoleLines.push(`${message.type()}: ${message.text().slice(0, 300)}`);
  });
  // A page of the build's origin with nothing on it: the contexts are asked for before the app asks for its own.
  await page.goto(`${base}/CREDITS.txt`);
  result.webgl = await page.evaluate(WEBGL_PROBE);
  const info = browser ? await gpuInfo(browser) : { error: 'no browser handle' };
  result.product = info.product;
  result.featureStatus = info.featureStatus;
  result.devices = info.devices;
  result.gpuFlagsSeen = (info.commandLine ?? '')
    .split(' ')
    .filter((part) => /gpu|swiftshader|angle|3d-apis|use-gl|headless|software/.test(part));
  // The site itself: which host shows, and whether the room comes.
  await page.goto(`${base}/?debug`, { waitUntil: 'commit' });
  const started = Date.now();
  let host = null;
  while (Date.now() - started < 90_000) {
    host = await page.evaluate(() => {
      const element = document.querySelector('[data-host]');
      return element
        ? {
            kind: element.getAttribute('data-host'),
            ready: element.getAttribute('data-ready'),
            phase: document.getElementById('game')?.dataset.phase ?? null,
          }
        : null;
    });
    if (host && host.phase === 'running' && (host.kind === 'flat' || host.ready === 'true')) break;
    await sleep(100);
  }
  result.host = host;
  result.hostAfterMs = Date.now() - started;
  result.room = await page.evaluate(() => {
    const stats = window.__room?.stats;
    return stats ? { quality: { ...stats.quality }, pixelRatio: stats.pixelRatio, generated: stats.generated } : null;
  });
  result.console = consoleLines.slice(0, 12);
} catch (error) {
  result.error = String(error);
} finally {
  await close();
  server.close();
}
console.log(JSON.stringify(result));
