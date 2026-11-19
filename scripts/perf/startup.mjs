#!/usr/bin/env node
// Times the page's opening, cold, in a new browser each run: the first paint, the game running on the still, the room
// ready; or, for a visitor the startup gate sends to the résumé (docs/ROOM.md › No GPU), the résumé shown. Lists what
// was fetched and its bytes on the wire.
//   node scripts/perf/startup.mjs --dist dist [--dist other ...] [--device desktop|phone] [--cpu 6] [--net slow4g]
//                                 [--launch gpu|no-webgl|swiftshader|swiftshader-angle] [--query '?host=cv']
//                                 [--runs 9] [--requests] [--json out.json] [--wait-quiet 300] [--warm]
// --launch chrome is the system's Google Chrome in a window; --warm makes a WebGL context on another page first, as
// a browser already in use has its GPU process up.
// Several --dist are measured turn and turn about, so a drifting machine drifts under each alike. A run is `alone`
// when other checkouts' browsers and test runs were idle (under 15 % of a core between them) before and after it; with --wait-quiet the script waits up
// to that many seconds for the machine to fall quiet before each run. Timings from runs that were not alone mean
// little. CPU throttling slows the page's main thread only.
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { createGzip } from 'node:zlib';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const options = (name) => args.flatMap((arg, i) => (arg === `--${name}` ? [args[i + 1]] : []));
const dists = (options('dist').length ? options('dist') : ['dist']).map((dist) => resolve(dist));
const deviceName = option('device', 'desktop');
const cpu = Number(option('cpu', deviceName === 'phone' ? 6 : 1));
const runs = Number(option('runs', 9));
const query = option('query', '');
const launchName = option('launch', 'gpu');
const waitQuiet = Number(option('wait-quiet', 0));

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
/** Chrome DevTools' "Slow 4G": 1.6 Mbit/s down, 750 kbit/s up, 150 ms round trip. */
const SLOW_4G = {
  offline: false,
  downloadThroughput: (1.6e6 / 8) * 0.9,
  uploadThroughput: (750e3 / 8) * 0.9,
  latency: 150,
};
const NO_FALLBACK = ['--enable-unsafe-swiftshader'];
const LAUNCHES = {
  gpu: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] },
  // Hardware acceleration switched off (Playwright would otherwise add the software fallback on macOS).
  'no-webgl': { args: ['--disable-gpu'], ignoreDefaultArgs: NO_FALLBACK },
  swiftshader: { args: ['--disable-gpu', '--enable-unsafe-swiftshader'] },
  'swiftshader-angle': { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  // The system's Google Chrome in a window, as a visitor has it (a new profile each run: no shader cache yet).
  chrome: { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: false },
};

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.m4a': 'audio/mp4',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

/** The build as a host would serve it: text gzipped, everything else as it is. */
function serve(root) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    const file = path === '/' ? join(root, 'index.html') : join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    const type = extname(file);
    const headers = { 'content-type': TYPES[type] ?? 'application/octet-stream', 'cache-control': 'no-cache' };
    if (COMPRESSIBLE.has(type)) {
      response.writeHead(200, { ...headers, 'content-encoding': 'gzip' });
      createReadStream(file).pipe(createGzip()).pipe(response);
    } else {
      response.writeHead(200, { ...headers, 'content-length': statSync(file).size });
      createReadStream(file).pipe(response);
    }
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

const cached = join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(cached) ? cached : undefined);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * How busy other checkouts' browsers and test runs are now, in percent of one core (this script's own browser is
 * closed when this is asked). A browser that is open but idle, as an agent's own may be for hours, is not load.
 */
