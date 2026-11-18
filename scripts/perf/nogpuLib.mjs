// Shared by the scripts/perf/nogpu*.mjs drivers: a build served as a host would, a browser launched the way a visitor
// without a GPU has it, and the statistics of a run of frame intervals.
//
// Playwright adds `--enable-unsafe-swiftshader` to every Chromium it launches on macOS (playwright-core
// chromium.ts › _innerDefaultArgs), which a visitor's browser does not have: `launch` takes it out unless asked to
// keep it, so `--disable-gpu` here means what it means in a visitor's Chrome with hardware acceleration switched off.

import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { createGzip } from 'node:zlib';
import { chromium } from '@playwright/test';

export const BROWSERS = {
  // Chrome for Testing 151 (Playwright's own).
  cft: join(
    homedir(),
    'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  ),
  // The installed Google Chrome (157 here), always with a temporary profile.
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
};

export const DEVICES = {
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
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

/** The build as a host would serve it: text gzipped, everything else as it is. `log` gets every request answered. */
export function serve(root, log = null) {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    const file = pathname === '/' ? join(root, 'index.html') : join(root, pathname);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      log?.push({ path: pathname, status: 404, bytes: 0 });
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

/**
 * A headless browser as a visitor has it. `args` are the GPU's flags (`--disable-gpu`, `--disable-3d-apis`…).
 * `keepSwiftshaderFlag` leaves Playwright's `--enable-unsafe-swiftshader` in. `prefOff` instead starts a temporary
 * profile whose Local State has hardware acceleration switched off (what the checkbox in chrome://settings writes).
 * Returns { browser, context, close }.
 */
export async function launch({
  browser = 'cft',
  args = [],
  keepSwiftshaderFlag = false,
  prefOff = false,
  device = 'desktop',
  contextOptions = {},
}) {
  const executablePath = BROWSERS[browser] ?? browser;
  // `ignoreDefaultArgs` also takes out a flag given in `args`, so one asked for by name is kept.
  const ignoreDefaultArgs =
    keepSwiftshaderFlag || args.includes('--enable-unsafe-swiftshader') ? [] : ['--enable-unsafe-swiftshader'];
  const options = { ...DEVICES[device], ...contextOptions };
  // Always a temporary profile of its own, for its Local State. Chrome's Energy Saver (battery saver) caps every page
  // at 30 frames a second on a laptop running on battery at 20 % or less (measured: a blank page's frames went from
  // 30 to 121 a second with this one setting); a measurement must not depend on the machine's charge, so it is off.
  const profile = mkdtempSync(join(tmpdir(), 'nogpu-profile-'));
  const localState = {
    performance_tuning: { battery_saver_mode: { state: 0 } },
    ...(prefOff ? { hardware_acceleration_mode: { enabled: false } } : {}),
  };
  writeFileSync(join(profile, 'Local State'), JSON.stringify(localState));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath,
    headless: true,
    args,
    ignoreDefaultArgs,
    ...options,
  });
  // A persistent context opens with a blank page of its own.
  const blank = context.pages();
  return {
    browser: context.browser(),
    context,
    close: async () => {
      await context.close();
      rmSync(profile, { recursive: true, force: true });
    },
    blank,
  };
}

/** What the browser says its GPU is: the feature status of chrome://gpu and the devices (CDP SystemInfo.getInfo). */
export async function gpuInfo(browser) {
  try {
    const session = await browser.newBrowserCDPSession();
    const info = await session.send('SystemInfo.getInfo');
    const version = await session.send('Browser.getVersion');
    await session.detach();
    return {
      product: version.product,
      commandLine: info.commandLine,
      featureStatus: info.gpu.featureStatus,
      devices: info.gpu.devices.map((device) =>
        `${device.vendorString} ${device.deviceString} ${device.driverVendor ?? ''}`.trim(),
      ),
    };
  } catch (error) {
    return { error: String(error) };
  }
}

/** Run in the page: which WebGL contexts can be made and what draws them. */
export const WEBGL_PROBE = () => {
  const one = (type, attributes) => {
    try {
      const canvas = document.createElement('canvas');
      const messages = [];
      canvas.addEventListener('webglcontextcreationerror', (event) => messages.push(event.statusMessage));
      const gl = canvas.getContext(type, attributes);
      if (!gl) return { ok: false, messages };
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        ok: true,
        renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        floatTargets: Boolean(gl.getExtension('EXT_color_buffer_float')),
        halfFloatTargets: Boolean(gl.getExtension('EXT_color_buffer_half_float')),
        timerQuery: Boolean(gl.getExtension('EXT_disjoint_timer_query_webgl2')),
        parallelCompile: Boolean(gl.getExtension('KHR_parallel_shader_compile')),
      };
    } catch (error) {
      return { ok: false, threw: String(error) };
    }
  };
  return {
    webgl2: one('webgl2'),
    webgl: one('webgl'),
    webgl2NoCaveat: one('webgl2', { failIfMajorPerformanceCaveat: true }),
    canvas2d: Boolean(document.createElement('canvas').getContext('2d')),
    webgpu: 'gpu' in navigator,
    deviceMemory: navigator.deviceMemory ?? null,
    cores: navigator.hardwareConcurrency,
    webdriver: navigator.webdriver,
  };
};

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
export const round = (value, digits = 1) =>
  value === null || value === undefined || Number.isNaN(value) ? null : Number(value.toFixed(digits));

