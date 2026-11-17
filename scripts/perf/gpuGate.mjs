#!/usr/bin/env node
// What the startup gate's question costs and answers (src/app/startup/gate, docs/ROOM.md › No GPU): a WebGL context
// asked for by a script inlined in an otherwise empty page, as the gate asks, in a new browser each time.
//   node scripts/perf/gpuGate.mjs [--runs 7] [--only gpu,phone,...]
// Prints, per launch, what each context request returned, the renderer's name, and the median and worst time of
// each step. Timing rows mean something only while no other checkout's browser is running.
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const runs = Number(option('runs', 7));
const only = option('only', null)?.split(',') ?? null;

const PAGE = `<!doctype html><meta charset=utf-8><title>gate</title><body><script>
(() => {
  const out = { steps: {} };
  const time = (name, work) => { const from = performance.now(); const value = work(); out.steps[name] = performance.now() - from; return value; };
  const name = (gl) => { if (!gl) return null; const debug = gl.getExtension('WEBGL_debug_renderer_info'); return gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER); };
  const canvas = time('canvas', () => document.createElement('canvas'));
  const strict = time('strict2', () => canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }));
  out.strict2 = strict !== null;
  out.strictRenderer = time('renderer', () => name(strict));
  time('lose', () => strict && strict.getExtension('WEBGL_lose_context') && strict.getExtension('WEBGL_lose_context').loseContext());
  // What the other requests would have said, each on a canvas of its own (not part of the gate's cost).
  const ask = (kind, attributes) => { try { const gl = document.createElement('canvas').getContext(kind, attributes); const r = { got: gl !== null, renderer: name(gl) }; if (gl) { const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); } return r; } catch (error) { return { got: false, error: String(error) }; } };
  out.strict1 = ask('webgl', { failIfMajorPerformanceCaveat: true });
  out.plain2 = ask('webgl2');
  out.plain1 = ask('webgl');
  out.total = out.steps.canvas + out.steps.strict2 + out.steps.renderer + out.steps.lose;
  window.__gate = out;
})();
</script>`;

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;

const cached = join(
  homedir(),
  'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
);
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync(cached) ? cached : undefined);
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const METAL = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const NO_SWIFTSHADER = ['--enable-unsafe-swiftshader'];

/** The launches: a GPU, and every way to be without one that this machine can stage. */
const LAUNCHES = {
  gpu: { engine: chromium, launch: { executablePath, args: METAL } },
  phone: { engine: chromium, launch: { executablePath, args: METAL }, context: PHONE, cpu: 6 },
  'gpu-headed-default': { engine: chromium, launch: { executablePath, headless: false } },
  'no-webgl': {
    engine: chromium,
    launch: { executablePath, args: ['--disable-gpu'], ignoreDefaultArgs: NO_SWIFTSHADER },
  },
  'swiftshader-fallback': {
    engine: chromium,
    launch: { executablePath, args: ['--disable-gpu', '--enable-unsafe-swiftshader'] },
  },
  'swiftshader-angle': {
    engine: chromium,
    launch: { executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  'swiftshader-phone': {
    engine: chromium,
    launch: { executablePath, args: ['--disable-gpu', '--enable-unsafe-swiftshader'] },
    context: PHONE,
    cpu: 6,
  },
  ...(existsSync(systemChrome)
    ? {
        'chrome-gpu': { engine: chromium, launch: { executablePath: systemChrome, headless: false } },
        'chrome-no-accel': {
          engine: chromium,
          launch: {
            executablePath: systemChrome,
            headless: false,
            args: ['--disable-gpu'],
            ignoreDefaultArgs: NO_SWIFTSHADER,
          },
        },
      }
    : {}),
  webkit: { engine: webkit, launch: {} },
  firefox: { engine: firefox, launch: {} },
  'firefox-no-webgl': { engine: firefox, launch: { firefoxUserPrefs: { 'webgl.disabled': true } } },
  'firefox-software': {
    engine: firefox,
    launch: {
      firefoxUserPrefs: {
        'webgl.force-enabled': true,
        'layers.acceleration.disabled': true,
        'gfx.webrender.software': true,
      },
    },
  },
};

const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1];
const ms = (value) => value.toFixed(1);

for (const [label, { engine, launch, context = {}, cpu = 1 }] of Object.entries(LAUNCHES)) {
  if (only && !only.includes(label)) continue;
  const samples = [];
  let failure = null;
  for (let run = 0; run < runs; run++) {
    let browser;
    try {
      browser = await engine.launch({ timeout: 30_000, ...launch });
      const page = await (await browser.newContext(context)).newPage();
      if (cpu > 1)
        await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
      await page.goto(url, { timeout: 30_000 });
      samples.push(await page.evaluate(() => window.__gate));
    } catch (error) {
      failure = String(error).split('\n')[0];
      break;
    } finally {
      await browser?.close().catch(() => {});
    }
  }
  if (samples.length === 0) {
    console.log(`${label}: not run (${failure})`);
    continue;
  }
  const first = samples[0];
  const step = (name) => `${ms(median(samples.map((s) => s.steps[name])))}`;
  const totals = samples.map((s) => s.total);
  console.log(
    `${label}${cpu > 1 ? ` (CPU ${cpu}x)` : ''}: strict webgl2 ${first.strict2 ? 'given' : 'null'}, strict webgl ${first.strict1.got ? 'given' : 'null'}, ` +
      `plain webgl2 ${first.plain2.got ? 'given' : 'null'}, plain webgl ${first.plain1.got ? 'given' : 'null'}\n` +
      `  renderer: ${first.strictRenderer ?? first.plain2.renderer ?? first.plain1.renderer ?? '-'}\n` +
      `  gate ms over ${samples.length} new browsers: median ${ms(median(totals))}, worst ${ms(Math.max(...totals))} ` +
      `(canvas ${step('canvas')}, context ${step('strict2')}, name ${step('renderer')}, release ${step('lose')})`,
  );
}
server.close();
