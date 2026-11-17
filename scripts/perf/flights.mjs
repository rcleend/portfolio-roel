#!/usr/bin/env node
// Measures the camera's flights on a production build, from a cold load: every frame's interval, the camera it drew
// from, and what else ran in it (scripts/perf/flightProbe.js says what is recorded).
//   node scripts/perf/flights.mjs [--dist dist] [--device desktop|phone] [--cpu 6] [--query '&quality=low']
//                                 [--leave 0|1000|10000] [--level 8000] [--press] [--path first|round|all]
//                                 [--config '{"slowGpu":48,"slowBake":48}'] [--headed] [--runs 3]
//                                 [--trace file.json] [--out file.json] [--frames] [--timeline] [--tv]
//                                 [--browser webkit] [--latency 80] [--position -205,-1200]
//   --leave   ms after the room is handed out (`ready`) at which the visitor leaves the TV (0: the same task).
//   --after-whole  ms after the whole room is lit instead (nothing waits for the bake then).
//   --level   plays a level that long first (the visitor's key, then autopilot) and leaves from it.
//   --press   the visitor's first key before leaving (the startup still goes then, not in the flight).
//   --path    first: only the first pull-back. round: then back, out again, the computer and the radio and back.
//             all: also each of those a second time and the flights straight from view to view.
//   --headed  a window on the real display (its refresh rate; the built-in one is 120 Hz), else headless at 60 Hz.
//   --frames  prints every frame of the first flight.   --tv  the TV view's frames from ready until the leave.
// A flight is judged on the frames the camera moved in: no interval over one and a half paced frames, 99 % on time.
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
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
const cpu = Number(option('cpu', deviceName === 'phone' ? 6 : 1));
const config = JSON.parse(option('config', '{}'));
const query = option('query', '');
const leaveAfterMs = Number(option('leave', 0));
const levelMs = option('level', null) === null ? null : Number(option('level'));
const path = option('path', 'first');
const runs = Number(option('runs', 1));
const tracePath = option('trace', null);
/** CPU throttling, tracing and network latency are Chromium's (CDP); WebKit runs as it is. */
const engine = option('browser', 'chromium');
const latencyMs = Number(option('latency', 0));

const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.mp3': 'audio/mpeg',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