/** A run of frame times (ms on the page's clock): how many a second, the worst, the share over 20, 33 and 50 ms. */
export function intervalStats(times) {
  const gaps = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  if (gaps.length === 0) return { frames: times.length, fps: null };
  const sorted = [...gaps].sort((a, b) => a - b);
  const span = times[times.length - 1] - times[0];
  const share = (limit) => round((gaps.filter((gap) => gap > limit).length / gaps.length) * 100, 1);
  return {
    frames: gaps.length,
    seconds: round(span / 1000, 2),
    fps: round((gaps.length / span) * 1000, 1),
    medianMs: round(sorted[sorted.length >> 1], 1),
    p95Ms: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))], 1),
    maxMs: round(sorted[sorted.length - 1], 1),
    over20: share(20),
    over33: share(33),
    over50: share(50),
  };
}

/** Memory of every process of the browser launched from `executable` with `marker` in its command line (ps, in MB). */
export async function processMemory(marker) {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('ps', ['-axo', 'pid=,rss=,command='], { encoding: 'utf8', maxBuffer: 16e6 });
  const rows = [];
  for (const line of out.split('\n')) {
    if (!line.includes(marker)) continue;
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) continue;
    const command = match[3];
    const type = command.match(/--type=([\w-]+)/)?.[1] ?? 'browser';
    const sub = command.match(/--utility-sub-type=([\w.]+)/)?.[1];
    rows.push({
      pid: Number(match[1]),
      rssMB: round(Number(match[2]) / 1024, 0),
      type: sub ? `${type}:${sub.split('.').pop()}` : type,
    });
  }
  return rows;
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

/** CPU time so far of every process on the machine, in seconds, by pid (`ps`: [[dd-]hh:]mm:ss.ss). */
function cpuTimes() {
  const out = execFileSync('ps', ['-axo', 'pid=,time='], { encoding: 'utf8', maxBuffer: 16e6 });
  const times = new Map();
  for (const line of out.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
    if (!match) continue;
    const [, pid, days, hours, minutes, seconds] = match;
    times.set(
      Number(pid),
      Number(days ?? 0) * 86400 + Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds),
    );
  }
  return times;
}

/**
 * What else the machine is doing while a run is measured: every `everyMs`, the cores kept busy by the browser under
 * test (`own()` gives its pids) and by everything else. A software renderer draws on the CPU, so another job on the
 * machine is in its numbers; `stop()` returns the samples.
 */
export function watchContention(own, everyMs = 2000) {
  const samples = [];
  let last = cpuTimes();
  let lastAt = Date.now();
  const timer = setInterval(() => {
    try {
      const now = cpuTimes();
      const at = Date.now();
      const mine = new Set(own());
      let browser = 0;
      let other = 0;
      for (const [pid, time] of now) {
        if (pid === process.pid) continue;
        const spent = time - (last.get(pid) ?? time);
        if (mine.has(pid)) browser += spent;
        else other += spent;
      }
      const seconds = (at - lastAt) / 1000;
      samples.push({ at, browserCores: round(browser / seconds, 2), otherCores: round(other / seconds, 2) });
      last = now;
      lastAt = at;
    } catch {}
  }, everyMs);
  return {
    stop() {
      clearInterval(timer);
      return samples;
    },
  };
}

/** The middle and the most of the cores other jobs kept busy between two moments (Date.now()). */
export function contentionBetween(samples, from, to) {
  const inside = samples.filter((sample) => sample.at >= from && sample.at <= to + 2000);
  if (inside.length === 0) return null;
  const sorted = (key) => inside.map((sample) => sample[key]).sort((a, b) => a - b);
  const other = sorted('otherCores');
  const browser = sorted('browserCores');
  return {
    otherCoresMedian: other[other.length >> 1],
    otherCoresMax: other[other.length - 1],
    browserCoresMedian: browser[browser.length >> 1],
    browserCoresMax: browser[browser.length - 1],
  };
}
