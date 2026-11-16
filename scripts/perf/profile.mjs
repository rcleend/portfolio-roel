#!/usr/bin/env node
// Measures a production build on the visitor's path: landing, the game on the TV, the room, the computer, the radio.
//   node scripts/perf/profile.mjs [--dist dist] [--device desktop|phone] [--cpu 4] [--sync] [--load] [--out file.json]
//                                 [--config '{"noMsaa":true,"shaderPatches":{...}}'] [--views tv,room,pc,radio]
//                                 [--query '&quality=low'] [--browser webkit] [--linger]
//   node scripts/perf/profile.mjs --shots .perf/shots/after [--dist dist] [--device phone] [--query '&quality=low']
//     screenshots instead: the same poses (the TV on a fixed game frame, the room, the computer, the radio) of any build.
// Needs the GPU: headless Chromium on ANGLE/Metal here (PERF_GL=swiftshader forces software GL, which says nothing
// about a phone). Frame numbers come from scripts/perf/glProfiler.js, injected before the page's own scripts.
// CPU throttling slows the main thread only, never the GPU: for a phone's GPU, read `pixels` (shaded per frame) and
// the GPU time per megapixel together.
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { chromium, webkit } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const dist = resolve(option('dist', 'dist'));
const deviceName = option('device', 'desktop');
const cpu = Number(option('cpu', deviceName === 'phone' ? 4 : 1));
const config = { ...JSON.parse(option('config', '{}')), sync: flag('sync') };
const views = option('views', 'tv,room,pc,radio').split(',');
const seconds = Number(option('seconds', 4));
const query = option('query', '');

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'phone-landscape': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
/** Chrome DevTools' "Slow 4G" (Lighthouse's mobile profile): 1.6 Mbit/s down, 750 kbit/s up, 150 ms round trip. */
const SLOW_4G = {
  offline: false,
  downloadThroughput: (1.6e6 / 8) * 0.9,
  uploadThroughput: (750e3 / 8) * 0.9,
  latency: 150,
};

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

/** The build as a host would serve it: text gzipped, everything else as it is. */
function serve(root) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    let file = join(root, path);
    if (path === '/') file = join(root, 'index.html');
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

const cachedChromium = join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(cachedChromium) ? cachedChromium : undefined);
const glArgs =
  process.env.PERF_GL === 'swiftshader'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const median = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
};
const percentile = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};
const round = (value, digits = 2) => (value === null || value === undefined ? null : Number(value.toFixed(digits)));

/** What a recording says: frames drawn per second, their cost, and what each drew into. */
function summarise({ frames, rafTimes, rafCpu, longTasks, glTime }, elapsedMs) {
  const from = rafTimes[0] ?? 0;
  const busy = rafCpu.filter((ms) => ms > 0.05);
  const intervals = [];
  for (let i = 1; i < frames.length; i++) intervals.push(frames[i].at - frames[i - 1].at);
  const targets = {};
  let pixels = 0;
  const last = frames[frames.length - 1];
  if (last) {
    for (const [key, draws] of Object.entries(last.targets)) {
      targets[key] = draws;
      const [width, height] = key.split(':')[1].split('x').map(Number);
      pixels += width * height;
    }
  }
  const of = (name) => frames.map((frame) => frame[name]).filter((value) => typeof value === 'number');
  return {
    seconds: round(elapsedMs / 1000, 1),
    framesDrawn: frames.length,
    fps: round((frames.length / elapsedMs) * 1000, 1),
    rafFps: round((rafTimes.length / elapsedMs) * 1000, 1),
    intervalMedianMs: round(median(intervals)),
    intervalP95Ms: round(percentile(intervals, 0.95)),
    intervalMaxMs: round(intervals.length ? Math.max(...intervals) : null),
    longTasks: longTasks.filter((task) => task.start >= from).map((task) => Math.round(task.duration)),
    pageCpuMedianMs: round(median(busy)),
    pageCpuP95Ms: round(percentile(busy, 0.95)),
    cpuMedianMs: round(median(of('cpuMs'))),
    cpuP95Ms: round(percentile(of('cpuMs'), 0.95)),
    gpuMedianMs: round(median(of('gpuMs'))),
    gpuP95Ms: round(percentile(of('gpuMs'), 0.95)),
    syncMedianMs: round(median(of('syncMs'))),
    syncP95Ms: round(percentile(of('syncMs'), 0.95)),
    glTime: Object.fromEntries(
      Object.entries(glTime)
        .sort((a, b) => b[1].ms - a[1].ms)
        .slice(0, 8)
        .map(([name, entry]) => [name, `${entry.ms.toFixed(1)}ms/${entry.calls} max ${entry.max.toFixed(1)}`]),
    ),
    draws: last?.draws ?? 0,
    triangles: Math.round((last?.vertices ?? 0) / 3),
    blits: last?.blits ?? 0,
    targets,
    targetPixels: pixels,
  };
}

