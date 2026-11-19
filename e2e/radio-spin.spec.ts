import { expect, type Page, test } from '@playwright/test';
import type {} from '../src/app/hosts/RoomHost';
import { GPU_LAUNCH_ARGS } from './gpu';
import { hostElement, roomPace, trackErrors, waitForRunning } from './helpers';

/**
 * The discs floating beside the CD player turn and bob in every frame the room draws (docs/ROOM.md › The CD player ›
 * Frames and budgets), and the room at rest draws thirty a second for them (docs/ROOM.md › Frames › At rest). A frame
 * count alone says little about the discs: what is held here is what each frame shows of them, read from the model
 * matrices the page hands WebGL. A build whose float asked for frames of its own, beside the frames the room then
 * drew all the time, drew the discs standing still in nearly every frame and jumping in the rest.
 */
test.use({
  launchOptions: { args: GPU_LAUNCH_ARGS },
  viewport: { width: 1440, height: 900 },
});

// The float is the visitor's with a real GPU only: a software renderer is the slow tier, whose discs hold still.
test.skip(process.env.ROOM_GL === 'swiftshader', 'the slow tier has no float');

/** Bare wall beside the window, outside every prop in the room. */
const WALL = { x: 40, y: 450 };

interface DiscFrame {
  /** The frame's requestAnimationFrame timestamp (ms). */
  readonly t: number;
  /** One model matrix (16 numbers, column-major) per disc drawn, in draw order. */
  readonly discs: number[][];
}

declare global {
  interface Window {
    __discFrames?: { recording: boolean; frames: DiscFrame[] };
  }
}

/**
 * Records, per frame that draws discs, the model matrix of every disc: whatever WebGL program has the disc shader's
 * `uOmega` uniform is the discs', and three.js hands each disc's `modelMatrix` over before its draw call.
 */
function recordDiscs(): void {
  const record: { recording: boolean; frames: DiscFrame[] } = { recording: false, frames: [] };
  window.__discFrames = record;
  const proto = WebGL2RenderingContext.prototype;
  const names = new WeakMap<WebGLUniformLocation, string>();
  const discPrograms = new WeakSet<WebGLProgram>();
  const programIds = new WeakMap<WebGLProgram, number>();
  let nextId = 1;
  let current: WebGLProgram | null = null;
  let frame: { t: number; byProgram: Map<number, number[][]> } | null = null;

  const getUniformLocation = proto.getUniformLocation;
  proto.getUniformLocation = function (program, name) {
    const location = getUniformLocation.call(this, program, name);
    if (location) {
      names.set(location, name);
      if (name === 'uOmega') discPrograms.add(program);
      if (!programIds.has(program)) programIds.set(program, nextId++);
    }
    return location;
  };
  const useProgram = proto.useProgram;
  proto.useProgram = function (program) {
    current = program;
    useProgram.call(this, program);
  };
  const uniformMatrix4fv = proto.uniformMatrix4fv;
  proto.uniformMatrix4fv = function (
    this: WebGL2RenderingContext,
    location: WebGLUniformLocation | null,
    ...rest: unknown[]
  ) {
    if (frame && current && location && discPrograms.has(current) && names.get(location) === 'modelMatrix') {
      const id = programIds.get(current) ?? 0;
      const list = frame.byProgram.get(id) ?? [];
      list.push(Array.from(rest[1] as Float32Array).slice(0, 16));
      frame.byProgram.set(id, list);
    }
    return (uniformMatrix4fv as (...args: unknown[]) => void).call(this, location, ...rest);
  } as typeof proto.uniformMatrix4fv;

  const request = window.requestAnimationFrame.bind(window);
  let stamp = -1;
  window.requestAnimationFrame = (callback) =>
    request((time) => {
      if (time !== stamp) {
        stamp = time;
        const opened = { t: time, byProgram: new Map<number, number[][]>() };
        frame = opened;
        // The frame's callbacks have all run by the time a task queued now does.
        if (record.recording) {
          setTimeout(() => {
            // A frame may draw the discs twice (once into the finish's target): one program's draws are one pass.
            const passes = [...opened.byProgram.values()].sort((a, b) => b.length - a.length);
            const discs = passes[0];
            if (discs && record.recording) record.frames.push({ t: opened.t, discs });
          }, 0);
        }
      }
      callback(time);
    });
}

/** The angle (degrees) between the rotations of two model matrices. */
function turned(a: readonly number[], b: readonly number[]): number {
  const rotation = (m: readonly number[]): number[] => {
    const scale = Math.hypot(m[0] ?? 0, m[1] ?? 0, m[2] ?? 0) || 1;
    return [0, 1, 2, 4, 5, 6, 8, 9, 10].map((i) => (m[i] ?? 0) / scale);
  };
  const ra = rotation(a);
  const rb = rotation(b);
  let trace = 0;
  for (let i = 0; i < 9; i++) trace += (ra[i] ?? 0) * (rb[i] ?? 0);
  return (Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))) * 180) / Math.PI;
}

/** How far (m) two model matrices' origins are apart. */
function moved(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[12] ?? 0) - (b[12] ?? 0), (a[13] ?? 0) - (b[13] ?? 0), (a[14] ?? 0) - (b[14] ?? 0));
}

