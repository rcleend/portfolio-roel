#!/usr/bin/env node
// The whole visit on a browser without a GPU (or with one, for the reference): a production build loaded cold, the
// game on the startup still while the room is made, a level on the TV, every view at rest and every flight, with
// frame intervals, the bake's times, memory and a screenshot of each view.
//   node scripts/perf/nogpu.mjs --dist .shots/flights/dist-base --label swiftshader-desktop
//        [--browser cft|chrome] [--args "--disable-gpu --enable-unsafe-swiftshader"] [--device desktop|phone]
//        [--viewport 1440x900] [--dsf 2] [--query '&quality=low'] [--cpu 1] [--rest 5000] [--level 6000]
//        [--early-leave] [--ecores] [--shots dir] [--out file.json] [--raw]
//   --args         the browser's GPU flags. Playwright's own `--enable-unsafe-swiftshader` is taken out unless it is
//                  given here (nogpuLib.mjs), so `--disable-gpu` alone is a visitor with hardware acceleration off.
//   --early-leave  the visitor leaves the TV the moment the room is handed out: the wait for the rest of the bake.
//                  The probe clicks the way out itself, shown or not. With --real-click the page's mouse does what a
//                  visitor can: presses on the screen until the game has begun and "Explore the room" has risen,
//                  then clicks that (a real press also hands the startup still over to the live room).
//   --quick        a level at the TV as soon as the room is in, then the room and back: frame times at a size, quickly.
//   --load-only    stops once the whole room is lit.
//   --ecores       every process of the browser demoted to the efficiency cores (`taskpolicy -b`): a slower CPU.
//   --dpr 0.5      the page is told the display's pixel ratio is this (the room then draws that many pixels a CSS
//                  pixel, on a display that stays what `--dsf` says): a lighter tier's pixel count, as it would show.
//   --reduced-motion  the visitor prefers reduced motion: every move is a cut through black, not a flight.
//   --reduce-after-landing  with --early-leave: reduced motion is switched on once the camera has landed in the room.
//   --pc           with --quick or --early-leave: the computer too (room → computer → room) at the end.
//   --leave-after 10  with --real-click: seconds between "Explore the room" rising and the click on it.
//   --moments 0.5,2,6  with --early-leave: seconds after the click at which the page is looked at and shot
//   --wait-cap 420    with --early-leave: seconds after which the wait for the camera is given up (and reported).
// Needs scripts/perf/flightProbe.js and glProfiler.js (injected, as scripts/perf/flights.mjs does).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  contentionBetween,
  DEVICES,
  ensureDir,
  gpuInfo,
  intervalStats,
  launch,
  round,
  serve,
  sleep,
  watchContention,
} from './nogpuLib.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const dist = resolve(option('dist', 'dist'));
const label = option('label', 'run');
const args = option('args', '--disable-gpu --enable-unsafe-swiftshader').split(' ').filter(Boolean);
const device = option('device', 'desktop');
const query = option('query', '');
const cpu = Number(option('cpu', 1));
const restMs = Number(option('rest', 5000));
const levelMs = Number(option('level', 6000));
const shots = option('shots', null);
const out = option('out', null);
const viewport = option('viewport', null)?.split('x').map(Number) ?? null;
const dsf = option('dsf', null);
const earlyLeave = flag('early-leave');
const dpr = option('dpr', null);
const reducedMotion = flag('reduced-motion');

/** In the page, before its scripts and after the two probes: when the page's milestones came, and a display ticker. */
const MILESTONES = `(() => {
  const N = (window.__nogpu = { at: {}, phases: [], stills: [], samples: [] });
  const note = (name) => { if (!(name in N.at)) N.at[name] = performance.now(); };
  const check = () => {
    const game = document.getElementById('game');
    if (game) {
      const phase = game.dataset.phase;
      if (N.phases.at(-1)?.phase !== phase) N.phases.push({ phase, at: performance.now() });
      if (phase === 'running') note('running');
    }
    const host = document.querySelector('[data-host]');
    if (host) {
      note('host:' + host.getAttribute('data-host'));
      if (host.getAttribute('data-ready') === 'true') note('room-ready');
    }
    const still = document.getElementById('tv-still');
    if (still) {
      const shown = still.dataset.shown ?? 'unset';
      if (N.stills.at(-1)?.shown !== shown) N.stills.push({ shown, at: performance.now() });
    }
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true });
  // The game's clock (its fixed steps, sixty a second at full speed) four times a second.
  setInterval(() => {
    const state = window.__arcade?.state();
    if (state) N.samples.push({ at: performance.now(), frame: state.frame, scene: state.scene, paused: state.paused });
  }, 250);
  // A callback on every display frame while a window is measured, so the probe has a tick for each.
  let ticking = false;
  const tick = () => { if (ticking) requestAnimationFrame(tick); };
  N.ticker = (on) => { const was = ticking; ticking = on; if (on && !was) requestAnimationFrame(tick); };
  N.now = () => performance.now();
})();`;

