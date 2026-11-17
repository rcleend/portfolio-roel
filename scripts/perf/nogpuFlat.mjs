#!/usr/bin/env node
// The visit when WebGL is refused (or the room otherwise never comes): what the page shows as it loads (every frame
// the browser presented, from a screencast), which host ends up presenting the game, how the game runs there, what
// was requested from the server, and what a visitor can still reach.
//   node scripts/perf/nogpuFlat.mjs --dist .shots/flights/dist-base --label flat-disable-gpu
//        [--browser cft|chrome] [--args "--disable-gpu"] [--device desktop|phone] [--query '&host=flat']
//        [--block 'room-']       fail every request whose URL matches (the room's chunk, say)
//        [--webgl1-only]         the page's `getContext('webgl2')` gives null (a browser with WebGL 1 alone)
//        [--slow]                Slow 4G and the CPU four times slower: the load in slow motion
//        [--level 8000] [--shots dir] [--out file.json]
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { ensureDir, gpuInfo, intervalStats, launch, round, serve, sleep, WEBGL_PROBE } from './nogpuLib.mjs';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const dist = resolve(option('dist', 'dist'));
const label = option('label', 'flat');
const args = option('args', '--disable-gpu').split(' ').filter(Boolean);
const device = option('device', 'desktop');
const query = option('query', '');
const block = option('block', null);
const levelMs = Number(option('level', 8000));
const shots = option('shots', null);
const out = option('out', null);

/** In the page before its scripts: when its milestones came, every display frame's time, the game's clock. */
const INSTRUMENT = `(() => {
  const N = (window.__nogpu = { at: {}, hosts: [], phases: [], stills: [], samples: [], ticks: [], failed: [] });
  const check = () => {
    const now = performance.now();
    const game = document.getElementById('game');
    if (game) {
      const phase = game.dataset.phase;
      if (N.phases.at(-1)?.phase !== phase) N.phases.push({ phase, at: now });
    }
    const host = document.querySelector('[data-host]')?.getAttribute('data-host') ?? null;
    if (host && N.hosts.at(-1)?.host !== host) N.hosts.push({ host, at: now });
    const still = document.getElementById('tv-still');
    if (still) {
      const shown = still.dataset.shown ?? 'unset';
      if (N.stills.at(-1)?.shown !== shown) N.stills.push({ shown, at: now });
    }
    if (document.querySelector('.tv-still__failed') && !('failed-message' in N.at)) N.at['failed-message'] = now;
    if (document.querySelector('.tv__tube--powering') && !('flat-powering' in N.at)) N.at['flat-powering'] = now;
    if (document.querySelector('.flat-host') && !document.querySelector('.tv__tube') && !('flat-lit' in N.at)) N.at['flat-lit'] = now;
  };
  new MutationObserver(check).observe(document, { subtree: true, childList: true, attributes: true });
  const raf = window.requestAnimationFrame.bind(window);
  const loop = (t) => { N.ticks.push(t); raf(loop); };
  raf(loop);
  setInterval(() => {
    const state = window.__arcade?.state();
    if (state) N.samples.push({ at: performance.now(), frame: state.frame, scene: state.scene, paused: state.paused });
  }, 250);
})();`;
const WEBGL1_ONLY = `(() => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    return type === 'webgl2' ? null : getContext.call(this, type, ...rest);
  };
  if (window.OffscreenCanvas) {
    const offscreen = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function (type, ...rest) {
      return type === 'webgl2' ? null : offscreen.call(this, type, ...rest);
    };
  }
})();`;
/** Chrome DevTools' "Slow 4G". */
const SLOW_4G = {
  offline: false,
  downloadThroughput: (1.6e6 / 8) * 0.9,
  uploadThroughput: (750e3 / 8) * 0.9,
  latency: 150,
};

