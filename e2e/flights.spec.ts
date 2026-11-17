import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { GPU_LAUNCH_ARGS } from './gpu';

/**
 * The first flight away from the TV, from a cold load (docs/ROOM.md › Flights): nothing is made in its frames, none
 * of them comes late and the camera moves by its clock. The page is recorded by the probe the measurements use
 * (scripts/perf/flightProbe.js, injected ahead of the page's own scripts): every display frame, the camera the room
 * drew from in it, and what WebGL was asked to make.
 */
const PROBE = fileURLToPath(new URL('../scripts/perf/flightProbe.js', import.meta.url));

test.use({ launchOptions: { args: GPU_LAUNCH_ARGS }, viewport: { width: 1440, height: 900 } });

interface Tick {
  readonly t: number;
  readonly draws: number;
  readonly eye: readonly [number, number, number] | null;
}
interface Mark {
  readonly at: number;
  readonly name: string;
  readonly totals: Readonly<Record<string, number>>;
}
interface Recording {
  readonly ticks: readonly Tick[];
  readonly marks: readonly Mark[];
}
type Probed = Window & { __flight: { marks: Mark[]; read(): Recording } };

/** Loads the page cold, leaves the TV `leaveAfterMs` after the room is ready and records until the camera rests. */
async function coldFirstFlight(page: Page, leaveAfterMs: number): Promise<Recording> {
  await page.addInitScript(`window.__flightConfig = ${JSON.stringify({ leaveAfterMs })};`);
  await page.addInitScript({ path: PROBE });
  // A phone's main thread: what the flight leaves a slow one to do shows as late frames.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.goto('/?seed=1');
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Probed).__flight.marks.map((mark) => mark.name)), {
      timeout: 90_000,
    })
    .toContain('settle:room');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return page.evaluate(() => (window as unknown as Probed).__flight.read());
}

const distance = (a: readonly number[], b: readonly number[]): number =>
  Math.hypot(...a.map((value, i) => value - (b[i] ?? 0)));

/** The flight's frames (the last that stood still and every one that moved) and what was made between its marks. */
function flightOf(recording: Recording) {
  const change = recording.marks.find((mark) => mark.name === 'change:room');
  const settle = recording.marks.find((mark) => mark.name === 'settle:room');
  if (!change || !settle) throw new Error('No flight to the room was recorded');
  // The camera of each drawn frame: a frame that uploaded none was drawn from where the last stood.
  let eye: readonly [number, number, number] | null = null;
  const drawn: { t: number; eye: readonly [number, number, number] }[] = [];
  for (const tick of recording.ticks) {
    if (tick.draws === 0) continue;
    eye = tick.eye ?? eye;
    if (eye && tick.t >= change.at - 50 && tick.t <= settle.at + 50) drawn.push({ t: tick.t, eye });
  }
  const moves = drawn.map((frame, i) =>
    i > 0 && distance(frame.eye, (drawn[i - 1] as typeof frame).eye) > 1e-6 ? i : -1,
  );
  const first = moves.find((i) => i > 0) ?? -1;
  const last = moves.findLast((i) => i > 0) ?? -1;
  const frames = first > 0 ? drawn.slice(first - 1, last + 1) : [];
  const steps = frames.slice(1).map((frame, i) => {
    const before = frames[i] as typeof frame;
    const interval = frame.t - before.t;
    return { interval, speed: distance(frame.eye, before.eye) / interval };
  });
  const intervals = steps.map((step) => step.interval).sort((a, b) => a - b);
  const paced = intervals[intervals.length >> 1] ?? 0;
  const peak = Math.max(0, ...steps.map((step) => step.speed));
  // A jump in motion: a frame whose speed (distance over the time it really took) is off its neighbours'.
  let ripple = 0;
  for (let i = 1; i < steps.length - 1; i++) {
    const [before, here, after] = [steps[i - 1], steps[i], steps[i + 1]] as [
      (typeof steps)[number],
      (typeof steps)[number],
      (typeof steps)[number],
    ];
    ripple = Math.max(ripple, Math.abs(here.speed - (before.speed + after.speed) / 2) / peak);
  }
  const made: Record<string, number> = {};
  for (const [name, total] of Object.entries(settle.totals)) made[name] = total - (change.totals[name] ?? 0);
  return {
    frames: steps.length,
    paced,
    worst: Math.max(0, ...intervals),
    late: intervals.filter((interval) => interval > 1.5 * paced).length,
    ripple,
    made,
    travelled:
      frames.length > 1
        ? distance((frames.at(-1) as (typeof frames)[number]).eye, (frames[0] as (typeof frames)[number]).eye)
        : 0,
  };
}

test.describe('the first flight away from the TV, from a cold load', () => {
  // Software GL draws a frame in a tenth of a second: its flights are judged by scripts/perf, not here.
  test.skip(process.env.ROOM_GL === 'swiftshader', 'frame times on a software renderer say nothing about flights');
  test.setTimeout(150_000);

  for (const [when, leaveAfterMs] of [
    ['the moment the room is ready', 0],
    ['two seconds after the room is ready', 2000],
  ] as const) {
    test(`left ${when}: makes nothing in its frames, drops none and moves by its clock`, { tag: '@frames' }, async ({
      page,
    }) => {
      const flight = flightOf(await coldFirstFlight(page, leaveAfterMs));
      // It flew: a second of frames from the TV's pose to the room's.
      expect(flight.frames, 'frames the camera moved in').toBeGreaterThan(40);
      expect(flight.travelled, 'metres from the TV view to the room view').toBeGreaterThan(1);
      // Nothing is made while the camera flies: no program, no vertex array, no buffer, no target, no texture but
      // the TV's own picture (320 × 240, should the game hand over a frame).
      const { programs, shaders, vaos, buffers, targets, texturePixels } = flight.made;
      expect({ programs, shaders, vaos, buffers, targets }, 'made inside the flight').toEqual({
        programs: 0,
        shaders: 0,
        vaos: 0,
        buffers: 0,
        targets: 0,
      });
      expect(texturePixels, 'texels uploaded inside the flight').toBeLessThanOrEqual(320 * 240);
      // No long frame: none as long as three and a half paced frames, and at most one in forty over one and a half.
      // This is the development server at 6× CPU on a machine that is not the flight's alone: one run in four has a
      // frame of 42 to 50 ms here that six runs of the production build in a row do not (17.6 to 19.1 ms the longest,
      // `node scripts/perf/flights.mjs --cpu 6 --leave 2000 --runs 6`, which holds the build to the stricter limits).
      // What this work removed from the flight were frames of 66 to 177 ms.
      expect(flight.worst, `the longest frame interval of ${flight.frames}, in ms`).toBeLessThan(3.5 * flight.paced);
      expect(flight.late, `frame intervals over ${(1.5 * flight.paced).toFixed(1)} ms`).toBeLessThanOrEqual(
        Math.ceil(flight.frames / 40),
      );
      // No jump in motion: the camera's speed from frame to frame is its curve's (the ease's own bend at the middle
      // of the flight is 6 % of its top speed at sixty frames a second).
      expect(flight.ripple, 'the largest step in speed, as a share of the top speed').toBeLessThan(0.15);
    });
  }
});
