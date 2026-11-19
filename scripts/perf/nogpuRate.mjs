#!/usr/bin/env node
// How often the browser gives a page a frame, on a blank page: the display rate headless Chromium runs at, and
// whether something (Chrome's Energy Saver on a laptop under 20 % battery, say) is holding it down.
//   node scripts/perf/nogpuRate.mjs [--browser cft|chrome] [--args "--disable-features=BatterySaverModeAvailable"]
import { intervalStats, launch } from './nogpuLib.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const args = option('args', '').split(' ').filter(Boolean);
const { context, close } = await launch({ browser: option('browser', 'cft'), args });
try {
  const page = await context.newPage();
  await page.goto('about:blank');
  const times = await page.evaluate(
    () =>
      new Promise((done) => {
        const seen = [];
        const tick = (t) => {
          seen.push(t);
          if (t - seen[0] < 3000) requestAnimationFrame(tick);
          else done(seen);
        };
        requestAnimationFrame(tick);
      }),
  );
  const early = intervalStats(times.filter((t) => t - times[0] < 1000));
  const late = intervalStats(times.filter((t) => t - times[0] >= 2000));
  console.log(
    `${option('browser', 'cft')} ${args.join(' ') || '(no flags)'}: first second ${early.fps} fps (median ${early.medianMs} ms), third second ${late.fps} fps (median ${late.medianMs} ms)`,
  );
} finally {
  await close();
}
