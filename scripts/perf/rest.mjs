#!/usr/bin/env node
// Measures what a production build costs at rest: the camera still in each view and nobody touching anything, so two
// builds can be compared (a room that draws sixty frames a second all the time against one that draws only as often
// as what moves needs).
//   node scripts/perf/rest.mjs [--dist dist] [--device desktop|phone] [--query '&quality=low'] [--states tv-title,room]
//                              [--seconds 8] [--settle 4] [--raf 30] [--browser webkit] [--json file.json]
//                              [--label text] [--foreign .shots/flights/foreign.py]
//   node scripts/perf/rest.mjs --report file.json     prints a saved run's table again
// The states, each reached the visitor's way, left alone for `--settle` seconds and then measured for `--seconds`:
//   tv-still      the TV view before any input: the title playing flat on the startup still, the lit room under it
//   tv-title      the TV view after the hand-over to the live room (the visitor's first key), the game on its title
//   tv-paused     the same with the game's loop paused (`__arcade.pause()`, what the room does to it away from the TV)
//   tv-level      a level running with no input, the character standing
//   room          the room view
//   pc            at the computer
//   radio-afloat  at the radio, from 1 s to 6 s after the camera landed (the discs float)
//   radio-still   at the radio, from 12 s after the landing on (the float has wound down), no music
// The room is whole (`stats.generated` is `ready`) before the first state, and the work it keeps for idle moments
// (`stats.backgroundPending`) is waited for before a state settles: the game is paused once on its title for it, so
// tv-paused is measured before tv-title. A row's notes say whatever was not as the state should be: a quality that
// changed in the window, idle work still pending, a camera not at rest, a page not in front.
// Per state: the frames the room drew a second (`stats.framesRendered`) and the ones that issued WebGL draw calls
// (scripts/perf/glProfiler.js), the intervals between those (their median, the worst, how many of each length to
// 0.1 ms and how many display frames apart they came: a resting room's frames should be evenly spaced, all two
// apart or all four, not a mix), the GPU's time for them (a timer query: a frame's, and summed over a second), the
// main thread's busy time a second (CDP `Performance.getMetrics`: all tasks, scripts, and
// from the page the time inside frame callbacks), the frame callbacks that ran (a page that keeps the display's frame
// loop awake runs them even when it draws nothing), the game's steps, and the CPU the page's processes took.
// The energy proxy is renderer + GPU-process CPU-seconds per second (cores busy) on this Mac, with the GPU's own
// milliseconds a second beside it. It is not watts and not battery life: it says which of two builds asks for less.
// Needs the GPU (headless Chromium on ANGLE/Metal, with a profile whose Energy Saver is off, nogpuLib.mjs). The CPU
// is this Mac's, never throttled: the proxy is the work a build asks for, and a throttle's stalls are not that.
// `--raf 30` stands in for a display that hands out thirty frames a second (flightProbe.js's cap, as in flights.mjs):
// the real display still ticks underneath and the cap's own callback runs on every tick, so its CPU figures carry that.
// `--browser webkit` is a best effort: no timer query, no CDP, and the processes' CPU from `ps`.
// A timing counts only if nothing else measured on the machine meanwhile. On a shared Mac run it under the machine's
// lock, `python3 .shots/flights/quiet.py run 4 "rest" -- node scripts/perf/rest.mjs …`, which waits for the others,
// watches the run and prints its verdict after the table (the header then says the run held the lock). Without the
// lock, `--foreign` names .shots/flights/foreign.py: the script waits with it until no other measurement runs, has
// it watch the run and puts its verdict in the header.
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { webkit } from '@playwright/test';
import { launch, round, serve, sleep } from './nogpuLib.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const STATES = ['tv-still', 'tv-title', 'tv-paused', 'tv-level', 'room', 'pc', 'radio-afloat', 'radio-still'];
const dist = resolve(option('dist', 'dist'));
const deviceName = option('device', 'desktop');
const query = option('query', '');
const seconds = Number(option('seconds', 8));
const settleMs = Number(option('settle', 4)) * 1000;
const rafHz = option('raf', null) === null ? null : Number(option('raf'));
const engine = option('browser', 'chromium');
const label = option('label', '');
const wanted = option('states', STATES.join(','))
  .split(',')
  .map((name) => name.trim())
  .filter(Boolean);
const want = (name) => wanted.includes(name);

/** profile.mjs's devices. */
const DEVICES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  'phone-landscape': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
/** The real GPU, as profile.mjs asks for it. */
const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
/** The radio's states count from the landing (docs/ROOM.md › The CD player › Motion). */
const RADIO_AFLOAT_MS = { from: 1000, to: 6000 };
const RADIO_STILL_FROM_MS = 12_000;
/** How long a state waits for the room's idle work before it settles anyway (and says so). */
const QUIET_CAP_MS = 20_000;

const unknown = wanted.filter((name) => !STATES.includes(name));
if (!option('report', null) && (unknown.length > 0 || !DEVICES[deviceName] || !existsSync(join(dist, 'index.html')))) {
  console.error(
    unknown.length > 0
      ? `Unknown state ${unknown.join(', ')}: one of ${STATES.join(', ')}`
      : DEVICES[deviceName]
        ? `No build at ${dist}`
        : `Unknown device ${deviceName}: one of ${Object.keys(DEVICES).join(', ')}`,
  );
  process.exit(2);
}