/** The build as a host would serve it: text gzipped, everything else as it is. */
function serve(root) {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    const file = pathname === '/' ? join(root, 'index.html') : join(root, pathname);
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
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const round = (value, digits = 1) => (value === null || value === undefined ? null : Number(value.toFixed(digits)));
const median = (values) => (values.length ? [...values].sort((a, b) => a - b)[values.length >> 1] : null);

// --- What a recording says -----------------------------------------------------------------------------------------

/** The camera of each drawn frame: where it stood and its lens, from the uniforms it was drawn with. */
function cameras(drawn) {
  const frames = [];
  let eye = null;
  let lens = null;
  for (const tick of drawn) {
    eye = tick.eye ?? eye;
    lens = tick.projection ? (2 * Math.atan(1 / tick.projection[1]) * 180) / Math.PI : lens;
    if (eye && lens !== null) frames.push({ tick, camera: { position: eye, fov: lens } });
  }
  return frames;
}
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * One flight, from the room's `change` mark to its `settle`: the frames the camera moved in, their intervals against
 * the paced frame, the motion from frame to frame, and what the worst frames had in them.
 */
function flightOf(recording, change, settle, click, label) {
  const drawn = recording.ticks.filter((tick) => tick.draws > 0);
  const poses = cameras(drawn);
  // The display's own frame, from every callback's timestamp; the paced frame is what the room draws at rest.
  const all = recording.ticks.filter((tick) => tick.t >= change.at - 2000 && tick.t <= settle.at + 300);
  const display = median(all.slice(1).map((tick, i) => tick.t - all[i].t)) ?? 1000 / 60;
  const window = poses.filter((frame) => frame.tick.t >= change.at - 2 * display && frame.tick.t <= settle.at + display);
  const moved = (a, b) =>
    distance(a.camera.position, b.camera.position) > 1e-6 || Math.abs(a.camera.fov - b.camera.fov) > 1e-5;
  let first = -1;
  let last = -1;
  for (let i = 1; i < window.length; i++) {
    if (!moved(window[i - 1], window[i])) continue;
    if (first < 0) first = i;
    last = i;
  }
  const result = {
    label,
    displayMs: round(display, 2),
    waitMs: click ? round(change.at - click.at) : 0,
    toFirstMoveMs: first >= 0 ? round(window[first].tick.t - change.at) : null,
    flightMs: first >= 0 ? round(window[last].tick.t - window[first - 1].tick.t) : null,
    made: diff(change.totals, settle.totals),
  };
  if (first < 0) return { ...result, frames: 0 };
  // The flight's frames: the last one that stood still, every one that moved.
  const frames = window.slice(first - 1, last + 1);
  const steps = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const interval = b.tick.t - a.tick.t;
    steps.push({
      at: b.tick.t - frames[0].tick.t,
      interval,
      moved: distance(a.camera.position, b.camera.position),
      zoomed: b.camera.fov - a.camera.fov,
      speed: distance(a.camera.position, b.camera.position) / (interval / 1000),
      tick: b.tick,
      previous: a.tick,
    });
  }
  const intervals = steps.map((step) => step.interval);
  // Flights draw on every display frame; a paced frame is a whole number of them, at least 10.5 ms.
  const paced = Math.max(1, Math.round(median(intervals) / display)) * display;
  const limit = 1.5 * paced;
  const late = steps.filter((step) => step.interval > limit);
  const peak = Math.max(...steps.map((step) => step.speed));
  // A jump in motion: a frame whose speed (distance over the time it actually took) is off its neighbours'. A late
  // frame alone leaves it smooth: the camera is where its clock says, only shown late.
  let ripple = 0;
  for (let i = 1; i < steps.length - 1; i++) {
    const neighbours = (steps[i - 1].speed + steps[i + 1].speed) / 2;
    ripple = Math.max(ripple, Math.abs(steps[i].speed - neighbours) / peak);
  }
  const biggest = [...steps].sort((a, b) => b.moved - a.moved)[0];
  return {
    ...result,
    frames: steps.length,
    pacedMs: round(paced, 2),
    medianMs: round(median(intervals), 2),
    maxMs: round(Math.max(...intervals), 1),
    over20: intervals.filter((interval) => interval > 20).length,
    over33: intervals.filter((interval) => interval > 33).length,
    late: late.length,
    onTime: round((1 - late.length / steps.length) * 100, 1),
    speedRipple: round(ripple * 100, 1),
    biggestStepMm: round(biggest.moved * 1000, 1),
    biggestStepAt: round(biggest.at),
    worst: [...steps]
      .sort((a, b) => b.interval - a.interval)
      .slice(0, 4)
      .filter((step) => step.interval > paced * 1.2)
      .map((step) => describe(step, recording)),
    steps,
  };
}