const median = (values) => (values.length ? [...values].sort((a, b) => a - b)[values.length >> 1] : null);
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The frames of a flight (scripts/perf/flights.mjs › flightOf): those the camera moved in, and their intervals. */
function flightOf(recording, change, settle, click, name) {
  const drawn = recording.ticks.filter((tick) => tick.draws > 0);
  const poses = [];
  let eye = null;
  let lens = null;
  for (const tick of drawn) {
    eye = tick.eye ?? eye;
    lens = tick.projection ? (2 * Math.atan(1 / tick.projection[1]) * 180) / Math.PI : lens;
    if (eye && lens !== null) poses.push({ tick, position: eye, fov: lens });
  }
  const window = poses.filter((pose) => pose.tick.t >= change.at - 200 && pose.tick.t <= settle.at + 50);
  let first = -1;
  let last = -1;
  for (let i = 1; i < window.length; i++) {
    const moved =
      distance(window[i - 1].position, window[i].position) > 1e-6 || Math.abs(window[i - 1].fov - window[i].fov) > 1e-5;
    if (!moved) continue;
    if (first < 0) first = i;
    last = i;
  }
  const result = {
    flight: name,
    waitMs: click ? round(change.at - click.at, 0) : null,
    changeToSettleMs: round(settle.at - change.at, 0),
    clickToSettleMs: click ? round(settle.at - click.at, 0) : null,
  };
  if (first < 0) return { ...result, frames: 0 };
  const frames = window.slice(first - 1, last + 1);
  const stats = intervalStats(frames.map((frame) => frame.tick.t));
  return {
    ...result,
    toFirstMoveMs: round(frames[1].tick.t - change.at, 0),
    // From the click to the first frame drawn from somewhere else (a cut's one move is the cut itself, under black).
    clickToFirstMoveMs: click ? round(frames[1].tick.t - click.at, 0) : null,
    clickToLastMoveMs: click ? round(frames.at(-1).tick.t - click.at, 0) : null,
    flightMs: stats.seconds * 1000,
    ...stats,
  };
}

function flightsOf(recording) {
  const found = [];
  const counts = {};
  let from = 'tv';
  const { marks } = recording;
  for (let i = 0; i < marks.length; i++) {
    if (!marks[i].name.startsWith('change:')) continue;
    const to = marks[i].name.slice(7);
    const settle = marks
      .slice(i + 1)
      .find((later) => later.name.startsWith('settle:') || later.name.startsWith('change:'));
    if (settle?.name.startsWith('settle:')) {
      const click = marks.slice(0, i).findLast((earlier) => earlier.name.startsWith('click:'));
      const key = `${from}→${to}`;
      counts[key] = (counts[key] ?? 0) + 1;
      const previous = found.at(-1)?.settledAt ?? 0;
      found.push({
        ...flightOf(recording, marks[i], settle, click && click.at > previous ? click : null, `${key}#${counts[key]}`),
        settledAt: settle.at,
      });
    }
    from = to;
  }
  return found.map(({ settledAt, ...rest }) => rest);
}