const median = (values) => (values.length ? [...values].sort((a, b) => a - b)[values.length >> 1] : null);
const sum = (values) => values.reduce((total, value) => total + value, 0);

// --- In the page -----------------------------------------------------------------------------------------------------

/**
 * Injected after glProfiler.js: counts the frame callbacks that run (and the display frames that had one), notes the
 * camera's landings, and reads the room's and the game's own account of themselves together with the page's clock.
 */
function restProbe() {
  const R = { calls: 0, frames: 0, last: -1, settles: [], changes: [] };
  window.__rest = R;
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((now) => {
      R.calls++;
      if (now !== R.last) {
        R.last = now;
        R.frames++;
      }
      callback(now);
    });
  R.watch = () => {
    window.__room.onSettle((view) => R.settles.push({ view, at: performance.now() }));
    window.__room.onViewChange((view) => R.changes.push({ view, at: performance.now() }));
  };
  /** The interval of the frames the page is given (ms), over 48 of them. */
  R.display = () =>
    new Promise((done) => {
      const seen = [];
      const tick = (now) => {
        seen.push(now);
        if (seen.length <= 48) window.requestAnimationFrame(tick);
        else {
          const gaps = seen
            .slice(1)
            .map((time, i) => time - seen[i])
            .sort((a, b) => a - b);
          done(gaps[gaps.length >> 1]);
        }
      };
      window.requestAnimationFrame(tick);
    });
  R.read = () => {
    const room = window.__room;
    const stats = room?.stats;
    const game = window.__arcade?.state();
    const still = document.getElementById('tv-still');
    return {
      at: performance.now(),
      rafCalls: R.calls,
      rafFrames: R.frames,
      framesRendered: stats?.framesRendered ?? null,
      quality: stats ? `${stats.quality.tier}×${stats.quality.scale}` : null,
      qualityChanges: stats?.qualityChanges ?? null,
      pixelRatio: stats?.pixelRatio ?? null,
      buffer: window.__perf?.canvasSize() ?? null,
      display: stats?.display ? { ...stats.display } : null,
      // Builds that rest say how (`full`, `rest`, `still`) and what moves; older ones have no such field.
      pace: stats?.pace ? { ...stats.pace, moving: [...stats.pace.moving] } : null,
      lavaRunning: stats?.lavaRunning ?? null,
      radioAmbient: stats?.radioAmbient ?? null,
      backgroundPending: stats?.backgroundPending ?? null,
      generated: stats?.generated ?? null,
      view: room?.view ?? null,
      settled: room?.settled ?? null,
      scene: game?.scene ?? null,
      paused: game?.paused ?? null,
      gameFrame: game?.frame ?? null,
      visible: document.visibilityState === 'visible',
      focused: document.hasFocus(),
      // The startup still is up until it has faded out (older builds say no more than that it is hidden).
      stillUp: still ? !(still.dataset.shown === 'false' && getComputedStyle(still).visibility === 'hidden') : false,
      resources: performance.getEntriesByType('resource').length,
      animations: document.getAnimations().filter((animation) => animation.playState === 'running').length,
    };
  };
}

// --- The measurement -------------------------------------------------------------------------------------------------

const execFileAsync = promisify(execFile);
/**
 * CPU time so far of every process on the machine, in seconds (`ps`: [[dd-]hh:]mm:ss.ss), by pid, with what each
 * runs and when that was read. nogpuLib.mjs's way of telling how busy the machine is, without holding this process
 * up meanwhile: a `ps` that takes its time on a loaded machine must not stretch the window being measured.
 */
async function psProcesses() {
  const from = Date.now();
  const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,time=,command='], { maxBuffer: 32e6 });
  const rows = new Map();
  for (const line of stdout.split('\n')) {
    const found = line.trim().match(/^(\d+)\s+(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\s+(.*)$/);
    if (!found) continue;
    const [, pid, days, hours, minutes, secs, command] = found;
    rows.set(Number(pid), {
      cpuS: Number(days ?? 0) * 86400 + Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(secs),
      command,
    });
  }
  return { at: (from + Date.now()) / 2, rows };
}
/** The cores every process but `own` kept busy between two readings (one that began in between is not counted). */
function otherCores(before, after, own) {
  let spent = 0;
  for (const [pid, row] of after.rows) {
    const earlier = before.rows.get(pid);
    if (earlier && !own.has(pid)) spent += row.cpuS - earlier.cpuS;
  }
  return spent / ((after.at - before.at) / 1000);
}
/**
 * Another measurement on the machine, as .shots/flights/foreign.py tells one: a browser of Playwright's or a test
 * run that is not `own` (a browser's helpers and its crash handler are not runs of their own). Their names.
 */
const MEASURING = [
  'vitest',
  'playwright test',
  'chrome-headless-shell',
  'Chrome for Testing',
  'ms-playwright',
  'playwright/lib',
];
function strangers(reading, own) {
  const names = new Set();
  for (const [pid, { command }] of reading.rows) {
    if (own.has(pid) || /--type=|crashpad|foreign\.py|quiet\.py/.test(command)) continue;
    const name = MEASURING.find((mark) => command.includes(mark));
    if (name) names.add(name);
  }
  return [...names].sort();
}
/** Playwright's WebKit: its helpers are launchd's children, so the run's own are the ones that were not there before. */
const WEBKIT_PROCESS = /ms-playwright\/webkit|com\.apple\.WebKit\.(WebContent|GPU|Networking)/;
const webkitType = (command) =>
  command.includes('WebKit.WebContent')
    ? 'renderer'
    : command.includes('WebKit.GPU')
      ? 'GPU'
      : command.includes('WebKit.Networking')
        ? 'network'
        : 'browser';

/**
 * The intervals between drawn frames: their middle, the worst, how many there were of each length to 0.1 ms, and the
 * same counted in display frames of `tickMs` (a headless display's clock wanders by a fraction of a millisecond under
 * load, which scatters the first count and not the second). `evenPct` is the share of the intervals that are the
 * commonest number of display frames long: 100 is an evenly spaced run.
 */
function spacing(times, tickMs) {
  const gaps = times.slice(1).map((time, i) => time - times[i]);
  if (gaps.length === 0)
    return { medianMs: null, maxMs: null, minMs: null, evenPct: null, withinHalfMsPct: null, histogram: {}, ticks: {} };
  const count = (keys) => {
    const counts = new Map();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0] - b[0]);
  };
  const middle = median(gaps);
  const ticks = count(gaps.map((gap) => Math.max(1, Math.round(gap / tickMs))));
  return {
    medianMs: round(middle, 2),
    maxMs: round(Math.max(...gaps), 2),
    minMs: round(Math.min(...gaps), 2),
    evenPct: round((Math.max(...ticks.map(([, n]) => n)) / gaps.length) * 100, 1),
    withinHalfMsPct: round((gaps.filter((gap) => Math.abs(gap - middle) <= 0.5).length / gaps.length) * 100, 1),
    histogram: Object.fromEntries(
      count(gaps.map((gap) => Math.round(gap * 10) / 10)).map(([ms, n]) => [ms.toFixed(1), n]),
    ),
    tickMs: round(tickMs, 2),
    ticks: Object.fromEntries(ticks),
  };
}

