#!/usr/bin/env node
// Reads a trace taken by scripts/perf/flights.mjs (--trace): for every flight between the probe's `change` and
// `settle` marks, the frames the compositor expected and the ones it dropped (Chromium's own frame-sequence
// trackers: what reached the display, which the page's clock cannot see), and the longest tasks of the page's main
// thread and of the GPU process in it.
//   node scripts/perf/flightTrace.mjs trace.json [--tasks 4]   (--tasks: list tasks of at least that many ms)
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
const tasksFrom = args.includes('--tasks') ? Number(args[args.indexOf('--tasks') + 1]) : null;
// One event a line, as Chromium writes it: a trace of a slow run is larger than a string may be, so it is read line by
// line, and only what is used is kept (names, the probe's marks, the frame trackers, tasks of a millisecond or more).
const events = [];
for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Number.POSITIVE_INFINITY })) {
  if (!line.startsWith('{"')) continue;
  const quick =
    line.includes('"ph":"M"') ||
    line.includes('flight:') ||
    line.includes('"name":"Frame') ||
    line.includes('"ph":"X"');
  if (!quick) continue;
  let event;
  try {
    event = JSON.parse(line.endsWith(',') ? line.slice(0, -1) : line.replace(/\]\}?$/, ''));
  } catch {
    continue;
  }
  if (event.ph === 'X' && !(event.dur >= 1000)) continue;
  events.push(event);
}
const processes = {};
const threads = {};
for (const event of events) {
  if (event.ph !== 'M') continue;
  if (event.name === 'process_name') processes[event.pid] = event.args.name;
  if (event.name === 'thread_name') threads[`${event.pid}:${event.tid}`] = event.args.name;
}
const marks = events.filter((event) => event.name?.startsWith('flight:')).sort((a, b) => a.ts - b.ts);
/** The sequence a tracker follows (RAF, CanvasAnimation, …), by the id its frames carry. */
const trackers = {};
for (const event of events) {
  if (event.name === 'FrameSequenceTrackerV3' && event.ph === 'b')
    trackers[event.id2?.local ?? event.id] = event.args.name ?? event.args.data?.name;
}
const frames = events.filter(
  (event) => event.cat === 'cc,benchmark' && /^Frame *$/.test(event.name) && event.ph === 'b',
);

let from = 'tv';
for (let i = 0; i < marks.length; i++) {
  if (!marks[i].name.startsWith('flight:change:')) continue;
  const to = marks[i].name.slice(14);
  const settle = marks.slice(i + 1).find((mark) => /^flight:(settle|change):/.test(mark.name));
  if (!settle?.name.startsWith('flight:settle:')) continue;
  const [start, end] = [marks[i].ts, settle.ts];
  const lines = [];
  const bySequence = {};
  for (const frame of frames) {
    if (frame.ts < start || frame.ts > end) continue;
    const sequence = `${trackers[frame.id2.local] ?? frame.id2.local}${frame.name.slice(5).length}`;
    bySequence[sequence] ??= [];
    bySequence[sequence].push(frame);
  }
  for (const [name, list] of Object.entries(bySequence)) {
    if (!/^(RAF|CanvasAnimation)/.test(name)) continue;
    const first = list[0].args.data.values;
    const last = list.at(-1).args.data.values;
    const drops = [];
    let dropped = first.dropped_v4;
    for (const frame of list) {
      const now = frame.args.data.values.dropped_v4;
      if (now > dropped) drops.push(`+${Math.round((frame.ts - start) / 1000)}ms×${now - dropped}`);
      dropped = now;
    }
    lines.push(
      `${name.padEnd(17)} expected ${last.expected - first.expected}, dropped ${last.dropped_v4 - first.dropped_v4} ${drops.slice(0, 24).join(' ')}`,
    );
  }
  console.log(`${from}→${to}  ${Math.round((end - start) / 1000)} ms`);
  for (const line of [...new Set(lines)].sort()) console.log(`  ${line}`);
  if (tasksFrom !== null) {
    const long = events
      .filter((event) => event.ph === 'X' && event.ts >= start && event.ts <= end && event.dur >= tasksFrom * 1000)
      .filter((event) => /RunTask$/.test(event.name) === false)
      .map((event) => ({
        event,
        thread: `${processes[event.pid]}/${threads[`${event.pid}:${event.tid}`] ?? event.tid}`,
      }))
      .filter(({ thread }) => /CrRendererMain|CrGpuMain|VizCompositor|Compositor$/.test(thread))
      .sort((a, b) => a.event.ts - b.event.ts);
    for (const { event, thread } of long.slice(0, 60)) {
      const detail = event.args?.data?.url ?? event.args?.data?.functionName ?? event.args?.data?.type ?? '';
      console.log(
        `    +${String(Math.round((event.ts - start) / 1000)).padStart(5)} ms  ${(event.dur / 1000).toFixed(1).padStart(6)} ms  ${thread.padEnd(28)} ${event.name} ${String(detail).split('/').pop()}`,
      );
    }
  }
  from = to;
}
