import { Rng } from '@/engine/math/Rng';
import { BARS, CHART, GRID } from './layout';

/** A whole screen pixel. */
export interface Pixel {
  readonly x: number;
  readonly y: number;
}

/**
 * The flat start, one data point per grid cell from the y axis, placed by
 * hand after the startup curve: wiggles of false hope, a sag into the
 * trough of sorrow and the turn. It runs in the gap between the logo's
 * lowest row and the prompt.
 */
const FLAT_ROWS: readonly number[] = [
  148, 146, 147, 144, 145, 142, 144, 142, 144, 145, 144, 146, 148, 147, 150, 151, 153, 155, 154, 152,
];

/**
 * The blade, y = turn − A·(e^(k·(x − turn)) − 1) past the last flat point,
 * reaching the ceiling at `breachX`. This curvature keeps it hugging the
 * classic logo's right edge, clear of the letters, all the way up.
 */
const BLADE = { curvature: 0.098, breachX: 310 } as const;

export interface Trace {
  /** Every pixel of the line, 8-connected, in drawing order from the y axis to the ceiling. */
  readonly pixels: readonly Pixel[];
  /** Index of the flat start's last pixel, where the head pauses before it rockets. */
  readonly elbow: number;
  /** Where the line meets the ceiling: its last pixel. */
  readonly breach: Pixel;
}

/** The hockey stick, rasterised: straight segments between the flat data points, then the blade a column at a time. */
export function buildTrace(): Trace {
  const flat: Pixel[] = FLAT_ROWS.map((y, index) => ({ x: CHART.left + index * GRID.cell, y }));
  const turn = flat[flat.length - 1] as Pixel;
  const scale = (turn.y - CHART.top) / Math.expm1(BLADE.curvature * (BLADE.breachX - turn.x));
  const blade: Pixel[] = [];
  for (let x = turn.x + 1; x <= BLADE.breachX; x++) {
    blade.push({ x, y: Math.round(turn.y - scale * Math.expm1(BLADE.curvature * (x - turn.x))) });
  }
  const pixels: Pixel[] = [flat[0] as Pixel];
  const connect = (points: readonly Pixel[]): void => {
    for (const point of points) rasterise(pixels[pixels.length - 1] as Pixel, point, pixels);
  };
  connect(flat.slice(1));
  const elbow = pixels.length - 1;
  connect(blade);
  return { pixels, elbow, breach: pixels[pixels.length - 1] as Pixel };
}

/** Appends the Bresenham line from `from` (exclusive) to `to` (inclusive). */
function rasterise(from: Pixel, to: Pixel, out: Pixel[]): void {
  let { x, y } = from;
  const dx = Math.abs(to.x - x);
  const dy = -Math.abs(to.y - y);
  const sx = x < to.x ? 1 : -1;
  const sy = y < to.y ? 1 : -1;
  let err = dx + dy;
  while (x !== to.x || y !== to.y) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    out.push({ x, y });
  }
}

/**
 * Bar heights in pixels, one bar per grid cell: steady shipping, a lull
 * under the trough, then a surge under the blade.
 */
const BAR_HEIGHTS: readonly number[] = [
  6, 8, 7, 9, 8, 10, 9, 11, 10, 9, 11, 10, 12, 11, 10, 9, 8, 9, 11, 13, 16, 19, 22, 25,
];

/**
 * The last bar, the live one, in each idle state: it dips, then tops its
 * record twice a loop (states 2 and 4), when the "NEW HIGH" badge pops.
 */
const LIVE_BAR: readonly number[] = [25, 23, 27, 24, 28];

/** How many values each bar cycles through, one per tick of the idle loop. */
export const BAR_STATES = LIVE_BAR.length;
const BAR_SEED = 0x96a7;

/**
 * Every bar's height in each idle state, `[state][bar]`: state 0 is where
 * the intro leaves them, the others wander a couple of pixels around it,
 * so the loop can tick through them and come back to where it started.
 */
export function barStates(): readonly (readonly number[])[] {
  const rng = new Rng(BAR_SEED);
  const live = BAR_HEIGHTS.length - 1;
  return LIVE_BAR.map((liveHeight, state) =>
    BAR_HEIGHTS.map((height, bar) => {
      if (bar === live) return liveHeight;
      return state === 0 ? height : Math.max(3, height + rng.int(-2, 2));
    }),
  );
}

/** The left edge of bar `index`. */
export function barX(index: number): number {
  return BARS.left + index * BARS.pitch;
}
