import { mix, parseHex, toHex } from '@/engine/gfx/color';
import { ditherOn } from '@/engine/gfx/dither';
import type { Gfx } from '@/engine/gfx/Gfx';
import { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { Mask } from '../../../../art/logos/raster/Mask';
import { rampAt } from '../../../../art/logos/raster/ramp';
import { bitmapToCanvas } from '../../../../art/logos/raster/toCanvas';
import { GLASS, INK } from './palette';
import type { Pixel, Trace } from './series';

/** One heat of the line: its 1 px core and the ring around it. */
interface Heat {
  readonly core: string;
  readonly ring: string;
}

/**
 * The line from rest to white-hot. Freshly drawn line is hottest and cools
 * a step per frame (`AFTERGLOW_FRAMES`) down to rest, like phosphor behind
 * a beam.
 */
const HEATS: readonly Heat[] = [
  { core: INK[3], ring: INK[2] },
  { core: INK[4], ring: INK[3] },
  { core: INK[5], ring: INK[4] },
  { core: INK[5], ring: INK[5] },
];
/** The half-dithered bloom around the ring is the glass under it, tinted with the line's green: one tint per glass level. */
const BLOOM = GLASS.map((glass) => parseHex(mix(toHex(glass), INK[2], 0.45)));

/** The line painted once in every heat, and the trace it follows. */
export interface TraceArt {
  readonly trace: Trace;
  /** One canvas per heat, rest first. */
  readonly heats: readonly HTMLCanvasElement[];
}

/**
 * Paints the line in every heat. The ring makes it read at 320 × 240
 * without blurring the crisp core; the bloom, every other pixel around the
 * ring, is the glass tinted green, so the trace glows rather than getting
 * an outline. `glassAt` is the glass level under each pixel.
 */
export function paintTraceArt(
  trace: Trace,
  width: number,
  height: number,
  glassAt: (x: number, y: number) => number,
): TraceArt {
  // Shared by the heats' first paints, then dropped: a heat a GPU reset wiped works its masks out again.
  let shared: TraceMasks | null = traceMasks(trace, width, height);
  const heats = HEATS.map((heat) =>
    bitmapToCanvas(() => {
      const { core, ring, bloom } = shared ?? traceMasks(trace, width, height);
      const bitmap = new Bitmap(width, height);
      bitmap.fill(bloom, (x, y) => (ditherOn('bayer2', x, y, 0.5) ? rampAt(BLOOM, glassAt(x, y)) : null));
      bitmap.fill(ring, heat.ring);
      bitmap.fill(core, heat.core);
      return bitmap;
    }),
  );
  shared = null;
  return { trace, heats };
}

interface TraceMasks {
  readonly core: Mask;
  readonly ring: Mask;
  readonly bloom: Mask;
}

function traceMasks(trace: Trace, width: number, height: number): TraceMasks {
  const bits = new Uint8Array(width * height);
  for (const { x, y } of trace.pixels) bits[y * width + x] = 1;
  const core = new Mask(width, height, bits);
  const ringed = core.dilate();
  return { core, ring: ringed.subtract(core), bloom: ringed.dilate().subtract(ringed) };
}

/**
 * Draws the line up to its head at pixel `head`, with what each of the
 * last frames drew still glowing: `trail[0]` is where the head was a frame
 * ago, `trail[1]` two frames ago, and so on, at most one per heat above
 * rest. Indices before the line starts are −1.
 */
export function drawTraceArt(gfx: Gfx, art: TraceArt, head: number, trail: readonly number[]): void {
  if (head < 0) return;
  const { pixels } = art.trace;
  const cooled = trail[trail.length - 1] ?? head;
  if (cooled >= 0) {
    const rest = art.heats[0] as HTMLCanvasElement;
    const column = (pixels[cooled] as Pixel).x;
    // Every column left of the cooled end is wholly at rest: one blit, then the cooled end's own column.
    gfx.ctx.drawImage(rest, 0, 0, column, gfx.height, 0, 0, column, gfx.height);
    drawRun(gfx, rest, art, columnStart(art, cooled), cooled);
  }
  // Each newer stretch a heat hotter, oldest first, so the newest wins.
  for (let age = trail.length - 1; age >= 0; age--) {
    const start = trail[age] as number;
    const end = age === 0 ? head : (trail[age - 1] as number);
    const heat = art.heats[art.heats.length - 1 - age] as HTMLCanvasElement;
    if (end > start) drawRun(gfx, heat, art, start + 1, end);
  }
}

/**
 * The head once it has broken through: the line's last stretch poking
 * `rise` pixels up through the tear, in the line's resting ink, and when
 * `lit` the cursor on its tip, a block glowing white at its heart.
 */
export function drawHead(gfx: Gfx, breach: Pixel, rise: number, lit: boolean): void {
  const tip = breach.y - rise;
  const rest = HEATS[0] as Heat;
  gfx.fillRect(breach.x - 1, tip, 3, rise, rest.ring);
  gfx.fillRect(breach.x, tip, 1, rise, rest.core);
  if (!lit) return;
  gfx.fillRect(breach.x - 1, tip - 3, 3, 4, INK[4]);
  gfx.fillRect(breach.x, tip - 2, 1, 2, INK[5]);
}

/** The first pixel of the column that pixel `index` is in. */
function columnStart(art: TraceArt, index: number): number {
  const { pixels } = art.trace;
  const column = (pixels[index] as Pixel).x;
  let start = index;
  while (start > 0 && (pixels[start - 1] as Pixel).x === column) start--;
  return start;
}

/** Copies pixels [from, to] of the line from one heat, a column at a time, with the ring and bloom above and below. */
function drawRun(gfx: Gfx, heat: HTMLCanvasElement, art: TraceArt, from: number, to: number): void {
  const { pixels } = art.trace;
  let index = from;
  while (index <= to) {
    const { x } = pixels[index] as Pixel;
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (; index <= to && (pixels[index] as Pixel).x === x; index++) {
      const { y } = pixels[index] as Pixel;
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    // Straight to the context: Gfx.image would allocate a source rectangle per column, every frame.
    gfx.ctx.drawImage(heat, x, top - 2, 1, bottom - top + 5, x, top - 2, 1, bottom - top + 5);
  }
}