const server = await serve(dist);
const base = `http://127.0.0.1:${server.address().port}`;
const contextOptions = {
  ...(viewport ? { viewport: { width: viewport[0], height: viewport[1] } } : {}),
  ...(dsf ? { deviceScaleFactor: Number(dsf) } : {}),
  ...(reducedMotion ? { reducedMotion: 'reduce' } : {}),
};
const { browser, context, close } = await launch({ browser: option('browser', 'cft'), args, device, contextOptions });
const result = {
  label,
  dist,
  browser: option('browser', 'cft'),
  args,
  device,
  viewport: contextOptions.viewport ?? DEVICES[device].viewport,
  deviceScaleFactor: contextOptions.deviceScaleFactor ?? DEVICES[device].deviceScaleFactor,
  cpu,
  query,
  earlyLeave,
  dprOverride: dpr === null ? null : Number(dpr),
  reducedMotion,
  ecores: flag('ecores'),
  // What else the machine was doing: the load average (processes wanting a core) as the run began and ended.
  loadBefore: loadavg()[0],
  windows: {},
  memory: {},
  shots: {},
};
try {
  const page = await context.newPage();
  const errors = [];
  const warnings = {};
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'warning' && message.type() !== 'error') return;
    const text = message
      .text()
      .replace(/0x[0-9a-f]+/g, '0x…')
      .slice(0, 200);
    warnings[text] = (warnings[text] ?? 0) + 1;
  });
  const client = await context.newCDPSession(page);
  const browserSession = await browser.newBrowserCDPSession();
  await page.addInitScript(
    `window.__flightConfig = ${JSON.stringify(earlyLeave && !flag('real-click') ? { leaveAfterMs: 0 } : {})}; window.__perfConfig = ${JSON.stringify({ noTimerQuery: true, sync: flag('sync') })};`,
  );
  // `--probes dir`: the two probes from there (a copy of the committed ones while the working tree's are being edited).
  const here = option('probes', null) ? resolve(option('probes')) : dirname(fileURLToPath(import.meta.url));
  await page.addInitScript({ path: join(here, 'flightProbe.js') });
  await page.addInitScript({ path: join(here, 'glProfiler.js') });
  await page.addInitScript(MILESTONES);
  if (dpr !== null)
    await page.addInitScript(
      `Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => ${Number(dpr)} });`,
    );
  if (cpu > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await client.send('Performance.enable');

  const info = await gpuInfo(browser);
  result.product = info.product;
  result.featureStatus = info.featureStatus;

  /** Every process of the browser: its kind, memory (ps, resident) and CPU time so far. */
  const processes = async () => {
    const { processInfo } = await browserSession.send('SystemInfo.getProcessInfo');
    const rows = [];
    for (const entry of processInfo) {
      let rssMB = null;
      try {
        rssMB = round(
          Number(execFileSync('ps', ['-o', 'rss=', '-p', String(entry.id)], { encoding: 'utf8' }).trim()) / 1024,
          0,
        );
      } catch {}
      rows.push({ type: entry.type, pid: entry.id, rssMB, cpuS: round(entry.cpuTime, 2) });
    }
    return rows;
  };
  const memory = async (name) => {
    const { metrics } = await client.send('Performance.getMetrics');
    const of = (key) => metrics.find((metric) => metric.name === key)?.value ?? null;
    const rows = await processes();
    const byType = {};
    for (const row of rows) byType[row.type] = (byType[row.type] ?? 0) + (row.rssMB ?? 0);
    result.memory[name] = {
      jsHeapUsedMB: round(of('JSHeapUsedSize') / 1e6, 1),
      jsHeapTotalMB: round(of('JSHeapTotalSize') / 1e6, 1),
      rssMB: byType,
      rssTotalMB: Object.values(byType).reduce((sum, value) => sum + value, 0),
    };
    return rows;
  };
  if (flag('ecores')) {
    // A page of the same origin first, so the process that will run the app exists and is demoted with the rest.
    await page.goto(`${base}/CREDITS.txt`);
    for (const row of await processes()) {
      try {
        execFileSync('taskpolicy', ['-b', '-p', String(row.pid)]);
      } catch (error) {
        console.error(`taskpolicy failed for ${row.type} ${row.pid}: ${error.message}`);
      }
    }
  }

  const marks = () => page.evaluate(() => window.__flight.marks.map((mark) => mark.name));
  // Where the run is, on stderr, so a long one can be watched.
  const progress = (what) => console.error(`  [${label} +${((Date.now() - started) / 1000).toFixed(1)} s] ${what}`);
  const waitForMark = async (name, count = 1, timeout = 420_000) => {
    const from = Date.now();
    while ((await marks()).filter((mark) => mark === name).length < count) {
      if (Date.now() - from > timeout) throw new Error(`No "${name}" (${count}) within ${timeout} ms`);
      await sleep(50);
    }
  };
  const waitFor = async (probe, what, timeout = 420_000) => {
    const from = Date.now();
    while (!(await probe())) {
      if (Date.now() - from > timeout) throw new Error(`Timed out waiting for ${what}`);
      await sleep(50);
    }
  };
  const settled = {};
  const fly = async (to, act, dwell = 1500) => {
    settled[to] = (settled[to] ?? 0) + 1;
    await page.evaluate((name) => window.__flight.mark(`click:${name}`), to);
    await act();
    await waitForMark(`settle:${to}`, settled[to]);
    progress(`landed at ${to}`);
    await sleep(dwell);
  };
  const press = (name) =>
    page.evaluate((text) => {
      const button = [...document.querySelectorAll('button')].find(
        (b) => b.getAttribute('aria-label') === text || b.textContent?.trim() === text,
      );
      if (!button) throw new Error(`No button "${text}"`);
      button.click();
    }, name);
  const quality = () =>
    page.evaluate(() => {
      const stats = window.__room?.stats;
      return stats
        ? {
            tier: stats.quality.tier,
            scale: stats.quality.scale,
            pixelRatio: Number(stats.pixelRatio.toFixed(3)),
            buffer: window.__perf.canvasSize(),
          }
        : null;
    });
  /** A stretch of the visit measured: a tick on every display frame, the room's drawn frames, the game's clock. */
  const windows = [];
  const record = async (name, ms) => {
    progress(`measuring "${name}"`);
    const from = await page.evaluate(() => {
      window.__nogpu.ticker(true);
      window.__perf.start();
      return window.__nogpu.now();
    });
    const cpuBefore = await processes();
    await sleep(ms);
    const to = await page.evaluate(() => {
      window.__nogpu.ticker(false);
      return window.__nogpu.now();
    });
    // glProfiler.js's own record of the same frames: what each drew into, and with `--sync` the wait for a one-pixel
    // read after each (the GPU's time to finish the frame).
    const profiled = await page.evaluate(() => {
      const { frames } = window.__perf.stop();
      const sorted = (key) =>
        frames
          .map((frame) => frame[key])
          .filter((value) => typeof value === 'number')
          .sort((x, y) => x - y);
      const sync = sorted('syncMs');
      const last = frames.at(-1);
      let pixels = 0;
      for (const key of Object.keys(last?.targets ?? {})) {
        const [width, height] = key.split(':')[1].split('x').map(Number);
        pixels += width * height;
      }
      return {
        frames: frames.length,
        draws: last?.draws ?? null,
        targetPixelsMP: Number((pixels / 1e6).toFixed(2)),
        syncMedianMs: sync.length ? Number(sync[sync.length >> 1].toFixed(1)) : null,
        syncP95Ms: sync.length ? Number(sync[Math.floor(sync.length * 0.95)].toFixed(1)) : null,
      };
    });
    const cpuAfter = await processes();
    const cores = {};
    for (const row of cpuAfter) {
      const before = cpuBefore.find((other) => other.pid === row.pid);
      if (before) cores[row.type] = round((cores[row.type] ?? 0) + (row.cpuS - before.cpuS) / ((to - from) / 1000), 2);
    }
    windows.push({ name, from, to, cores, profiled, quality: await quality() });
  };
  const shoot = async (name) => {
    if (!shots) return;
    ensureDir(shots);
    const file = join(shots, `${label}-${name}.png`);
    await page.screenshot({ path: file });
    // A copy small enough to look at.
    const view = join(shots, `${label}-${name}-view.jpg`);
    try {
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '1280', file, '--out', view], {
        stdio: 'ignore',
      });
    } catch {}
    result.shots[name] = { file, view };
  };

  let ownPids = (await processes()).map((row) => row.pid);
  const contention = watchContention(() => ownPids);
  const refreshPids = setInterval(() => {
    processes().then(
      (rows) => {
        ownPids = rows.map((row) => row.pid);
      },
      () => {},
    );
  }, 3000);
  const started = Date.now();
  // The page's clock starts at the navigation: Date.now() of its zero, to place the machine's samples on it.
  await page.goto(`${base}/?debug${query}`, { waitUntil: 'commit' });
  const pageZero = await page.evaluate(() => Date.now() - performance.now());
  await waitFor(() => page.evaluate(() => 'running' in window.__nogpu.at), 'the game to run');
  const host = await page.evaluate(() => document.querySelector('[data-host]')?.getAttribute('data-host') ?? null);
  result.host = host;
  if (host !== 'room') throw new Error(`The page shows the ${host} host: nogpuFlat.mjs measures that visit`);
  progress('the game runs');
  if (earlyLeave) {
    // The visitor asked to leave the moment the room was handed out: what the page shows while the rest is lit.
    await waitForMark('room-ready');
    result.qualityAtReady = await quality();
    // What the page shows and says at several moments of the wait, until the camera has left.
    let readyAt = Date.now();
    const waitCap = Number(option('wait-cap', 420));
    if (flag('real-click')) {
      const size = page.viewportSize();
      let pill = null;
      let presses = 0;
      while (Date.now() - readyAt < 30_000) {
        pill = await page.evaluate(() => {
          const button = document.querySelector('.tv-way-out[data-shown="true"]');
          if (!button) return null;
          const rect = button.getBoundingClientRect();
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: button.textContent.trim() };
        });
        if (pill) break;
        await page.mouse.click(size.width / 2, size.height / 2);
        presses++;
        await sleep(250);
      }
      if (!pill) throw new Error('"Explore the room" did not rise within 30 s of presses on the screen');
      result.realClick = { pressesOnTheScreen: presses, pillAfterReadyMs: Date.now() - readyAt, pill };
      progress(
        `"${pill.text}" has risen after ${presses} presses, ${Date.now() - readyAt} ms after the room was ready`,
      );
      // `--leave-after 10`: the visitor looks at the title that many seconds before clicking the way out.
      const lingerS = Number(option('leave-after', 0));
      if (lingerS > 0) {
        await sleep(lingerS * 1000);
        result.realClick.clickedAfterReadyMs = Date.now() - readyAt;
      }
      await page.evaluate(() => window.__flight.mark('click:room'));
      await page.mouse.click(pill.x, pill.y);
      // The moments below count from the click.
      readyAt = Date.now();
    }
    const left = async () => (await marks()).includes('change:room');
    result.earlyLeaveLooks = [];
    for (const moment of option('moments', '0.5,2,6,15,30,60,120,180').split(',').map(Number)) {
      const waited = () => (Date.now() - readyAt) / 1000;
      while (waited() < moment && waited() < waitCap && !(await left())) await sleep(50);
      if ((await left()) || waited() >= waitCap) break;
      const look = await page.evaluate(() => {
        const state = window.__arcade?.state();
        return {
          at: Math.round(performance.now()),
          view: document.querySelector('.room-host')?.getAttribute('data-view'),
          still: document.getElementById('tv-still')?.dataset.shown,
          busy: [...document.querySelectorAll('[aria-busy="true"], [data-pending], [data-loading]')].map(
            (element) => element.className,
          ),
          wayOut: document.querySelector('.tv-way-out, .way-out')?.outerHTML.slice(0, 200) ?? null,
          scene: state?.scene,
          paused: state?.paused,
          gameFrame: state?.frame,
          generated: window.__room?.stats.generated,
          live: document.querySelector('[aria-live]')?.textContent?.slice(0, 120) ?? null,
        };
      });
      result.earlyLeaveLooks.push({ moment, ...look });
      console.error(`  +${moment} s: ${JSON.stringify(look)}`);
      await shoot(`early-leave-waiting-${moment}s`);
    }
    result.earlyLeaveState = result.earlyLeaveLooks.find((look) => look.moment === 2) ?? result.earlyLeaveLooks[0];
    settled.room = 1;
    // A wait that outlasts the cap is a result, not a failure of the run: what was recorded is still read.
    const landed = await waitForMark(
      'settle:room',
      1,
      Math.max(1, waitCap - (Date.now() - readyAt) / 1000) * 1000,
    ).then(
      () => true,
      () => false,
    );
    if (!landed) {
      result.earlyLeaveNeverLeftWithinS = waitCap;
      progress('the camera has not left');
      await shoot('early-leave-never-left');
    } else {
      progress('landed in the room');
      await sleep(1500);
      await shoot('early-leave-room');
      // `--reduce-after-landing`: from here on the visitor prefers reduced motion (the media query is live), so every
      // later move is a cut through black: the cuts measured without a page that was loaded that way.
      if (flag('reduce-after-landing')) {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        result.reducedMotion = 'after the first landing';
        await sleep(300);
      }
      // A short tour: the room at rest, back to the TV for a level, and out again.
      await record('room', restMs);
      await memory('room');
      await fly('tv', () => press('Play game'));
      await page.evaluate(() =>
        window.__arcade?.goTo('level', { levelId: 'luna', characterId: 'artsy', autopilot: true, skipIntro: true }),
      );
      await sleep(1500);
      await record('tv: level', levelMs);
      await shoot('tv-level');
      await memory('tv, level');
      await fly('room', () => page.evaluate(() => window.__flight.leave()));
      if (flag('pc')) {
        await fly('pc', () => press('About me (CV)'), 2500);
        await record('pc', restMs);
        await shoot('pc');
        await fly('room', () => page.keyboard.press('Escape'));
      }
    }
  } else {
    await waitForMark('room-ready');
    result.qualityAtReady = await quality();
    progress(`the room is ready: ${JSON.stringify(result.qualityAtReady)}`);
    if (!flag('quick')) {
      await waitFor(
        () => page.evaluate(() => window.__flight.marks.some((mark) => mark.name === 'room-whole')),
        'the whole room',
      );
      progress('the whole room is lit');
      await sleep(500);
      await memory('tv, whole room lit');
    }
  }
  if (flag('quick')) {
    // A level at the TV as soon as the room is in (the rest of it still being lit behind), then the room and back.
    await page.keyboard.press('Enter');
    await sleep(1500);
    await page.evaluate(() =>
      window.__arcade?.goTo('level', { levelId: 'luna', characterId: 'artsy', autopilot: true, skipIntro: true }),
    );
    await sleep(1500);
    await record('tv: level, the rest of the room still being lit', levelMs);
    await fly('room', () => page.evaluate(() => window.__flight.leave()));
    await record('room', restMs);
    await shoot('room');
    await memory('room');
    await fly('tv', () => press('Play game'));
    await sleep(1000);
    await record('tv: level', levelMs);
    await shoot('tv-level');
    await fly('room', () => page.evaluate(() => window.__flight.leave()));
    if (flag('pc')) {
      await fly('pc', () => press('About me (CV)'), 2500);
      await record('pc', restMs);
      await shoot('pc');
      await fly('room', () => page.keyboard.press('Escape'));
    }
  }
  if (!earlyLeave && !flag('load-only') && !flag('quick')) {
    // The title on the startup still, the lit room drawing underneath.
    await record('tv: title on the still', 3000);
    await shoot('tv-still-title');
    await page.keyboard.press('Enter');
    await sleep(1500);
    await page.evaluate(() =>
      window.__arcade?.goTo('level', { levelId: 'luna', characterId: 'artsy', autopilot: true, skipIntro: true }),
    );
    await sleep(1500);
    await record('tv: level', levelMs);
    await shoot('tv-level');
    await memory('tv, level');
    await fly('room', () => page.evaluate(() => window.__flight.leave()));
    await record('room', restMs);
    await shoot('room');
    await memory('room');
    await fly('tv', () => press('Play game'));
    await fly('room', () => page.evaluate(() => window.__flight.leave()));
    await fly('pc', () => press('About me (CV)'), 2500);
    await record('pc', restMs);
    await shoot('pc');
    await memory('pc');
    await fly('room', () => page.keyboard.press('Escape'));
    await fly('radio', () => press('Music by me'), 3500);
    await record('radio', restMs);
    await shoot('radio');
    await memory('radio');
    await fly('room', () => page.keyboard.press('Escape'));
    await memory('end, room');
  }
  result.totalMs = Date.now() - started;
  result.loadAfter = loadavg()[0];
  clearInterval(refreshPids);
  const machine = contention.stop();
  result.machine = { whole: contentionBetween(machine, started, Date.now()), pageZero };
  result.machineSamples = machine;

  const recording = await page.evaluate(() => window.__flight.read());
  const own = await page.evaluate(() => ({
    at: window.__nogpu.at,
    phases: window.__nogpu.phases,
    stills: window.__nogpu.stills,
    samples: window.__nogpu.samples,
    paints: Object.fromEntries(
      performance.getEntriesByType('paint').map((entry) => [entry.name, Math.round(entry.startTime)]),
    ),
    navigation: (() => {
      const [entry] = performance.getEntriesByType('navigation');
      return entry
        ? {
            responseEnd: Math.round(entry.responseEnd),
            domContentLoaded: Math.round(entry.domContentLoadedEventEnd),
            load: Math.round(entry.loadEventEnd),
          }
        : null;
    })(),
  }));
  result.renderer = await page.evaluate(() => window.__perf?.renderer ?? null);
  result.errors = errors;
  result.warnings = warnings;
  result.quality = await quality();
  result.stats = recording.stats;
  const markAt = (name) => recording.marks.find((mark) => mark.name === name)?.at ?? null;
  result.load = {
    ...own.paints,
    ...own.navigation,
    gameRunning: round(own.at.running, 0),
    roomReady: round(markAt('room-ready'), 0),
    roomWhole: round(markAt('room-whole'), 0),
    phases: own.phases.map((entry) => `${entry.phase}@${Math.round(entry.at)}`),
    still: own.stills.map((entry) => `${entry.shown}@${Math.round(entry.at)}`),
  };
  /** The game's speed in a stretch: its fixed steps a second (sixty is full speed). */
  const speed = (from, to) => {
    const inside = own.samples.filter((sample) => sample.at >= from && sample.at <= to && !sample.paused);
    if (inside.length < 2) return null;
    const a = inside[0];
    const b = inside.at(-1);
    return round((b.frame - a.frame) / ((b.at - a.at) / 1000), 1);
  };
  const stretch = (name, from, to, extra = {}) => {
    const ticks = recording.ticks.filter((tick) => tick.t >= from && tick.t <= to);
    const drawn = ticks.filter((tick) => tick.draws > 0);
    const busy = ticks.map((tick) => tick.end - tick.start);
    result.windows[name] = {
      seconds: round((to - from) / 1000, 1),
      display: intervalStats(ticks.map((tick) => tick.t)),
      room: intervalStats(drawn.map((tick) => tick.t)),
      frameCpuMedianMs: round(median(busy), 1),
      frameCpuMaxMs: round(Math.max(0, ...busy), 1),
      drawsPerFrame: median(drawn.map((tick) => tick.draws)),
      gameStepsPerSecond: speed(from, to),
      machine: contentionBetween(machine, pageZero + from, pageZero + to),
      longTasks: recording.longTasks
        .filter((task) => task.at >= from && task.at <= to)
        .map((task) => Math.round(task.ms)),
      ...extra,
    };
  };
  if (own.at.running !== undefined && markAt('room-ready') !== null)
    stretch('loading: game running → room ready', own.at.running, markAt('room-ready'));
  if (markAt('room-ready') !== null && markAt('room-whole') !== null)
    stretch('warming: room ready → whole room lit', markAt('room-ready'), markAt('room-whole'));
  if (earlyLeave && markAt('click:room') !== null && markAt('change:room') !== null)
    stretch('waiting: the click → the camera sets off', markAt('click:room'), markAt('change:room'));
  // The camera never left within the cap: the frames of the whole wait, at the TV.
  if (earlyLeave && markAt('click:room') !== null && markAt('change:room') === null && recording.ticks.length > 0)
    stretch(
      'waiting: the click → the watch ended (the camera had not left)',
      markAt('click:room'),
      recording.ticks.at(-1).t,
    );
  for (const window of windows)
    stretch(window.name, window.from, window.to, {
      cores: window.cores,
      quality: window.quality,
      profiled: window.profiled,
    });
  result.flights = flightsOf(recording);
  if (flag('raw')) result.recording = recording;
} catch (error) {
  result.error = String(error);
} finally {
  await close();
  server.close();
}

