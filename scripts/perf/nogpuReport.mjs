#!/usr/bin/env node
// Markdown tables from the JSON that scripts/perf/nogpu.mjs writes (--out), one column of runs beside another.
//   node scripts/perf/nogpuReport.mjs run-a.json run-b.json … [--only load|windows|flights|memory]
import { readFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const files = argv.filter((arg, i) => !arg.startsWith('--') && argv[i - 1] !== '--only');
const runs = files.map((file) => JSON.parse(readFileSync(file, 'utf8')));
const cell = (value) => (value === null || value === undefined ? '—' : String(value));
const table = (head, rows) => {
  console.log(`| ${head.join(' | ')} |`);
  console.log(`| ${head.map(() => '---').join(' | ')} |`);
  for (const row of rows) console.log(`| ${row.map(cell).join(' | ')} |`);
  console.log('');
};
const seconds = (ms) => (ms === null || ms === undefined ? null : (ms / 1000).toFixed(ms < 10_000 ? 2 : 1));

if (!only || only === 'load') {
  console.log('Load (ms on the page clock unless marked s):\n');
  table(
    [
      'run',
      'renderer',
      'tier × scale, buffer',
      'first paint',
      'first contentful paint',
      'game running',
      'room ready (s)',
      'opening view bake (s)',
      'whole room lit (s)',
      'bake wall (s)',
      'other jobs (cores, median/max)',
    ],
    runs.map((run) => [
      run.label,
      /SwiftShader/.test(run.renderer ?? '')
        ? 'SwiftShader'
        : /Metal/.test(run.renderer ?? '')
          ? 'Metal'
          : run.renderer,
      run.quality ? `${run.quality.tier} × ${run.quality.scale}, ${run.quality.buffer?.join('×')}` : null,
      run.load?.['first-paint'],
      run.load?.['first-contentful-paint'],
      run.load?.gameRunning,
      seconds(run.load?.roomReady),
      seconds(run.stats?.bake?.shownWallMs),
      seconds(run.load?.roomWhole),
      seconds(run.stats?.bake?.bakeWallMs),
      run.machine?.whole ? `${run.machine.whole.otherCoresMedian}/${run.machine.whole.otherCoresMax}` : null,
    ]),
  );
}
if (!only || only === 'windows') {
  console.log('Stretches of the visit (frames of the room where it draws, else of the display):\n');
  const rows = [];
  for (const run of runs) {
    for (const [name, window] of Object.entries(run.windows ?? {})) {
      // Before the room is in, the game is on the still: the display's frames are the game's.
      const stats = name.startsWith('loading') ? window.display : window.room?.frames ? window.room : window.display;
      rows.push([
        run.label,
        name,
        window.seconds,
        stats?.fps,
        stats?.medianMs,
        stats?.p95Ms,
        stats?.maxMs,
        stats?.over20,
        stats?.over33,
        stats?.over50,
        window.gameStepsPerSecond,
        window.frameCpuMedianMs,
        window.cores?.GPU,
        window.machine ? `${window.machine.otherCoresMedian}` : null,
      ]);
    }
  }
  table(
    [
      'run',
      'stretch',
      's',
      'fps',
      'median ms',
      'p95 ms',
      'worst ms',
      '> 20 ms %',
      '> 33 ms %',
      '> 50 ms %',
      'game steps/s',
      'main thread ms/frame',
      'GPU process cores',
      'other jobs cores',
    ],
    rows,
  );
}
if (!only || only === 'flights') {
  console.log('Flights (the frames the camera moved in):\n');
  const rows = [];
  for (const run of runs) {
    for (const flight of run.flights ?? []) {
      rows.push([
        run.label,
        flight.flight,
        flight.waitMs,
        flight.frames,
        flight.fps,
        flight.medianMs,
        flight.maxMs,
        flight.over20,
        flight.over33,
        flight.over50,
      ]);
    }
  }
  table(
    [
      'run',
      'flight',
      'wait before it ms',
      'frames',
      'fps',
      'median ms',
      'worst ms',
      '> 20 ms %',
      '> 33 ms %',
      '> 50 ms %',
    ],
    rows,
  );
}
if (!only || only === 'memory') {
  console.log('Memory (MB; resident size of each process from ps):\n');
  const rows = [];
  for (const run of runs) {
    for (const [name, entry] of Object.entries(run.memory ?? {})) {
      rows.push([
        run.label,
        name,
        `${entry.jsHeapUsedMB} / ${entry.jsHeapTotalMB}`,
        entry.rssMB.renderer,
        entry.rssMB.GPU,
        entry.rssMB.browser,
        entry.rssTotalMB,
      ]);
    }
  }
  table(['run', 'where', 'JS heap used / total', 'renderer', 'GPU process', 'browser', 'all processes'], rows);
}