/**
 * Per pair of successive frames: the time between them and the furthest any disc turned, each disc of a frame paired
 * with the nearest of the frame before (they float millimetres, and stand decimetres apart).
 */
function steps(frames: readonly DiscFrame[]): { dt: number; degrees: number; metres: number }[] {
  const result: { dt: number; degrees: number; metres: number }[] = [];
  for (let i = 1; i < frames.length; i++) {
    const before = frames[i - 1];
    const now = frames[i];
    if (!before || !now) continue;
    let degrees = 0;
    let metres = 0;
    for (const disc of now.discs) {
      let nearest: number[] | null = null;
      let distance = Number.POSITIVE_INFINITY;
      for (const candidate of before.discs) {
        const d = moved(disc, candidate);
        if (d < distance) {
          distance = d;
          nearest = candidate;
        }
      }
      if (!nearest || distance > 0.05) continue;
      degrees = Math.max(degrees, turned(nearest, disc));
      metres = Math.max(metres, distance);
    }
    result.push({ dt: now.t - before.t, degrees, metres });
  }
  return result;
}

async function goToRadio(page: Page): Promise<void> {
  await page.mouse.click(WALL.x, WALL.y);
  await expect(hostElement(page)).toHaveAttribute('data-view', 'room');
  await expect.poll(() => page.evaluate(() => window.__room?.settled === true)).toBe(true);
  const radio = await page.evaluate(() => window.__room?.anchors.find((entry) => entry.target === 'radio'));
  if (!radio) throw new Error('The room has no radio anchor');
  await page.mouse.click(radio.x, radio.y);
  await expect(hostElement(page)).toHaveAttribute('data-view', 'radio');
  await expect.poll(() => page.evaluate(() => window.__room?.radio.deck?.live), { timeout: 10_000 }).toBe(true);
  await expect
    .poll(() => page.evaluate(() => window.__room?.radio.deck?.layout.discs.length ?? 0), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(5);
}

/** Records the discs for `ms`, with the pointer at rest. */
async function record(page: Page, ms: number): Promise<DiscFrame[]> {
  await page.evaluate(() => {
    const record = window.__discFrames;
    if (!record) throw new Error('No disc recorder');
    record.frames = [];
    record.recording = true;
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const record = window.__discFrames;
    if (!record) throw new Error('No disc recorder');
    record.recording = false;
    return record.frames;
  });
}

test('the floating discs turn in every frame the room draws, by as much as the frame took', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = trackErrors(page);
  await page.addInitScript(recordDiscs);
  await page.goto('/?seed=1&debug');
  await waitForRunning(page);
  await goToRadio(page);
  // The discs rise, cross to their slots and turn over within 1.4 s of the landing, and then float: bobbing, and
  // turning at their idle spin until the float rests, 6 s after the click that brought the camera here.
  await page.waitForTimeout(1800);
  expect((await page.evaluate(() => window.__room?.stats))?.radioAmbient).toBe(true);

  // Nobody touches anything from here on, so the room is at rest and says so: the discs are what asks the most of
  // it, thirty frames a second.
  const pace = await roomPace(page);
  expect(pace?.pace, "the room's pace with the discs afloat").toBe('rest');
  expect(pace?.moving, 'what moves with the discs afloat').toContain('discs');
  expect(pace?.rate, 'the frames a second the room draws by itself').toBeCloseTo(30);

  const seconds = 2.5;
  const frames = await record(page, seconds * 1000);
  const taken = steps(frames);
  // The float's thirty frames a second, give or take the machine: at least a second's worth to judge, and never the
  // display's sixty.
  expect(taken.length, 'frames that drew the discs').toBeGreaterThanOrEqual(30);
  expect(taken.length / seconds, 'frames a second that drew the discs').toBeLessThanOrEqual(48);

  // A disc that floats is somewhere else in every frame. (Float rounding turns two equal poses by under 0.03°.)
  const still = taken.filter((step) => step.degrees < 0.05 && step.metres < 1e-5).length;
  expect(still / taken.length, 'share of frames in which no disc had moved').toBeLessThan(0.1);

  // And it turns evenly: per frame by what the frame's time was worth, so a late frame turns further and none jumps.
  // The spin changes slowly (it ramps in, and winds down as the float rests), so each frame's rate of turn is held
  // to the median of the eight frames around it, wherever the discs turn at all (over 20° a second).
  const rates = taken.map((step) => (step.dt > 0 ? step.degrees / step.dt : 0));
  let judged = 0;
  let uneven = 0;
  let jump = 0;
  for (let i = 4; i < rates.length - 4; i++) {
    const around = [...rates.slice(i - 4, i), ...rates.slice(i + 1, i + 5)].sort((a, b) => a - b);
    const median = ((around[3] ?? 0) + (around[4] ?? 0)) / 2;
    if (median < 0.02) continue;
    judged++;
    const off = Math.abs((rates[i] ?? 0) - median) / median;
    if (off > 0.25) uneven++;
    jump = Math.max(jump, off);
  }
  expect(judged, 'frames in which the discs were turning').toBeGreaterThanOrEqual(22);
  expect(uneven / judged, "share of frames not turned by their time's worth (25 % off their neighbours)").toBeLessThan(
    0.1,
  );
  expect(jump, 'the furthest any frame is off its neighbours (1: twice their turn, or none)').toBeLessThan(2);
  expect(errors).toEqual([]);
});