const server = await serve(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const engine = option('browser', 'chromium');
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath, args: glArgs });
const result = { dist, device: deviceName, cpu, config, views: {} };
result.browser = engine;

try {
  const dpr = option('dpr', null);
  const context = await browser.newContext({
    ...DEVICES[deviceName],
    ...(dpr ? { deviceScaleFactor: Number(dpr) } : {}),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // CPU and network throttling are Chromium's (CDP); WebKit runs unthrottled.
  const client = engine === 'webkit' ? { send: async () => {}, on: () => {} } : await context.newCDPSession(page);
  await page.addInitScript(`window.__perfConfig = ${JSON.stringify(config)};`);
  await page.addInitScript({ path: fileURLToPath(new URL('./glProfiler.js', import.meta.url)) });
  // A returning visitor's sound switch says nothing here; the first visit is muted, as measured.
  if (cpu > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: cpu });

  const transfers = [];
  if (flag('load')) {
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', SLOW_4G);
    const urls = new Map();
    client.on('Network.requestWillBeSent', (event) => urls.set(event.requestId, event.request.url));
    client.on('Network.loadingFinished', (event) =>
      transfers.push({ url: urls.get(event.requestId), bytes: event.encodedDataLength, at: event.timestamp }),
    );
  }

  const started = Date.now();
  const shots = option('shots', null);
  // For screenshots the game stands still on one frame of a level, so two builds show the same picture.
  const still = shots
    ? `&seed=1&scene=level&frames=420&params=${encodeURIComponent('{"levelId":"luna","characterId":"artsy","skipIntro":true}')}`
    : '';
  await page.goto(`${base}/?debug${still}${query}`, { waitUntil: 'commit' });
  const phase = () => page.evaluate(() => document.getElementById('game')?.dataset.phase);
  const waitFor = async (probe, timeout = 120_000) => {
    const from = Date.now();
    while (!(await probe())) {
      if (Date.now() - from > timeout) throw new Error('timed out');
      await sleep(50);
    }
    return Date.now() - started;
  };
  const load = {};
  load.runningMs = await waitFor(async () => (await phase()) === 'running');
  load.roomReadyMs = await waitFor(() =>
    page.evaluate(() => document.querySelector('.room-host')?.getAttribute('data-ready') === 'true'),
  );
  const paints = await page.evaluate(() =>
    Object.fromEntries(performance.getEntriesByType('paint').map((entry) => [entry.name, Math.round(entry.startTime)])),
  );
  Object.assign(load, paints);
  if (flag('load')) {
    // Let the lazy pieces the TV view fetches behind the game arrive too.
    await sleep(8000);
    const byKind = {};
    let total = 0;
    for (const transfer of transfers) {
      const kind = extname(new URL(transfer.url).pathname) || 'html';
      byKind[kind] = (byKind[kind] ?? 0) + transfer.bytes;
      total += transfer.bytes;
    }
    load.transferBytes = total;
    load.transferByKind = byKind;
    load.requests = transfers.length;
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
  }
  load.longTasks = await page.evaluate(() =>
    window.__perf.longTasks.map((task) => ({ start: Math.round(task.start), duration: Math.round(task.duration) })),
  );
  result.load = load;
  result.renderer = await page.evaluate(() => window.__perf.renderer);
  result.timerQuery = await page.evaluate(() => window.__perf.timerQuery);

  const record = async (name, ms = seconds * 1000) => {
    await page.evaluate(() => window.__perf.start());
    const from = Date.now();
    await sleep(ms);
    const recording = await page.evaluate(() => window.__perf.stop());
    // Timer queries of the last frames land a little later.
    result.views[name] = summarise(recording, Date.now() - from);
    result.views[name].drawingBuffer = await page.evaluate(() => window.__perf.canvasSize());
    // Builds with quality tiers say what they drew at.
    result.views[name].room = await page.evaluate(() => {
      const stats = window.__room?.stats;
      return stats?.quality ? { ...stats.quality } : null;
    });
    return result.views[name];
  };
  const view = () => page.evaluate(() => document.querySelector('[data-host]')?.getAttribute('data-view'));
  const press = async (label) => {
    await page.evaluate((name) => {
      const button = [...document.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name,
      );
      if (!button) throw new Error(`No button "${name}"`);
      button.click();
    }, label);
  };

  if (shots) {
    mkdirSync(shots, { recursive: true });
    const shoot = (name) => page.screenshot({ path: join(shots, `${deviceName}-${name}.png`) });
    await sleep(1500);
    // Leaving the TV takes the startup still away; coming back shows the live set.
    await page.evaluate(() =>
      document.querySelector('.tv-way-out, .way-out')?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    await sleep(4000);
    await press('Play game');
    await sleep(3000);
    await shoot('tv');
    await page.evaluate(() =>
      document.querySelector('.tv-way-out, .way-out')?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    await sleep(16_000);
    await shoot('room');
    await press('About me (CV)');
    await sleep(7000);
    await shoot('pc');
    await page.keyboard.press('Escape');
    await press('Back to the room').catch(() => {});
    await sleep(3000);
    await press('Music by me');
    await sleep(6000);
    await shoot('radio');
    result.shots = shots;
    result.quality = await page.evaluate(() => window.__room?.stats.quality ?? null);
    console.log(JSON.stringify({ shots, quality: result.quality, errors }));
    await browser.close();
    server.close();
    process.exit(0);
  }
  // The visitor's first press: the still gives way to the live room and the game leaves its title.
  await sleep(1500);
  await page.keyboard.press('Enter');
  await sleep(2500);
  if (views.includes('tv')) {
    // A level is the game at its busiest: parallax, sprites, HUD.
    await page.evaluate(() =>
      window.__arcade?.goTo('level', { levelId: 'luna', characterId: 'artsy', autopilot: true, skipIntro: true }),
    );
    await sleep(1500);
    await record('tv-level');
    await page.evaluate(() => window.__arcade?.pause());
    await sleep(500);
    await record('tv-paused', 2000);
    await page.evaluate(() => window.__arcade?.resume());
  }
  if (views.some((name) => name !== 'tv')) {
    await page.evaluate(() =>
      document.querySelector('.tv-way-out, .way-out')?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    await record('flight-tv-room', 1400);
    await sleep(1500);
    if ((await view()) !== 'room') throw new Error(`Expected the room view, at ${await view()}`);
    if (views.includes('room')) await record('room');
    if (flag('linger')) {
      // The first look around plays the props' tour once; what the room costs after it is the resting figure.
      await sleep(12_000);
      await record('room-later');
    }
    if (views.includes('pc')) {
      await press('About me (CV)');
      await record('flight-room-pc', 1400);
      await sleep(2500);
      await record('pc', 2000);
      if (flag('linger')) {
        await sleep(8000);
        await record('pc-later');
      }
      await page.keyboard.press('Escape');
      await press('Back to the room').catch(() => {});
      await sleep(3000);
    }
    if (views.includes('radio')) {
      if ((await view()) !== 'room') throw new Error(`Expected the room view, at ${await view()}`);
      await press('Music by me');
      await record('flight-room-radio', 1400);
      await sleep(3000);
      await record('radio');
      await press('Back to the room').catch(() => {});
      await sleep(3000);
    }
    if (views.includes('hidden')) {
      // A hidden tab: what still runs.
      await client.send('Emulation.setFocusEmulationEnabled', { enabled: false }).catch(() => {});
      const other = await context.newPage();
      await other.goto('about:blank');
      await other.bringToFront();
      await record('room-hidden', 3000);
      await other.close();
    }
  }
  result.msaa = await page.evaluate(() => window.__perf.msaa.slice(-3));
  result.patched = await page.evaluate(() => window.__perf.patched);
  result.errors = errors;
} finally {
  await browser.close();
  server.close();
}

const out = option('out', null);
if (out) writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
if (flag('json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(
    `${deviceName} cpu×${cpu} ${result.renderer} load ${JSON.stringify(result.load)} msaa ${JSON.stringify(result.msaa)} patched ${JSON.stringify(result.patched)} errors ${JSON.stringify(result.errors)}`,
  );
  for (const [name, v] of Object.entries(result.views))
    console.log(
      `${name.padEnd(18)} fps ${String(v.fps).padStart(5)}  interval ${v.intervalMedianMs}/${v.intervalP95Ms} ms  page ${v.pageCpuMedianMs}/${v.pageCpuP95Ms} gl ${v.cpuMedianMs}/${v.cpuP95Ms} long ${JSON.stringify(v.longTasks)}  gpu ${v.gpuMedianMs}/${v.gpuP95Ms}  sync ${v.syncMedianMs}  ${v.room ? `${v.room.tier}×${v.room.scale} ` : ''}buf ${v.drawingBuffer?.join('x')} draws ${v.draws} tris ${v.triangles}  px ${(v.targetPixels / 1e6).toFixed(2)}M  ${JSON.stringify(v.targets)}`,
    );
}