async function measureBuild() {
  const started = Date.now();
  const progress = (what) => console.error(`  [rest +${((Date.now() - started) / 1000).toFixed(1)} s] ${what}`);
  const index = readFileSync(join(dist, 'index.html'));
  const result = {
    label,
    dist: relative(process.cwd(), dist) || '.',
    build: {
      index: createHash('sha1').update(index).digest('hex').slice(0, 8),
      builtAt: statSync(join(dist, 'index.html')).mtime.toISOString(),
    },
    engine,
    device: deviceName,
    viewport: DEVICES[deviceName].viewport,
    deviceScaleFactor: DEVICES[deviceName].deviceScaleFactor,
    query,
    rafHz,
    seconds,
    settleSeconds: settleMs / 1000,
    startedAt: new Date(started).toISOString(),
    loadAverageBefore: round(loadavg()[0], 2),
    states: {},
  };
  try {
    result.power = execFileSync('pmset', ['-g', 'batt'], { encoding: 'utf8' }).match(/'([^']+)'/)?.[1] ?? null;
    result.battery = execFileSync('pmset', ['-g', 'batt'], { encoding: 'utf8' }).match(/(\d+)%/)?.[1] ?? null;
  } catch {}
  const server = await serve(dist);
  const base = `http://127.0.0.1:${server.address().port}`;
  let close = async () => {};
  try {
    const webkitBefore = engine === 'webkit' ? new Set((await psProcesses()).rows.keys()) : null;
    let context;
    let browser;
    if (engine === 'webkit') {
      browser = await webkit.launch();
      context = await browser.newContext(DEVICES[deviceName]);
      close = () => browser.close();
    } else {
      const launched = await launch({
        browser: process.env.CHROMIUM_PATH ?? 'cft',
        args: GPU_ARGS,
        contextOptions: DEVICES[deviceName],
      });
      ({ context, browser, close } = launched);
    }
    result.browser = `${engine} ${browser.version()}`;
    const page = await context.newPage();
    // The one page of the browser, in front for the whole run.
    for (const other of context.pages()) if (other !== page) await other.close();
    await page.bringToFront();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const client = engine === 'webkit' ? null : await context.newCDPSession(page);
    const browserSession = engine === 'webkit' ? null : await browser.newBrowserCDPSession();
    await client?.send('Performance.enable');

    const here = dirname(fileURLToPath(import.meta.url));
    if (rafHz !== null) {
      // WebKit's frames here do not sit on a display's grid: there every nth of them is a tick (flightProbe.js).
      const rafEvery = engine === 'webkit' ? Math.max(1, Math.round(60 / rafHz)) : 0;
      await page.addInitScript(`window.__flightConfig = ${JSON.stringify({ rafHz, rafEvery })};`);
      await page.addInitScript({ path: join(here, 'flightProbe.js') });
    }
    // The room does not govern its quality under automation; glProfiler.js says it is a visitor's browser.
    await page.addInitScript({ path: join(here, 'glProfiler.js') });
    await page.addInitScript(restProbe);

    /** Every process of the browser: its kind and its CPU time so far, and when that was read. */
    const processes = async () => {
      if (!browserSession) {
        // WebKit: the helpers that were not there before the launch, by `ps`.
        const { at, rows } = await psProcesses();
        return {
          at,
          rows: [...rows]
            .filter(([pid, row]) => WEBKIT_PROCESS.test(row.command) && !webkitBefore.has(pid))
            .map(([pid, row]) => ({ type: webkitType(row.command), pid, cpuS: row.cpuS })),
        };
      }
      const from = Date.now();
      const { processInfo } = await browserSession.send('SystemInfo.getProcessInfo');
      return {
        at: (from + Date.now()) / 2,
        rows: processInfo.map((entry) => ({ type: entry.type, pid: entry.id, cpuS: entry.cpuTime })),
      };
    };
    /** The main thread's time so far in tasks and in scripts (s), by the browser's clock. */
    const mainThread = async () => {
      if (!client) return null;
      const { metrics } = await client.send('Performance.getMetrics');
      const of = (name) => metrics.find((metric) => metric.name === name)?.value ?? null;
      return {
        at: of('Timestamp'),
        task: of('TaskDuration'),
        script: of('ScriptDuration'),
        layout: of('LayoutDuration'),
        style: of('RecalcStyleDuration'),
      };
    };

    const read = () => page.evaluate(() => window.__rest.read());
    const waitFor = async (probe, what, timeout) => {
      const from = Date.now();
      while (!(await probe())) {
        if (Date.now() - from > timeout) throw new Error(`timed out after ${timeout / 1000} s waiting for ${what}`);
        await sleep(50);
      }
    };
    /** Waits for the camera to rest at `view`; returns when it landed, on the page's clock. */
    const landed = async (view, timeout = 60_000) => {
      await waitFor(
        () => page.evaluate((name) => window.__room.view === name && window.__room.settled, view),
        `the camera to land at ${view}`,
        timeout,
      );
      const at = await page.evaluate((name) => window.__rest.settles.findLast((s) => s.view === name)?.at, view);
      progress(`landed at ${view}`);
      return at ?? (await page.evaluate(() => performance.now()));
    };
    /** Waits for the work the room keeps for idle moments; ms it took, or null when it was still pending at the cap. */
    const quiet = async (cap = QUIET_CAP_MS) => {
      const from = Date.now();
      while (Date.now() - from < cap) {
        if (!(await page.evaluate(() => window.__room.stats.backgroundPending))) return Date.now() - from;
        await sleep(250);
      }
      return null;
    };
    /** Clicks the button of that name (its label or its text) once the page has it, as profile.mjs does. */
    const press = async (name, timeout = 15_000) => {
      const click = (text) => {
        const button = [...document.querySelectorAll('button')].find(
          (b) => b.getAttribute('aria-label') === text || b.textContent?.trim() === text,
        );
        button?.click();
        return Boolean(button);
      };
      await waitFor(() => page.evaluate(click, name), `the button "${name}"`, timeout);
    };

    /** One state's window: `ms` of the page left alone, between two readings of everything. */
    const measure = async (name, ms, expected, notes = []) => {
      progress(`measuring ${name} for ${ms / 1000} s`);
      const flags = [...notes];
      // The machine's other jobs, read as the window begins and ends (not waited for: the window is the page's).
      const machineBefore = psProcesses().catch(() => null);
      const before = await page.evaluate(() => {
        window.__perf.start();
        return window.__rest.read();
      });
      const cpuBefore = await processes();
      const mainBefore = await mainThread();
      await sleep(ms);
      const mainAfter = await mainThread();
      const cpuAfter = await processes();
      const after = await page.evaluate(() => {
        const reading = window.__rest.read();
        window.__perf.stop();
        return reading;
      });
      const machine = await Promise.all([machineBefore, psProcesses().catch(() => null)]);
      const own = new Set([process.pid, ...cpuAfter.rows.map((row) => row.pid)]);
      // The timer queries of the last frames land a little later; a page that draws nothing more is asked again.
      await sleep(250);
      const recording = await page.evaluate(() => {
        const { frames, rafCpu, rafTimes } = window.__perf.stop();
        const last = frames.at(-1);
        const ticks = rafTimes
          .slice(1)
          .map((time, i) => time - rafTimes[i])
          .sort((a, b) => a - b);
        let pixels = 0;
        for (const key of Object.keys(last?.targets ?? {})) {
          const [width, height] = key.split(':')[1].split('x').map(Number);
          pixels += width * height;
        }
        return {
          timerQuery: window.__perf.timerQuery,
          times: frames.map((frame) => frame.at),
          gpuMs: frames.map((frame) => (typeof frame.gpuMs === 'number' ? frame.gpuMs : null)),
          draws: last?.draws ?? null,
          targetPixels: pixels,
          inCallbacksMs: rafCpu.reduce((total, value) => total + value, 0),
          // The middle interval of the display frames that had a callback.
          tickMs: ticks.length ? ticks[ticks.length >> 1] : null,
        };
      });

      const elapsed = (after.at - before.at) / 1000;
      const perSecond = (a, b) => (a === null || b === null ? null : (b - a) / elapsed);
      const timed = recording.gpuMs.filter((value) => value !== null);
      const drawn = recording.times.length;
      // A frame whose query was lost (the GPU's clock was disjoint) counts as the mean of the ones timed.
      const gpuMsPerSecond = !recording.timerQuery
        ? null
        : drawn === 0
          ? 0
          : timed.length === 0
            ? null
            : ((sum(timed) / timed.length) * drawn) / elapsed;
      const cores = {};
      const cpuSpan = (cpuAfter.at - cpuBefore.at) / 1000;
      for (const row of cpuAfter.rows) {
        const earlier = cpuBefore.rows.find((other) => other.pid === row.pid);
        if (earlier) cores[row.type] = (cores[row.type] ?? 0) + (row.cpuS - earlier.cpuS) / cpuSpan;
      }
      // The display's frame as this window saw it, where the page ran a callback on (nearly) every one of them; else
      // as it was measured before the first state.
      const rafFrames = perSecond(before.rafFrames, after.rafFrames);
      const tickMs = recording.tickMs && rafFrames >= 900 / result.displayMs ? recording.tickMs : result.displayMs;
      const mainSpan = mainBefore && mainAfter ? mainAfter.at - mainBefore.at : null;
      const mainMs = (key) => (mainSpan ? ((mainAfter[key] - mainBefore[key]) * 1000) / mainSpan : null);
      const haveCores = cpuAfter.rows.length > 0 && cpuBefore.rows.length > 0;

      // What would make this window something else than the state at rest.
      if (before.quality !== after.quality) flags.push(`QUALITY CHANGED ${before.quality} → ${after.quality}`);
      if (String(before.buffer) !== String(after.buffer)) flags.push(`buffer ${before.buffer} → ${after.buffer}`);
      for (const reading of [before, after]) {
        const when = reading === before ? 'at the start' : 'at the end';
        if (reading.view !== expected.view || !reading.settled)
          flags.push(`view ${reading.view}${reading.settled ? '' : ' (flying)'} ${when}`);
        if (expected.scene && reading.scene !== expected.scene) flags.push(`scene ${reading.scene} ${when}`);
        if (reading.paused !== expected.paused) flags.push(`game ${reading.paused ? 'paused' : 'running'} ${when}`);
        if (!reading.visible || !reading.focused) flags.push(`page not visible and focused ${when}`);
        if (reading.generated !== 'ready') flags.push(`room ${reading.generated} ${when}`);
        if (reading.stillUp !== (expected.stillUp ?? false))
          flags.push(`startup still ${reading.stillUp ? 'up' : 'gone'} ${when}`);
      }
      if (before.backgroundPending || after.backgroundPending)
        flags.push(
          `idle work pending ${before.backgroundPending ? (after.backgroundPending ? 'throughout' : 'at the start (it ran)') : 'at the end'}`,
        );
      if (recording.timerQuery && timed.length < drawn) flags.push(`${drawn - timed.length} frames without a GPU time`);
      // Seen at the window's two ends only; the lock's (or foreign.py's) watch is what says a run was alone.
      const others = machine.map((reading) => (reading ? strangers(reading, own) : []));
      if (others[0].length + others[1].length > 0)
        flags.push(
          `ANOTHER MEASUREMENT ALIVE ${others[0].length ? (others[1].length ? 'throughout' : 'at the start') : 'at the end'}: ${[...new Set(others.flat())].join(', ')}`,
        );
      if (after.resources > before.resources) flags.push(`${after.resources - before.resources} files fetched`);
      const paceOf = (reading) =>
        reading.pace
          ? `${reading.pace.pace}${reading.pace.why ? `(${reading.pace.why})` : ''}${reading.pace.pace === 'rest' ? ` ${round(reading.pace.rate, 0)}/s` : ''}${reading.pace.moving.length ? ` ${reading.pace.moving.join('+')}` : ''}`
          : null;

      result.states[name] = {
        seconds: round(elapsed, 2),
        measuredFromMs: round(before.at, 0),
        fps: round(perSecond(before.framesRendered, after.framesRendered), 1),
        glFps: round(drawn / elapsed, 1),
        framesDrawn: drawn,
        spacing: spacing(recording.times, tickMs),
        gpuMsPerFrame: round(median(timed), 2),
        gpuMsPerSecond: round(gpuMsPerSecond, 1),
        gpuFramesTimed: timed.length,
        mainMsPerSecond: round(mainMs('task'), 1),
        scriptMsPerSecond: round(mainMs('script'), 1),
        layoutMsPerSecond: round(mainSpan ? mainMs('layout') + mainMs('style') : null, 1),
        inCallbacksMsPerSecond: round(recording.inCallbacksMs / elapsed, 1),
        rafPerSecond: round(perSecond(before.rafCalls, after.rafCalls), 1),
        rafFramesPerSecond: round(rafFrames, 1),
        gameStepsPerSecond: round(perSecond(before.gameFrame, after.gameFrame), 1),
        cores: Object.fromEntries(Object.entries(cores).map(([type, value]) => [type, round(value, 3)])),
        rendererCores: haveCores ? round(cores.renderer ?? 0, 3) : null,
        gpuProcessCores: haveCores ? round(cores.GPU ?? 0, 3) : null,
        // The energy proxy: CPU-seconds per second of the renderer and the GPU process together. Not watts.
        energyProxy: haveCores ? round((cores.renderer ?? 0) + (cores.GPU ?? 0), 3) : null,
        otherJobsCores: machine[0] && machine[1] ? round(otherCores(machine[0], machine[1], own), 2) : null,
        otherMeasurements: { start: others[0], end: others[1] },
        quality: { start: before.quality, end: after.quality, changes: after.qualityChanges - before.qualityChanges },
        buffer: after.buffer,
        drawsPerFrame: recording.draws,
        targetMegapixels: round(recording.targetPixels / 1e6, 2),
        display: after.display,
        pace: before.pace || after.pace ? { start: paceOf(before), end: paceOf(after), raw: after.pace } : null,
        animations: { start: before.animations, end: after.animations },
        lavaRunning: after.lavaRunning,
        radioAmbient: { start: before.radioAmbient, end: after.radioAmbient },
        backgroundPending: { start: before.backgroundPending, end: after.backgroundPending },
        flags,
        raw: {
          before,
          after,
          frameTimes: recording.times.map((time) => round(time, 2)),
          gpuMs: recording.gpuMs.map((value) => round(value, 3)),
          processes: { before: cpuBefore, after: cpuAfter },
          mainThread: { before: mainBefore, after: mainAfter },
        },
      };
    };
    const skip = (names, error) => {
      const why = String(error?.message ?? error);
      progress(`skipping ${names.join(', ')}: ${why}`);
      for (const name of names) if (want(name) && !result.states[name]) result.states[name] = { skipped: why };
    };
    /**
     * Leaves the page alone for the settle time, then measures. Idle work that turned up meanwhile (the room view
     * fetches the radio's player a few seconds after the camera lands) is waited for and the page left alone again,
     * three times at most.
     */
    const rest = async (name, expected, { again = true } = {}) => {
      await sleep(settleMs);
      for (let round = 0; again && round < 3 && (await read()).backgroundPending; round++) {
        progress(`${name}: idle work turned up, settling again`);
        await quiet();
        await sleep(settleMs);
      }
      await measure(name, seconds * 1000, expected);
    };

    // --- The visit ---
    await page.goto(`${base}/?debug${query}`, { waitUntil: 'commit' });
    await waitFor(
      () => page.evaluate(() => document.getElementById('game')?.dataset.phase === 'running'),
      'the game to run',
      60_000,
    );
    await waitFor(() => page.evaluate(() => Boolean(window.__room)), 'the room to be ready', 120_000);
    await page.evaluate(() => window.__rest.watch());
    result.renderer = await page.evaluate(() => window.__perf.renderer);
    result.timerQuery = await page.evaluate(() => window.__perf.timerQuery);
    progress(`the room is ready: ${result.renderer}`);
    await waitFor(
      () => page.evaluate(() => window.__room.stats.generated === 'ready'),
      'the whole room to be lit',
      240_000,
    );
    progress('the whole room is lit');
    result.displayMs = round(await page.evaluate(() => window.__rest.display()), 2);
    result.qualityAtStart = (await read()).quality;

    // The TV, before any input: the title on the startup still.
    if (want('tv-still')) {
      try {
        if (!(await read()).stillUp) throw new Error('the startup still had already gone when the room was whole');
        // The room keeps its uploads for a quiet moment, and a title that plays is none: they stay pending here.
        await quiet(4000);
        await rest('tv-still', { view: 'tv', scene: 'title', paused: false, stillUp: true }, { again: false });
      } catch (error) {
        skip(['tv-still'], error);
      }
    }
    // The visitor's first key: the still gives way to the live room and the game leaves its title (profile.mjs).
    const tv = ['tv-title', 'tv-paused', 'tv-level'];
    try {
      await page.keyboard.press('Enter');
      // A still that stays is not the end of the run: every state it covers says so.
      await waitFor(async () => !(await read()).stillUp, 'the startup still to go', 10_000).then(
        () => progress('the still has gone'),
        (error) => progress(String(error.message)),
      );
      await page.evaluate(() => window.__arcade.goTo('title'));
      await sleep(500);
      // A paused game is a quiet moment: whatever the room kept for one is made now, before any state is measured.
      await page.evaluate(() => window.__arcade.pause());
      const waited = await quiet();
      progress(waited === null ? 'idle work still pending' : `idle work done after ${waited} ms`);
      if (want('tv-paused')) await rest('tv-paused', { view: 'tv', scene: 'title', paused: true });
      await page.evaluate(() => window.__arcade.resume());
      // (While the game plays the room keeps its idle work, so there is no settling again for it here.)
      if (want('tv-title')) await rest('tv-title', { view: 'tv', scene: 'title', paused: false }, { again: false });
      if (want('tv-level')) {
        // No autopilot: nobody plays, the character stands where the level put it.
        await page.evaluate(() =>
          window.__arcade.goTo('level', { levelId: 'luna', characterId: 'artsy', skipIntro: true }),
        );
        await rest('tv-level', { view: 'tv', scene: 'level', paused: false }, { again: false });
      }
    } catch (error) {
      skip(tv, error);
    }

    if (['room', 'pc', 'radio-afloat', 'radio-still'].some(want)) {
      try {
        await page.evaluate(() => document.querySelector('.tv-way-out, .way-out').click());
        await landed('room', 120_000);
        if (want('room')) {
          await quiet();
          await rest('room', { view: 'room', paused: true });
        }
      } catch (error) {
        skip(['room', 'pc', 'radio-afloat', 'radio-still'], error);
      }
    }
    const inRoom = async () => {
      const now = await read();
      return now.view === 'room' && now.settled;
    };
    const radio = ['radio-afloat', 'radio-still'].filter(want);
    if (want('pc') && !result.states.pc) {
      try {
        await press('About me (CV)');
        await landed('pc');
        await quiet();
        await rest('pc', { view: 'pc', paused: true });
      } catch (error) {
        skip(['pc'], error);
      }
      // Back the visitor's way (Escape), or however the room will have it.
      try {
        await page.keyboard.press('Escape');
        await sleep(300);
        if ((await read()).view !== 'room') await page.evaluate(() => window.__room.showRoom());
        await landed('room');
        await sleep(1000);
      } catch (error) {
        skip(radio, error);
      }
    }
    if (radio.some((name) => result.states[name])) {
      // Already given up on.
    } else if (radio.length > 0 && (await inRoom())) {
      try {
        await press('Music by me');
        const landing = await landed('radio');
        const until = async (ms) => {
          const now = await page.evaluate(() => performance.now());
          const late = now - (landing + ms);
          if (late < 0) await sleep(-late);
          return late > 100 ? [`started ${Math.round(late)} ms late`] : [];
        };
        if (want('radio-afloat')) {
          const notes = await until(RADIO_AFLOAT_MS.from);
          await measure(
            'radio-afloat',
            RADIO_AFLOAT_MS.to - RADIO_AFLOAT_MS.from,
            { view: 'radio', paused: true },
            notes,
          );
        }
        if (want('radio-still')) {
          const notes = await until(RADIO_STILL_FROM_MS);
          await measure('radio-still', seconds * 1000, { view: 'radio', paused: true }, notes);
        }
      } catch (error) {
        skip(['radio-afloat', 'radio-still'], error);
      }
    } else if (radio.length > 0) skip(radio, 'the camera is not in the room view');

    const end = await read();
    result.qualityAtEnd = end.quality;
    result.qualityChanges = end.qualityChanges;
    result.display = end.display;
    result.errors = errors;
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    await close().catch(() => {});
    server.close();
  }
  result.loadAverageAfter = round(loadavg()[0], 2);
  result.totalSeconds = round((Date.now() - started) / 1000, 1);
  return result;
}