if (out) {
  ensureDir(dirname(resolve(out)));
  writeFileSync(resolve(out), `${JSON.stringify(result, null, 1)}\n`);
}
// A summary short enough to read.
const line = (stats) =>
  stats?.frames
    ? `${String(stats.fps).padStart(5)} fps  median ${String(stats.medianMs).padStart(6)}  p95 ${String(stats.p95Ms).padStart(6)}  max ${String(stats.maxMs).padStart(7)} ms  >20 ${String(stats.over20).padStart(5)}%  >33 ${String(stats.over33).padStart(5)}%  >50 ${String(stats.over50).padStart(5)}%  (${stats.frames} frames)`
    : 'no frames';
console.log(
  `${label}: ${result.product} ${args.join(' ')}  ${result.device} ${result.viewport.width}×${result.viewport.height}@${result.deviceScaleFactor} cpu×${cpu}${query}${dpr !== null ? ` dpr told ${dpr}` : ''}${reducedMotion ? ' reduced motion' : ''}${flag('ecores') ? ' ecores' : ''}`,
);
console.log(`  renderer: ${result.renderer}`);
if (result.error) console.log(`  ERROR ${result.error}`);
console.log(`  load: ${JSON.stringify(result.load)}`);
console.log(`  quality at ready ${JSON.stringify(result.qualityAtReady)}  at end ${JSON.stringify(result.quality)}`);
console.log(
  `  machine over the run: ${JSON.stringify(result.machine?.whole)}  load average ${result.loadBefore?.toFixed(1)} → ${result.loadAfter?.toFixed(1)}`,
);
if (result.stats?.bake) {
  const bake = result.stats.bake;
  console.log(
    `  bake: opening view ${Math.round(bake.shownWallMs)} ms, whole ${Math.round(bake.bakeWallMs)} ms, longest unit on the GPU ${Math.round(bake.longestGpuMs)} ms, main thread ${Math.round(bake.bakeCpuMs)} ms, ${bake.views} views, profile ${bake.profile}, marks ${JSON.stringify(bake.marks)}`,
  );
}
for (const [name, window] of Object.entries(result.windows)) {
  console.log(
    `  [${name}] ${window.seconds} s, game ${window.gameStepsPerSecond ?? '—'} steps/s, frame cpu median ${window.frameCpuMedianMs} max ${window.frameCpuMaxMs} ms, GPU process ${window.cores?.GPU ?? '—'} cores, renderer ${window.cores?.renderer ?? '—'}, other jobs ${window.machine?.otherCoresMedian ?? '—'} (max ${window.machine?.otherCoresMax ?? '—'}) cores, buffer ${window.quality?.buffer?.join('×') ?? '—'}, ${window.profiled?.draws ?? '—'} draws into ${window.profiled?.targetPixelsMP ?? '—'} MP${window.profiled?.syncMedianMs !== null && window.profiled?.syncMedianMs !== undefined ? `, GPU finishes a frame in ${window.profiled.syncMedianMs} ms (p95 ${window.profiled.syncP95Ms})` : ''}`,
  );
  console.log(`      display ${line(window.display)}`);
  console.log(`      room    ${line(window.room)}`);
}
for (const flight of result.flights ?? []) {
  console.log(
    `  ${flight.flight.padEnd(13)} wait ${String(flight.waitMs).padStart(6)} ms, ${String(flight.changeToSettleMs).padStart(5)} ms, click→first move ${flight.clickToFirstMoveMs ?? '—'}, click→settle ${flight.clickToSettleMs ?? '—'} ms  ${line(flight)}`,
  );
}
for (const [name, entry] of Object.entries(result.memory))
  console.log(
    `  memory [${name}] js heap ${entry.jsHeapUsedMB}/${entry.jsHeapTotalMB} MB, rss ${JSON.stringify(entry.rssMB)} total ${entry.rssTotalMB} MB`,
  );
for (const look of result.earlyLeaveLooks ?? [])
  console.log(`  early leave, +${look.moment} s: ${JSON.stringify(look)}`);
console.log(`  errors ${JSON.stringify(result.errors)}  warnings ${JSON.stringify(result.warnings)}`);