const served = [];
const server = await serve(dist, served);
const base = `http://127.0.0.1:${server.address().port}`;
const { browser, context, close } = await launch({ browser: option('browser', 'cft'), args, device });
const result = {
  label,
  browser: option('browser', 'cft'),
  args,
  device,
  query,
  block,
  webgl1Only: flag('webgl1-only'),
  slow: flag('slow'),
  shots: {},
};
try {
  const page = await context.newPage();
  const errors = [];
  const consoleLines = {};
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'warning' && message.type() !== 'error') return;
    const text = message
      .text()
      .replace(/0x[0-9a-f]+/g, '0x…')
      .slice(0, 240);
    consoleLines[text] = (consoleLines[text] ?? 0) + 1;
  });
  const client = await context.newCDPSession(page);
  const browserSession = await browser.newBrowserCDPSession();
  const info = await gpuInfo(browser);
  result.product = info.product;
  result.featureStatus = {
    webgl: info.featureStatus?.webgl,
    gpu_compositing: info.featureStatus?.gpu_compositing,
    '2d_canvas': info.featureStatus?.['2d_canvas'],
  };
  await page.addInitScript(INSTRUMENT);
  if (flag('webgl1-only')) await page.addInitScript(WEBGL1_ONLY);
  if (block)
    await page.route(
      (url) => new RegExp(block).test(url.pathname),
      (route) => route.abort(),
    );

  // Every request and what came over the wire for it.
  await client.send('Network.enable');
  const requests = new Map();
  client.on('Network.requestWillBeSent', (event) =>
    requests.set(event.requestId, {
      url: new URL(event.request.url).pathname,
      at: event.timestamp,
      bytes: null,
      status: null,
    }),
  );
  client.on('Network.responseReceived', (event) => {
    const entry = requests.get(event.requestId);
    if (entry) entry.status = event.response.status;
  });
  client.on('Network.loadingFinished', (event) => {
    const entry = requests.get(event.requestId);
    if (entry) entry.bytes = event.encodedDataLength;
  });
  client.on('Network.loadingFailed', (event) => {
    const entry = requests.get(event.requestId);
    if (entry) entry.failed = event.errorText;
  });
  if (flag('slow')) {
    await client.send('Network.emulateNetworkConditions', SLOW_4G);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }

  // Every frame the browser presents while the page loads.
  const frames = [];
  let casting = true;
  client.on('Page.screencastFrame', (event) => {
    if (casting) frames.push({ wall: event.metadata.timestamp * 1000, data: event.data });
    client.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 70,
    maxWidth: 960,
    maxHeight: 960,
    everyNthFrame: 1,
  });

  const processes = async () => {
    const { processInfo } = await browserSession.send('SystemInfo.getProcessInfo');
    return processInfo.map((entry) => {
      let rssMB = null;
      try {
        rssMB = round(
          Number(execFileSync('ps', ['-o', 'rss=', '-p', String(entry.id)], { encoding: 'utf8' }).trim()) / 1024,
          0,
        );
      } catch {}
      return { type: entry.type, pid: entry.id, rssMB, cpuS: entry.cpuTime };
    });
  };
  const shoot = async (name) => {
    if (!shots) return;
    ensureDir(shots);
    const file = join(shots, `${label}-${name}.png`);
    await page.screenshot({ path: file });
    const view = join(shots, `${label}-${name}-view.jpg`);
    try {
      execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '80', '-Z', '1280', file, '--out', view], {
        stdio: 'ignore',
      });
    } catch {}
    result.shots[name] = view;
  };
  const windows = [];
  const record = async (name, ms) => {
    const from = await page.evaluate(() => performance.now());
    const before = await processes();
    await sleep(ms);
    const to = await page.evaluate(() => performance.now());
    const after = await processes();
    const cores = {};
    for (const row of after) {
      const earlier = before.find((other) => other.pid === row.pid);
      if (earlier)
        cores[row.type] = round((cores[row.type] ?? 0) + (row.cpuS - earlier.cpuS) / ((to - from) / 1000), 2);
    }
    windows.push({ name, from, to, cores });
  };

  await page.goto(`${base}/?debug${query}`, { waitUntil: 'commit' });
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const from = Date.now();
  // The game running in whichever host ends up presenting it (a room that fails gives way to the flat one).
  let state = null;
  while (Date.now() - from < 120_000) {
    state = await page.evaluate(() => ({
      host: document.querySelector('[data-host]')?.getAttribute('data-host') ?? null,
      ready: document.querySelector('.room-host')?.getAttribute('data-ready') ?? null,
      phase: document.getElementById('game')?.dataset.phase ?? null,
      flatLit: 'flat-lit' in window.__nogpu.at,
    }));
    if (state.phase === 'running' && (state.flatLit || state.ready === 'true')) break;
    if (state.phase === 'failed') break;
    await sleep(50);
  }
  result.settledAs = state;
  await sleep(flag('slow') ? 4000 : 1500);
  casting = false;
  await client.send('Page.stopScreencast');
  result.webgl = await page.evaluate(WEBGL_PROBE);

  if (state.host === 'flat' && state.phase === 'running') {
    await record('flat: boot and title', 3000);
    await shoot('title');
    await page.keyboard.press('Enter');
    await sleep(1500);
    await page.evaluate(() =>
      window.__arcade?.goTo('level', { levelId: 'luna', characterId: 'artsy', autopilot: true, skipIntro: true }),
    );
    await sleep(1500);
    await record('flat: level', levelMs);
    await shoot('level');
    const { metrics } = await (async () => {
      await client.send('Performance.enable');
      return client.send('Performance.getMetrics');
    })();
    const rows = await processes();
    const byType = {};
    for (const row of rows) byType[row.type] = (byType[row.type] ?? 0) + (row.rssMB ?? 0);
    result.memory = {
      jsHeapUsedMB: round((metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0) / 1e6, 1),
      jsHeapTotalMB: round((metrics.find((metric) => metric.name === 'JSHeapTotalSize')?.value ?? 0) / 1e6, 1),
      rssMB: byType,
      rssTotalMB: Object.values(byType).reduce((sum, value) => sum + value, 0),
    };

    // What a visitor can reach. Everything a click or a key could act on, and whether it can be seen.
    const describe = () =>
      page.evaluate(() => {
        const visible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const inView =
            rect.width > 2 &&
            rect.height > 2 &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < innerHeight &&
            rect.left < innerWidth;
          let clipped = false;
          for (let node = element; node; node = node.parentElement) {
            const s = getComputedStyle(node);
            if (
              s.visibility === 'hidden' ||
              s.display === 'none' ||
              Number(s.opacity) === 0 ||
              s.clipPath === 'inset(50%)'
            )
              clipped = true;
          }
          return inView && !clipped && style.pointerEvents !== 'none';
        };
        return [...document.querySelectorAll('a[href], button, [tabindex], input, select, audio, video')].map(
          (element) => ({
            tag: element.tagName.toLowerCase(),
            text: (element.getAttribute('aria-label') ?? element.textContent ?? '')
              .trim()
              .replace(/\\s+/g, ' ')
              .slice(0, 60),
            href: element.getAttribute('href'),
            cls: String(element.className).slice(0, 40),
            tabindex: element.getAttribute('tabindex'),
            visible: visible(element),
            inResume: Boolean(element.closest('#resume')),
          }),
        );
      });
    result.controls = await describe();
    const active = () =>
      page.evaluate(() => {
        const element = document.activeElement;
        const resume = document.getElementById('resume');
        return {
          focus: element
            ? `${element.tagName.toLowerCase()}.${String(element.className).split(' ')[0]} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)}"`
            : null,
          resumeShown: resume ? getComputedStyle(resume).position === 'fixed' : null,
          hash: location.hash,
          paused: window.__arcade?.state().paused,
        };
      });
    // The keyboard's way round the page, from the screen: Tab forwards, then back to the start and Shift+Tab.
    result.tabOrder = [await active()];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      await sleep(150);
      result.tabOrder.push(await active());
    }
    await shoot('after-four-tabs');
    // Back to the game, then the skip link (the element before the screen).
    await page.evaluate(() => {
      history.replaceState(null, '', location.pathname + location.search);
      document.querySelector('.tv__screen')?.focus();
    });
    await sleep(200);
    await page.keyboard.press('Shift+Tab');
    await sleep(200);
    result.shiftTab = await active();
    await shoot('skip-link');
    await page.keyboard.press('Enter');
    await sleep(600);
    result.afterSkipLink = await active();
    await shoot('resume');
    result.resumeLinks = await page.evaluate(() =>
      [...document.querySelectorAll('#resume a[href]')].map((a) => a.getAttribute('href')),
    );
    await page.evaluate(() =>
      [...document.querySelectorAll('#resume button')].find((b) => b.textContent.includes('Back to the game'))?.click(),
    );
    await sleep(600);
    result.afterBack = await active();
    // A mouse alone: is there anything to click that leads to the résumé, the music or the links?
    result.mouseReachable = (await describe())
      .filter((control) => control.visible)
      .map((control) => `${control.tag} "${control.text}"${control.href ? ` → ${control.href}` : ''}`);
    await sleep(3000);
  } else if (state.host === 'room') {
    // The room came after all (a reference run): let what the TV view fetches behind the game arrive.
    await sleep(8000);
    await shoot('room-tv');
  }

  const own = await page.evaluate(() => ({
    at: window.__nogpu.at,
    hosts: window.__nogpu.hosts,
    phases: window.__nogpu.phases,
    stills: window.__nogpu.stills,
    samples: window.__nogpu.samples,
    ticks: window.__nogpu.ticks,
    paints: Object.fromEntries(
      performance.getEntriesByType('paint').map((entry) => [entry.name, Math.round(entry.startTime)]),
    ),
    animations: document.getAnimations().length,
    stillStyle: (() => {
      const still = document.getElementById('tv-still');
      return still
        ? {
            shown: still.dataset.shown,
            visibility: getComputedStyle(still).visibility,
            opacity: getComputedStyle(still).opacity,
          }
        : null;
    })(),
    busy: document.querySelectorAll('[aria-busy="true"]').length,
    failedMessage: document.querySelector('.tv-still__failed')?.textContent ?? null,
    roomCanvas: Boolean(document.querySelector('.room-host canvas')),
    host: document.querySelector('[data-host]')?.getAttribute('data-host') ?? null,
  }));
  result.load = {
    ...own.paints,
    hosts: own.hosts.map((entry) => `${entry.host}@${Math.round(entry.at)}`),
    phases: own.phases.map((entry) => `${entry.phase}@${Math.round(entry.at)}`),
    still: own.stills.map((entry) => `${entry.shown}@${Math.round(entry.at)}`),
    flatPowering: round(own.at['flat-powering'], 0),
    flatLit: round(own.at['flat-lit'], 0),
    failedMessage: own.failedMessage,
  };
  result.end = {
    host: own.host,
    animationsRunning: own.animations,
    still: own.stillStyle,
    ariaBusy: own.busy,
    roomCanvas: own.roomCanvas,
  };
  result.windows = {};
  for (const window of windows) {
    const inside = own.samples.filter((sample) => sample.at >= window.from && sample.at <= window.to && !sample.paused);
    const speed =
      inside.length > 1
        ? round((inside.at(-1).frame - inside[0].frame) / ((inside.at(-1).at - inside[0].at) / 1000), 1)
        : null;
    result.windows[window.name] = {
      ...intervalStats(own.ticks.filter((t) => t >= window.from && t <= window.to)),
      gameStepsPerSecond: speed,
      cores: window.cores,
    };
  }
  // From the first frame to the game running: the frames of the load itself.
  const running = own.phases.find((entry) => entry.phase === 'running')?.at;
  if (running)
    result.windows['load: first frame → game running'] = intervalStats(own.ticks.filter((t) => t <= running));
  result.errors = errors;
  result.console = consoleLines;
  result.requests = [...requests.values()]
    .map((entry) => ({
      url: entry.url,
      status: entry.status,
      bytes: entry.bytes,
      failed: entry.failed,
      at: round((entry.at - [...requests.values()][0].at) * 1000, 0),
    }))
    .sort((a, b) => a.at - b.at);

  // The screencast: every presented frame of the load, on the page's clock; the ones that differ from the one before.
  if (shots) {
    const directory = ensureDir(join(shots, `${label}-load`));
    let last = null;
    const kept = [];
    for (const frame of frames) {
      if (frame.data === last) continue;
      last = frame.data;
      const at = Math.round(frame.wall - timeOrigin);
      const file = join(directory, `f${String(Math.max(0, at)).padStart(6, '0')}.jpg`);
      writeFileSync(file, Buffer.from(frame.data, 'base64'));
      kept.push({ at, file });
    }
    result.screencast = {
      frames: frames.length,
      distinct: kept.length,
      directory,
      times: kept.map((frame) => frame.at),
    };
    // A contact sheet of up to sixteen of them, evenly picked, each labelled with its time.
    const picked =
      kept.length <= 16 ? kept : Array.from({ length: 16 }, (_, i) => kept[Math.round((i * (kept.length - 1)) / 15)]);
    try {
      const sheet = join(shots, `${label}-load-sheet.jpg`);
      execFileSync(
        'montage',
        [
          ...picked.flatMap((frame) => ['-label', `${frame.at} ms`, frame.file]),
          '-tile',
          '4x',
          '-geometry',
          '480x+6+6',
          '-background',
          '#222',
          '-fill',
          'white',
          '-pointsize',
          '18',
          sheet,
        ],
        { stdio: 'ignore' },
      );
      result.screencast.sheet = sheet;
    } catch (error) {
      result.screencast.sheetError = String(error).slice(0, 200);
    }
  }
} catch (error) {
  result.error = String(error);
} finally {
  await close();
  server.close();
}
result.served = served.length;
if (out) {
  ensureDir(dirname(resolve(out)));
  writeFileSync(resolve(out), `${JSON.stringify(result, null, 1)}\n`);
}