function foreign() {
  const running = /(Chrome for Testing|chrome-headless-shell|Google Chrome)|node\S* .*playwright/;
  const lines = execFileSync('ps', ['-axo', 'pcpu=,command='], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n');
  let busy = 0;
  for (const line of lines) {
    const [, cpu, command] = /^\s*([\d.]+)\s+(.*)$/.exec(line) ?? [];
    if (command && running.test(command.slice(0, 400)) && !command.includes(process.cwd())) busy += Number(cpu);
  }
  return busy < 15 ? 0 : busy;
}

async function quiet() {
  const until = Date.now() + waitQuiet * 1000;
  while (foreign() > 0 && Date.now() < until) await sleep(2000);
  return foreign() === 0;
}

/** Stamps, on the page's own clock, the moments this script reports. */
const STAMPS = `(() => {
  const at = (window.__startup = {});
  const look = () => {
    const root = document.documentElement;
    if (!root) return;
    if (!at.cv && root.dataset.cv === 'shown') at.cv = performance.now();
    if (!at.running && document.getElementById('game')?.dataset.phase === 'running') at.running = performance.now();
    if (!at.ready && document.querySelector('.room-host[data-ready="true"]')) at.ready = performance.now();
    if (!at.flat && document.querySelector('[data-host="flat"]')) at.flat = performance.now();
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true, attributes: true });
})();`;

async function visit(base) {
  const browser = await chromium.launch({ executablePath, timeout: 30_000, ...LAUNCHES[launchName] });
  try {
    const context = await browser.newContext(DEVICES[deviceName]);
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await page.addInitScript(STAMPS);
    if (cpu > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    await client.send('Network.enable');
    if (option('net') === 'slow4g') await client.send('Network.emulateNetworkConditions', SLOW_4G);
    const urls = new Map();
    const transfers = [];
    client.on('Network.requestWillBeSent', (event) => urls.set(event.requestId, event.request.url));
    client.on('Network.loadingFinished', (event) =>
      transfers.push({ path: new URL(urls.get(event.requestId)).pathname, bytes: event.encodedDataLength }),
    );
    if (args.includes('--warm')) {
      // A browser already in use: its GPU process up and one WebGL context made and gone, on another page.
      const before = await context.newPage();
      await before.setContent('<canvas></canvas>');
      await before.evaluate(() => document.querySelector('canvas').getContext('webgl2'));
      await before.close();
    }
    await page.goto(`${base}/${query}`, { waitUntil: 'commit', timeout: 60_000 });
    const done = (at) => at.cv || (at.running && (at.ready || at.flat));
    const from = Date.now();
    let at = {};
    while (!done(at) && Date.now() - from < 90_000) {
      await sleep(100);
      at = await page.evaluate(() => window.__startup);
    }
    // What the page still asks for once it stands (the still's image, fonts, the résumé's cursors).
    await sleep(option('net') === 'slow4g' ? 4000 : 1500);
    const paints = await page.evaluate(() =>
      Object.fromEntries(performance.getEntriesByType('paint').map((entry) => [entry.name, entry.startTime])),
    );
    const fetchStart = await page.evaluate(() =>
      Object.fromEntries(
        performance
          .getEntriesByType('resource')
          .filter((entry) => /\/assets\/(index|cv)-[^/]+\.(js|css)$/.test(entry.name))
          .map((entry) => [entry.name.replace(/^.*\/assets\/([a-z]+)-.*\.(\w+)$/, '$1.$2'), entry.fetchStart]),
      ),
    );
    return {
      page: await page.evaluate(() => document.documentElement.dataset.page ?? 'site'),
      firstPaint: paints['first-paint'],
      firstContentfulPaint: paints['first-contentful-paint'],
      ...at,
      fetchStart,
      requests: transfers.length,
      bytes: transfers.reduce((sum, transfer) => sum + transfer.bytes, 0),
      transfers,
    };
  } finally {
    await browser.close();
  }
}

const median = (values) => {
  const sorted = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  return sorted.length ? sorted[sorted.length >> 1] : null;
};
const spread = (values) => {
  const sorted = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  return sorted.length ? `${sorted[0].toFixed(0)}–${sorted[sorted.length - 1].toFixed(0)}` : '-';
};
const ms = (value) => (value === null || value === undefined ? '-' : value.toFixed(0));

const servers = await Promise.all(dists.map(serve));
const samples = dists.map(() => []);
try {
  for (let run = 0; run < runs; run++) {
    for (const [i, server] of servers.entries()) {
      const before = waitQuiet ? await quiet() : foreign() === 0;
      const sample = await visit(`http://127.0.0.1:${server.address().port}`);
      sample.alone = before && foreign() === 0;
      samples[i].push(sample);
    }
  }
} finally {
  for (const server of servers) server.close();
}

console.log(
  `${launchName}, ${deviceName}${cpu > 1 ? ` CPU ${cpu}x` : ''}${option('net') ? `, ${option('net')}` : ''}${query ? `, ${query}` : ''}: ${runs} cold loads each, median (range), ms`,
);
for (const [i, dist] of dists.entries()) {
  const all = samples[i];
  const alone = all.filter((sample) => sample.alone);
  // Runs another checkout's browser was alive in are left out when there are enough without.
  const used = alone.length >= 3 ? alone : all;
  const column = (name) =>
    `${ms(median(used.map((sample) => sample[name])))} (${spread(used.map((sample) => sample[name]))})`;
  const first = used[0];
  console.log(
    `  ${dist.replace(`${process.cwd()}/`, '')}: page ${first.page}; first paint ${column('firstPaint')}; ` +
      (first.page === 'cv'
        ? `first contentful paint ${column('firstContentfulPaint')}; résumé shown ${column('cv')}`
        : `game running ${column('running')}; ${first.flat ? `flat TV ${column('flat')}` : `room ready ${column('ready')}`}`) +
      `; stylesheet asked for at ${ms(median(used.map((sample) => sample.fetchStart['index.css'])))}, entry at ${ms(median(used.map((sample) => sample.fetchStart['index.js'] ?? sample.fetchStart['cv.js'])))}` +
      `; ${first.requests} requests, ${(first.bytes / 1000).toFixed(1)} kB on the wire` +
      `; ${alone.length} of ${all.length} runs alone${alone.length >= 3 ? ' (those used)' : ' (ALL used: not a quiet machine)'}`,
  );
  if (args.includes('--requests'))
    for (const transfer of first.transfers)
      console.log(`      ${String(transfer.bytes).padStart(7)}  ${transfer.path}`);
}
const out = option('json', null);
if (out)
  writeFileSync(
    out,
    JSON.stringify(
      { launch: launchName, device: deviceName, cpu, net: option('net', null), query, dists, samples },
      null,
      1,
    ),
  );
