#!/usr/bin/env node
// Frame time against pixels on the software renderer, from the JSON of several `nogpu.mjs --quick` runs: one row a
// run and a stretch, and a straight line through them (ms = fixed + per megapixel × megapixels) with the pixel counts
// it gives for 30 and 60 frames a second.
//   node scripts/perf/nogpuPixels.mjs run-a.json run-b.json … [--fit "label,label"]
// `--fit` names the runs the line goes through (all of them otherwise).
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const fitOnly = argv.includes('--fit') ? argv[argv.indexOf('--fit') + 1].split(',') : null;
const files = argv.filter((arg, i) => !arg.startsWith('--') && argv[i - 1] !== '--fit');
const runs = files.map((file) => JSON.parse(readFileSync(file, 'utf8')));
const cell = (value) => (value === null || value === undefined ? '—' : String(value));
const table = (head, rows) => {
  console.log(`| ${head.join(' | ')} |`);
  console.log(`| ${head.map(() => '---').join(' | ')} |`);
  for (const row of rows) console.log(`| ${row.map(cell).join(' | ')} |`);
  console.log('');
};

const rows = [];
const points = {};
for (const run of runs) {
  const surface = (run.viewport.width * run.deviceScaleFactor * run.viewport.height * run.deviceScaleFactor) / 1e6;
  for (const [name, window] of Object.entries(run.windows ?? {})) {
    if (name.startsWith('loading') || name.startsWith('warming') || name.startsWith('waiting')) continue;
    const stats = window.room?.frames ? window.room : window.display;
    const buffer = window.quality?.buffer;
    const megapixels = buffer ? (buffer[0] * buffer[1]) / 1e6 : null;
    // The mean interval is what a frame rate is; the median is beside it for the frames' usual length.
    const meanMs = stats?.fps ? 1000 / stats.fps : null;
    rows.push([
      run.label,
      `${run.viewport.width}×${run.viewport.height} @ ${run.deviceScaleFactor}${run.dprOverride ? `, told ${run.dprOverride}` : ''}${run.ecores ? ', efficiency cores' : ''}`,
      buffer?.join('×'),
      megapixels?.toFixed(3),
      surface.toFixed(2),
      name,
      stats?.fps,
      meanMs?.toFixed(1),
      stats?.medianMs,
      stats?.p95Ms,
      stats?.maxMs,
      window.gameStepsPerSecond,
      window.cores?.GPU,
      window.cores?.renderer,
      window.machine?.otherCoresMedian,
    ]);
    if (megapixels !== null && meanMs !== null && (!fitOnly || fitOnly.includes(run.label)) && !run.ecores) {
      points[name] ??= [];
      points[name].push([megapixels, meanMs, run.label]);
    }
  }
}
table(
  [
    'run',
    'window (CSS px @ device scale)',
    'drawing buffer',
    'MP drawn',
    'MP of the page’s surface',
    'stretch',
    'fps',
    'mean ms',
    'median ms',
    'p95 ms',
    'worst ms',
    'game steps/s',
    'GPU process cores',
    'renderer cores',
    'other jobs cores',
  ],
  rows,
);

console.log('A line through the runs, per stretch (least squares on the mean frame interval):\n');
const fits = [];
for (const [name, list] of Object.entries(points)) {
  if (list.length < 2) continue;
  const n = list.length;
  const sx = list.reduce((sum, [x]) => sum + x, 0);
  const sy = list.reduce((sum, [, y]) => sum + y, 0);
  const sxx = list.reduce((sum, [x]) => sum + x * x, 0);
  const sxy = list.reduce((sum, [x, y]) => sum + x * y, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const fixed = (sy - slope * sx) / n;
  const worst = Math.max(...list.map(([x, y]) => Math.abs(fixed + slope * x - y)));
  const at = (ms) => (ms > fixed ? ((ms - fixed) / slope).toFixed(3) : 'never (the fixed part alone is longer)');
  fits.push([name, n, fixed.toFixed(1), slope.toFixed(1), worst.toFixed(1), at(1000 / 30), at(1000 / 60)]);
}
table(
  ['stretch', 'runs', 'fixed ms', 'ms per MP', 'furthest run from the line (ms)', 'MP for 30 fps', 'MP for 60 fps'],
  fits,
);