const line = (stats) =>
  stats?.frames
    ? `${stats.fps} fps  median ${stats.medianMs}  p95 ${stats.p95Ms}  max ${stats.maxMs} ms  >20 ${stats.over20}%  >33 ${stats.over33}%  >50 ${stats.over50}%  (${stats.frames} frames)`
    : 'no frames';
console.log(
  `${label}: ${result.product} ${args.join(' ')} ${device}${query}${block ? ` block ${block}` : ''}${result.webgl1Only ? ' webgl1-only' : ''}${result.slow ? ' slow' : ''}`,
);
if (result.error) console.log(`  ERROR ${result.error}`);
console.log(
  `  features ${JSON.stringify(result.featureStatus)}  webgl2 ${result.webgl?.webgl2.ok} webgl ${result.webgl?.webgl.ok}`,
);
console.log(`  settled as ${JSON.stringify(result.settledAs)}`);
console.log(`  load ${JSON.stringify(result.load)}`);
console.log(`  end ${JSON.stringify(result.end)}`);
for (const [name, window] of Object.entries(result.windows ?? {}))
  console.log(
    `  [${name}] ${line(window)}  game ${window.gameStepsPerSecond ?? '—'} steps/s  cores ${JSON.stringify(window.cores ?? {})}`,
  );