// --- The report (the parent process) ---------------------------------------------------------------------------------

/** Runs foreign.py; its last line. A `wait` says every half minute that it still waits. */
function python(args, { saying = null, capMs }) {
  return new Promise((done) => {
    const child = spawn('python3', args, { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    const from = Date.now();
    const tell = saying
      ? setInterval(() => console.error(`  [rest] ${saying}: ${Math.round((Date.now() - from) / 1000)} s`), 30_000)
      : null;
    const cap = setTimeout(() => child.kill(), capMs);
    child.on('close', () => {
      clearInterval(tell);
      clearTimeout(cap);
      done(out.trim().split('\n').filter(Boolean));
    });
    python.running.add(child);
    child.on('exit', () => python.running.delete(child));
  });
}
python.running = new Set();

const cell = (value, digits = 1) =>
  value === null || value === undefined ? '—' : typeof value === 'number' ? value.toFixed(digits) : String(value);
/** The commonest of a count's entries, as `what×how often`. */
const commonest = (counts, most) => {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const shown = entries.slice(0, most).map(([what, count]) => `${what}×${count}`);
  return entries.length > most ? `${shown.join(' ')} +${entries.length - most}` : shown.join(' ') || '—';
};
/** The columns whose cells are words: set left, the numbers right. */
const WORDS = new Set(['state', 'apart×n', 'gaps ms×n', 'quality', 'pace', 'lava', 'float', 'notes']);

function report(result, alone) {
  const hz = result.displayMs ? round(1000 / result.displayMs, 1) : null;
  const when = new Date(result.startedAt).toLocaleString('sv-SE');
  const quality =
    result.qualityAtStart === result.qualityAtEnd
      ? result.qualityAtStart
      : `${result.qualityAtStart} → ${result.qualityAtEnd} (${result.qualityChanges} changes)`;
  console.log(
    `rest${result.label ? ` [${result.label}]` : ''}: build ${result.dist} (index ${result.build.index}, built ${new Date(result.build.builtAt).toLocaleString('sv-SE')}) · ${result.browser} · ${result.device} ${result.viewport.width}×${result.viewport.height}@${result.deviceScaleFactor}${result.query ? ` ${result.query}` : ''}${result.rafHz ? ` · display capped to ${result.rafHz}/s (stand-in)` : ''} · quality ${quality} · display ${hz ?? '—'}/s (the room expects a frame every ${result.display ? round(result.display.frameMs, 1) : '—'} ms${result.display?.capped ? ', capped' : ''}) · ${when} · ${alone.watch}`,
  );
  console.log(
    `  ${result.renderer ?? 'no renderer'} · GPU timer query ${result.timerQuery ? 'yes' : 'n/a'} · power ${result.power ?? '—'}${result.battery ? ` ${result.battery}%` : ''} · load average ${result.loadAverageBefore} → ${result.loadAverageAfter} · before the launch: ${alone.wait ?? 'not waited'} · ${result.settleSeconds} s settled, ${result.seconds} s measured, ${result.totalSeconds} s in all`,
  );
  if (/swiftshader|llvmpipe|software/i.test(result.renderer ?? ''))
    console.log(
      '  WARNING: a software renderer drew this, not the GPU: none of it says what a visitor with a GPU pays.',
    );
  for (const line of alone.seen) console.log(`  ${line}`);
  for (const line of [
    'PROXY = renderer + GPU-process CPU cores busy (CPU-seconds per second; rend, gpup): an energy PROXY on this Mac, not watts, not battery life.',
    "gpu/s = the GPU's ms per second for the room's WebGL frames (timer query; gpu/f is a frame's, the median). other = cores other jobs kept busy.",
    'fps = frames the room counted, gl/s = frames that issued draw calls; gap = ms between those, median/worst; apart×n = how many display frames',
    'apart they came × how often (even = the share of the commonest); gaps ms×n = the same in ms, to 0.1 ms, the commonest three.',
    'raf/s = display frames on which a frame callback ran, cb/s = callbacks run; main/s, js/s = main-thread ms per second in tasks, in scripts;',
    'in-cb/s = ms per second inside frame callbacks; game/s = game steps; anim = CSS/Web animations running; float = the radio says its discs float.',
  ])
    console.log(`  ${line}`);

  const yes = (value) => (value === null ? '—' : value ? 'yes' : 'no');
  const ends = (pair, say = cell) => (pair.start === pair.end ? say(pair.end) : `${say(pair.start)}→${say(pair.end)}`);
  const head = [
    ...['state', 'fps', 'gl/s', 'gap ms', 'even', 'apart×n', 'gaps ms×n', 'raf/s', 'cb/s', 'game/s', 'main/s', 'js/s'],
    ...[
      'in-cb/s',
      'gpu/f',
      'rend',
      'gpup',
      'PROXY',
      'gpu/s',
      'other',
      'quality',
      'pace',
      'lava',
      'float',
      'anim',
      'notes',
    ],
  ];
  const rows = [head];
  const measured = STATES.filter((name) => result.states[name] && !result.states[name].skipped);
  for (const name of measured) {
    const state = result.states[name];
    const { spacing: gaps } = state;
    // What only Chromium can say is n/a elsewhere, not a nought.
    const chromium = (value, digits) => (value === null && result.engine === 'webkit' ? 'n/a' : cell(value, digits));
    const timed = (value, digits) => (result.timerQuery ? cell(value, digits) : 'n/a');
    rows.push([
      name,
      cell(state.fps),
      cell(state.glFps),
      `${cell(gaps.medianMs)}/${cell(gaps.maxMs)}`,
      gaps.evenPct === null ? '—' : `${gaps.evenPct.toFixed(0)}%`,
      commonest(gaps.ticks, 3),
      commonest(gaps.histogram, 3),
      cell(state.rafFramesPerSecond),
      cell(state.rafPerSecond, 0),
      cell(state.gameStepsPerSecond),
      chromium(state.mainMsPerSecond),
      chromium(state.scriptMsPerSecond),
      cell(state.inCallbacksMsPerSecond),
      timed(state.gpuMsPerFrame, 2),
      cell(state.rendererCores, 2),
      cell(state.gpuProcessCores, 2),
      cell(state.energyProxy, 2),
      timed(state.gpuMsPerSecond),
      cell(state.otherJobsCores),
      ends(state.quality),
      state.pace ? ends(state.pace) : '—',
      yes(state.lavaRunning),
      ends(state.radioAmbient, yes),
      ends(state.animations, (value) => cell(value, 0)),
      state.flags.join('; '),
    ]);
  }
  const widths = head.map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  for (const row of rows)
    console.log(
      row
        .map((text, column) => (WORDS.has(head[column]) ? text.padEnd(widths[column]) : text.padStart(widths[column])))
        .join('  ')
        .trimEnd(),
    );
  for (const name of STATES)
    if (result.states[name]?.skipped) console.log(`${name}: SKIPPED, ${result.states[name].skipped}`);
  if (result.error) console.log(`ERROR ${result.error}`);
  if (result.errors?.length) console.log(`page errors: ${JSON.stringify(result.errors)}`);
}

async function run() {
  const here = fileURLToPath(import.meta.url);
  const asked = option('foreign', null);
  const foreign = asked && existsSync(asked) ? resolve(asked) : null;
  // Under the machine's shared lock (quiet.py run) the waiting and the watching are the lock's, not this script's.
  const locked = process.env.FM_QUIET_HELD === '1';
  const alone = {
    lock: locked,
    wait: null,
    watch: locked ? "under the machine's lock (quiet.py: its verdict follows the table)" : 'not watched',
    seen: [],
  };
  let result;
  if (!foreign) result = await measureBuild();
  else {
    let child = null;
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'])
      process.on(signal, () => {
        child?.kill('SIGTERM');
        for (const helper of python.running) helper.kill();
        process.exit(130);
      });
    // Nothing else measuring: foreign.py waits for that (ten minutes at most, and says which it is).
    alone.wait = (
      await python([foreign, 'wait'], { saying: 'waiting for other measurements to end', capMs: 660_000 })
    ).at(-1);
    // The measurement in a process of its own: foreign.py tells a run's browsers from others' by their ancestor, and
    // gives its verdict when that ancestor is gone (twenty minutes at most).
    child = spawn(process.execPath, [here, ...argv, '--child'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    const watching = python([foreign, 'watch', String(child.pid), ...(engine === 'webkit' ? ['webkit'] : [])], {
      capMs: 1_260_000,
    });
    const code = await new Promise((done) => child.on('close', done));
    const lines = await watching;
    alone.watch = lines.at(-1) ?? 'the watch said nothing';
    alone.seen = lines.slice(0, -1);
    try {
      result = JSON.parse(out.trim().split('\n').at(-1));
    } catch {
      console.error(out);
      console.error(`The measurement ended (${code}) without a result`);
      process.exit(1);
    }
  }
  result.alone = alone;
  report(result, alone);
  const jsonPath = option('json', null);
  if (jsonPath) {
    mkdirSync(dirname(resolve(jsonPath)), { recursive: true });
    writeFileSync(resolve(jsonPath), `${JSON.stringify(result, null, 1)}\n`);
  }
  process.exit(result.error ? 1 : 0);
}

if (option('report', null)) {
  const saved = JSON.parse(readFileSync(resolve(option('report')), 'utf8'));
  report(saved, saved.alone);
} else if (flag('child')) process.stdout.write(`${JSON.stringify(await measureBuild())}\n`);
else await run();