/** What a frame's interval had in it: its own callbacks, and whatever ran between it and the frame before. */
function describe(step, recording) {
  const { tick, previous } = step;
  const between = (entry) => entry.at >= previous.end - 0.5 && entry.at < tick.end;
  const work = (frame) =>
    Object.entries(frame.work ?? {})
      .filter(([, entry]) => entry.ms >= 0.3 || entry.amount > 0)
      .map(([name, entry]) => `${name}×${entry.calls} ${entry.ms.toFixed(1)}ms${entry.amount ? ` ${entry.amount}` : ''}`);
  return {
    at: round(step.at),
    interval: round(step.interval),
    movedMm: round(step.moved * 1000, 1),
    frameCpu: round(tick.end - tick.start),
    previousCpu: round(previous.end - previous.start),
    previousGl: work(previous),
    gl: work(tick),
    tasks: recording.tasks.filter(between).map((task) => `${task.kind} ${task.ms.toFixed(1)}ms`),
    offFrameGl: recording.gl
      .filter((entry) => !entry.inFrame && between(entry))
      .map((entry) => `${entry.name} ${entry.ms.toFixed(1)}ms${entry.amount ? ` ${entry.amount}` : ''}`),
    longFrames: recording.longFrames
      .filter((entry) => entry.at < tick.end && entry.at + entry.ms > previous.end)
      .map(
        (entry) =>
          `${Math.round(entry.ms)}ms: ${entry.scripts.map((script) => `${script.invoker.split('/').pop()} ${script.fn} ${Math.round(script.ms)}`).join('; ')}`,
      ),
    events: recording.events.filter(between).map((event) => event.kind + (event.name ? ` ${event.name}` : '')),
    fetched: recording.resources
      .filter((entry) => entry.end >= previous.end && entry.end < tick.end)
      .map((entry) => entry.name),
  };
}

function diff(before, after) {
  const made = {};
  for (const key of Object.keys(after)) if (after[key] !== before[key]) made[key] = after[key] - before[key];
  return made;
}

/** The flights of a recording, in order, named by where they went from and to. */
function flights(recording) {
  const found = [];
  const counts = {};
  let from = 'tv';
  const { marks } = recording;
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    if (!mark.name.startsWith('change:')) continue;
    const to = mark.name.slice(7);
    const settle = marks.slice(i + 1).find((later) => later.name.startsWith('settle:') || later.name.startsWith('change:'));
    if (!settle?.name.startsWith('settle:')) {
      from = to;
      continue;
    }
    const click = marks.slice(0, i).findLast((earlier) => earlier.name.startsWith('click:'));
    const key = `${from}→${to}`;
    counts[key] = (counts[key] ?? 0) + 1;
    found.push(flightOf(recording, mark, settle, click && click.at > (found.at(-1)?.settledAt ?? 0) ? click : null, `${key}#${counts[key]}`));
    found.at(-1).settledAt = settle.at;
    found.at(-1).changedAt = mark.at;
    from = to;
  }
  return found;
}

function line(flight) {
  if (!flight.frames) return `${flight.label.padEnd(14)} no frames moved`;
  const made = Object.entries(flight.made)
    .map(([key, value]) => `${key}+${key.endsWith('Bytes') ? `${(value / 1e6).toFixed(2)}MB` : key.endsWith('Pixels') ? `${(value / 1e6).toFixed(2)}MP` : value}`)
    .join(' ');
  return (
    `${flight.label.padEnd(14)} wait ${String(flight.waitMs).padStart(6)}+${String(flight.toFirstMoveMs).padStart(5)} ms  ` +
    `frames ${String(flight.frames).padStart(3)} @${flight.pacedMs}  max ${String(flight.maxMs).padStart(6)}  >20:${String(flight.over20).padStart(2)} >33:${String(flight.over33).padStart(2)}  ` +
    `late ${String(flight.late).padStart(2)}  on time ${String(flight.onTime).padStart(5)}%  ripple ${String(flight.speedRipple).padStart(5)}%  step ${flight.biggestStepMm}mm@${flight.biggestStepAt}  ${made}`
  );
}

// --- The run ---------------------------------------------------------------------------------------------------------