if (result.memory)
  console.log(
    `  memory js heap ${result.memory.jsHeapUsedMB}/${result.memory.jsHeapTotalMB} MB, rss ${JSON.stringify(result.memory.rssMB)} total ${result.memory.rssTotalMB} MB`,
  );
const total = (result.requests ?? []).reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);
console.log(
  `  requests ${result.requests?.length}, ${(total / 1024).toFixed(0)} kB over the wire; failed or not 200: ${JSON.stringify((result.requests ?? []).filter((entry) => entry.failed || (entry.status && entry.status !== 200)).map((entry) => `${entry.url} ${entry.status ?? entry.failed}`))}`,
);
console.log(
  `  room-only files asked for: ${JSON.stringify((result.requests ?? []).filter((entry) => /room-|worker-|scene-|pictures-|RoomGuide|Spotlight|PosterWall|deckChunk|Radio|PcExperience|pcStill/.test(entry.url)).map((entry) => `${entry.url.split('/').pop()} ${entry.bytes ?? entry.failed}`))}`,
);
if (result.tabOrder) {
  console.log(
    `  tab order from the screen: ${result.tabOrder.map((step) => `${step.focus}${step.resumeShown ? ' [résumé shown]' : ''}`).join('  →  ')}`,
  );
  console.log(
    `  shift+tab from the screen: ${JSON.stringify(result.shiftTab)}; Enter on it: ${JSON.stringify(result.afterSkipLink)}; "Back to the game": ${JSON.stringify(result.afterBack)}`,
  );
  console.log(`  résumé links: ${JSON.stringify(result.resumeLinks)}`);
  console.log(`  visible to a mouse: ${JSON.stringify(result.mouseReachable)}`);
}
if (result.screencast)
  console.log(
    `  screencast: ${result.screencast.frames} frames, ${result.screencast.distinct} distinct, at ${JSON.stringify(result.screencast.times.slice(0, 40))}; sheet ${result.screencast.sheet ?? result.screencast.sheetError}`,
  );
console.log(`  errors ${JSON.stringify(result.errors)}  console ${JSON.stringify(result.console)}`);