async function run(server, index) {
  const base = `http://127.0.0.1:${server.address().port}`;
  const headed = flag('headed');
  const browser =
    engine === 'webkit'
      ? await webkit.launch({ headless: !headed })
      : await chromium.launch({
          executablePath,
          headless: !headed,
          args: [
            '--use-angle=metal',
            '--enable-gpu',
            '--ignore-gpu-blocklist',
            ...(headed ? [`--window-position=${option('position', '0,0')}`, '--window-size=1460,1000'] : []),
          ],
        });
  try {
    const context = await browser.newContext(DEVICES[deviceName]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const client = engine === 'webkit' ? { send: async () => {} } : await context.newCDPSession(page);
    const afterWhole = option('after-whole', null);
    const inPage =
      afterWhole !== null
        ? { leaveAfterWholeMs: Number(afterWhole), finishAtWhole: flag('finish') }
        : levelMs === null && !(tracePath && leaveAfterMs >= 500)
          ? { leaveAfterMs }
          : {};
    await page.addInitScript(`window.__flightConfig = ${JSON.stringify(inPage)}; window.__perfConfig = ${JSON.stringify(config)};`);
    await page.addInitScript({ path: fileURLToPath(new URL('./flightProbe.js', import.meta.url)) });
    // The room does not govern its quality under automation; glProfiler.js says it is a visitor's browser, and stands
    // in for a slow GPU when asked.
    await page.addInitScript({ path: fileURLToPath(new URL('./glProfiler.js', import.meta.url)) });
    if (cpu > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    if (latencyMs > 0) {
      // A host some way off: every response that long after its request (the lazy chunks of the first departure).
      await client.send('Network.enable');
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: latencyMs,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
    }
    const tracing = tracePath && index === 0 && engine !== 'webkit';
    // A trace's buffer fills (and then records nothing more): a leave some time after ready is traced from just
    // before it, an instant one from the page's start.
    const traceLate = tracing && (levelMs !== null || leaveAfterMs >= 500);
    const startTrace = async () => {
      mkdirSync(dirname(resolve(tracePath)), { recursive: true });
      await browser.startTracing(page, {
        path: resolve(tracePath),
        // `--trace-light`: only what says which frames were presented, for a whole run.
        categories: flag('trace-light')
          ? ['blink.user_timing', 'cc', 'benchmark', 'viz', 'gpu']
          : [
              'devtools.timeline',
              'disabled-by-default-devtools.timeline',
              'disabled-by-default-devtools.timeline.frame',
              'blink.user_timing',
              'toplevel',
              'v8',
              'disabled-by-default-v8.gc',
              'gpu',
              'viz',
              'cc',
              'benchmark',
              'loading',
            ],
      });
    };
    if (tracing && !traceLate) await startTrace();
    const marks = () => page.evaluate(() => window.__flight.marks.map((mark) => mark.name));
    const waitForMark = async (name, count = 1, timeout = 60_000) => {
      const from = Date.now();
      while ((await marks()).filter((mark) => mark === name).length < count) {
        if (Date.now() - from > timeout) throw new Error(`No "${name}" (${count}) within ${timeout} ms`);
        await sleep(40);
      }
    };
    const settled = {};
    /** Makes one flight and waits for the camera to rest, then a moment more. */
    const fly = async (to, act, dwell = 1300) => {
      settled[to] = (settled[to] ?? 0) + 1;
      await page.evaluate((name) => window.__flight.mark(`click:${name}`), to);
      await act();
      await waitForMark(`settle:${to}`, settled[to]);
      await sleep(dwell);
    };
    const press = (label) =>
      page.evaluate((name) => {
        const button = [...document.querySelectorAll('button')].find(
          (b) => b.getAttribute('aria-label') === name || b.textContent?.trim() === name,
        );
        if (!button) throw new Error(`No button "${name}"`);
        button.click();
      }, label);
    const room = (method) => page.evaluate((name) => window.__room[name](), method);

    await page.goto(`${base}/?debug${query}`, { waitUntil: 'commit' });
    await waitForMark('room-ready');
    if (levelMs !== null) {
      // The visitor's key (the still goes, the title is left), then a level played that long.
      await sleep(1500);
      await page.keyboard.press('Enter');
      await sleep(1500);
      await page.evaluate(() =>
        window.__arcade?.goTo('level', { levelId: 'luna', characterId: 'artsy', autopilot: true, skipIntro: true }),
      );
      await sleep(levelMs);
      if (traceLate) await startTrace();
      await page.evaluate(() => window.__flight.leave());
    } else if (traceLate) {
      await sleep(Math.max(0, leaveAfterMs - 300));
      await startTrace();
      await sleep(250);
      await page.evaluate(() => window.__flight.leave());
    } else if (flag('press')) {
      await sleep(Math.max(0, leaveAfterMs - 400));
      await page.keyboard.press('Enter');
    }
    settled.room = 1;
    await waitForMark('settle:room', 1, 90_000);
    await sleep(1300);
    if (tracing && !flag('trace-light')) await browser.stopTracing();
    if (path !== 'first') {
      await fly('tv', () => press('Play game'));
      await fly('room', () => page.evaluate(() => window.__flight.leave()));
      await fly('pc', () => press('About me (CV)'), 2200);
      await fly('room', () => page.keyboard.press('Escape'));
      await fly('radio', () => press('Music by me'), 3200);
      await fly('room', () => page.keyboard.press('Escape'));
    }
    if (path === 'all') {
      await fly('pc', () => press('About me (CV)'), 2200);
      await fly('room', () => page.keyboard.press('Escape'));
      await fly('radio', () => press('Music by me'), 3200);
      await fly('room', () => page.keyboard.press('Escape'));
      await fly('tv', () => room('focusTv'));
      await fly('pc', () => room('focusPc'), 2200);
      await fly('radio', () => room('focusRadio'), 3200);
      await fly('tv', () => room('focusTv'));
      await fly('radio', () => room('focusRadio'), 3200);
      await fly('pc', () => room('focusPc'), 2200);
      await fly('tv', () => room('focusTv'));
    }
    if (tracing && flag('trace-light')) await browser.stopTracing();
    const recording = await page.evaluate(() => window.__flight.read());
    recording.errors = errors;
    recording.renderer = await page.evaluate(() => window.__perf?.renderer ?? null);
    return recording;
  } finally {
    await browser.close();
  }
}

const server = await serve(dist);
const results = [];
try {
  for (let index = 0; index < runs; index++) {
    const recording = await run(server, index);
    const found = flights(recording);
    const ready = recording.marks.find((mark) => mark.name === 'room-ready');
    const whole = recording.marks.find((mark) => mark.name === 'room-whole');
    const first = found[0];
    const { quality, programs, bake } = recording.stats;
    console.log(
      `run ${index + 1}: ${engine} ${deviceName} cpu×${cpu}${query}${latencyMs ? ` latency ${latencyMs}` : ''} ${flag('headed') ? 'headed' : 'headless'} display ${first?.displayMs} ms  ${quality.tier}×${quality.scale}  ` +
        `ready ${Math.round(ready.at)} ms, whole ${whole ? Math.round(whole.at) : '—'} ms, left ${Math.round(first?.changedAt ?? 0)} ms  programs ${programs}  bake ${bake?.profile}${bake?.deferred ? ' deferred' : ''}  errors ${JSON.stringify(recording.errors)}`,
    );
    const finished = recording.marks.find((mark) => mark.name.startsWith('gpu-finished-in:'));
    if (finished) console.log(`  the GPU, made to finish as the room turned whole, took ${finished.name.slice(16)} ms`);
    for (const flight of found) console.log(line(flight));
    for (const flight of found) {
      for (const frame of flight.worst ?? []) console.log(`  ${flight.label} +${frame.at} ms: ${JSON.stringify(frame)}`);
    }
    if (flag('frames') && first?.steps) {
      for (const step of first.steps) {
        console.log(
          `    +${step.at.toFixed(1).padStart(7)}  ${step.interval.toFixed(1).padStart(6)} ms  ${(step.moved * 1000).toFixed(2).padStart(8)} mm  ${step.zoomed.toFixed(3).padStart(7)}°  cpu ${(step.tick.end - step.tick.start).toFixed(1)}  gl ${step.tick.glMs.toFixed(1)}  draws ${step.tick.draws}`,
        );
      }
    }
    if (flag('timeline') && first?.steps) {
      // What ran in the first flight besides its frames, in order: every frame that made something or took over
      // 1.5 ms, the tasks between frames, what was fetched and what the workers sent.
      const origin = first.steps[0].previous.t;
      const end = first.steps.at(-1).tick.end;
      const rows = [];
      for (const { tick } of first.steps) {
        // The TV's picture makes its mip chain in every frame it changed: not one-time work.
        const work = Object.entries(tick.work ?? {})
          .filter(([name, entry]) => name !== 'generateMipmap' || entry.calls > 1 || entry.ms > 0.3)
          .map(([name, entry]) => `${name}×${entry.calls} ${entry.ms.toFixed(1)}ms${entry.amount ? ` ${entry.amount}` : ''}`);
        if (work.length || tick.end - tick.start > 1.5)
          rows.push([tick.start, `frame cpu ${(tick.end - tick.start).toFixed(1)} draws ${tick.draws}  ${work.join(', ')}`]);
      }
      for (const entry of recording.tasks) rows.push([entry.at, `${entry.kind} ${entry.ms.toFixed(1)} ms${entry.left !== undefined ? ` (idle left ${entry.left.toFixed(1)})` : ''}`]);
      const offFrame = {};
      for (const entry of recording.gl.filter((entry) => !entry.inFrame)) {
        const bucket = (offFrame[Math.floor(entry.at / 4) * 4] ??= {});
        const item = (bucket[entry.name] ??= { calls: 0, ms: 0, amount: 0 });
        item.calls++;
        item.ms += entry.ms;
        item.amount += entry.amount;
      }
      for (const [at, names] of Object.entries(offFrame))
        rows.push([Number(at), `gl off-frame: ${Object.entries(names).map(([name, entry]) => `${name}×${entry.calls} ${entry.ms.toFixed(1)}ms${entry.amount ? ` ${entry.amount}` : ''}`).join(', ')}`]);
      for (const entry of recording.resources) rows.push([entry.end, `fetched ${entry.name} (${entry.bytes} B, asked at +${(entry.at - origin).toFixed(0)})`]);
      for (const entry of recording.events) rows.push([entry.at, `${entry.kind}${entry.name ? ` ${entry.name}` : ''}${entry.ms ? ` ${entry.ms.toFixed(0)} ms` : ''}`]);
      for (const entry of recording.longFrames) rows.push([entry.at, `long frame ${entry.ms.toFixed(0)} ms: ${entry.scripts.map((script) => `${script.invoker.split('/').pop()} ${script.fn} ${Math.round(script.ms)}`).join('; ')}`]);
      for (const mark of recording.marks) rows.push([mark.at, `— ${mark.name}`]);
      for (const [at, text] of rows.filter(([at]) => at >= origin - 250 && at <= end + 200).sort((a, b) => a[0] - b[0]))
        console.log(`    ${(at - origin).toFixed(1).padStart(8)}  ${text}`);
    }
    if (flag('tv') && first) {
      // The TV view while the room warms: the frames drawn from ready until the visitor left.
      const tv = recording.ticks.filter((tick) => tick.draws > 0 && tick.t >= ready.at && tick.t <= first.changedAt);
      const gaps = tv.slice(1).map((tick, i) => tick.t - tv[i].t);
      console.log(
        `  tv while warming: ${tv.length} frames, median ${round(median(gaps) ?? 0)} ms, max ${round(Math.max(0, ...gaps))} ms, over 20 ms ${gaps.filter((gap) => gap > 20).length}, over 33 ms ${gaps.filter((gap) => gap > 33).length}`,
      );
    }
    results.push({ flights: found.map(({ steps, ...rest }) => rest), recording: flag('raw') ? recording : undefined, stats: recording.stats });
  }
} finally {
  server.close();
}
const out = option('out', null);
if (out) {
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ dist, device: deviceName, cpu, query, config, leaveAfterMs, levelMs, path, results }, null, 1)}\n`);
}
