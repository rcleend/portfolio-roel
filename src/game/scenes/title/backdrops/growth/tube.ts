import { parseHex } from '@/engine/gfx/color';
import { bayerThreshold } from '@/engine/gfx/dither';
import { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { rampAt } from '../../../../art/logos/raster/ramp';
import { BARS, CHART, GRID, SCALE, TICKER } from './layout';
import { AXIS, GLASS } from './palette';

/**
 * The haze: brightest across the logo's middle band and falling off
 * towards the top, the bottom and the far left and right, like a phosphor
 * tube lit from the centre. Across the screen it stays nearly flat until
 * the logo's ends (a fourth-power falloff), so every letter sits on it.
 */
const HAZE = { x: 158, y: 82, width: 165, height: 110, peak: 9.8, fallX: 3, fallY: 6 } as const;
/** The last quarter of every band dithers into the next, so bands join without a hard step. */
const BAND_EDGE = 0.75;

/** The haze's glass level at a pixel, as a fractional index into `GLASS`. */
export function hazeLevel(x: number, y: number): number {
  const across = (x - HAZE.x) / HAZE.width;
  const down = (y - HAZE.y) / HAZE.height;
  return HAZE.peak - HAZE.fallX * across ** 4 - HAZE.fallY * down ** 2;
}

/** The haze cut into flat bands, each joined to the next by a few rows of 4 × 4 Bayer dither. */
export function glassBand(x: number, y: number): number {
  const level = hazeLevel(x, y);
  const band = Math.floor(level);
  const edge = (level - band - BAND_EDGE) / (1 - BAND_EDGE);
  return Math.max(0, edge > bayerThreshold('bayer4', x, y) ? band + 1 : band);
}

/**
 * The glass level of every pixel, row-major. Every other row sits a level
 * lower: a raster texture that lines up with a CRT's own scanlines instead
 * of beating against them.
 */
export function glassLevels(width: number, height: number): Uint8Array {
  const levels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const raster = y % 2;
    for (let x = 0; x < width; x++) levels[y * width + x] = Math.max(0, glassBand(x, y) - raster);
  }
  return levels;
}

/** The bare glass `boost` levels off its rest: the power-up starts it dim, the raster's leading edge runs hot. */
export function paintGlass(levels: Uint8Array, width: number, height: number, boost = 0): Bitmap {
  const bitmap = new Bitmap(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) bitmap.set(x, y, rampAt(GLASS, (levels[y * width + x] ?? 0) + boost));
  }
  return bitmap;
}

/** How much brighter than the glass beneath it each kind of grid pixel is, in glass levels. */
const GRID_LIFT = { minor: 1, major: 2, cross: 3 } as const;

/**
 * The chart's frame without its ceiling (which breaks, so the backdrop
 * draws it live): the graph-paper grid, the y axis and its ticks, the
 * floor, the bars' baseline and the ticker's top rule. Minor lines are
 * dotted and major lines solid, both the glass a few levels up, so they
 * glow brighter where the haze does.
 */
export function paintFrame(width: number, height: number): Bitmap {
  const bitmap = new Bitmap(width, height);
  const major = GRID.cell * GRID.major;
  for (let y = CHART.top + 1; y < CHART.bottom; y++) {
    for (let x = CHART.left + 1; x < width; x++) {
      const lift = gridLift(x - CHART.left, y - CHART.top, major);
      if (lift > 0) bitmap.set(x, y, rampAt(GLASS, glassBand(x, y) + lift));
    }
  }
  const axis = parseHex(AXIS);
  for (let y = CHART.top; y <= CHART.bottom; y++) bitmap.set(CHART.left, y, axis);
  for (let x = CHART.left - 2; x < width; x++) bitmap.set(x, CHART.bottom, axis);
  for (let step = 0; step <= SCALE.steps; step++) {
    bitmap.set(CHART.left - 1, tickRow(step), axis);
    bitmap.set(CHART.left - 2, tickRow(step), axis);
  }
  for (let x = CHART.left; x < width; x++) {
    bitmap.set(x, BARS.floor + 1, rampAt(GLASS, glassBand(x, BARS.floor + 1) + GRID_LIFT.cross));
  }
  for (let x = 0; x < width; x++) bitmap.set(x, TICKER.top, rampAt(GLASS, GRID_LIFT.cross + 1));
  return bitmap;
}

/** The screen row of the scale's tick `step`, counting up from the floor a major grid row apart. */
export function tickRow(step: number): number {
  return CHART.bottom - step * GRID.cell * GRID.major;
}

function gridLift(column: number, row: number, major: number): number {
  const onMajorColumn = column % major === 0;
  const onMajorRow = row % major === 0;
  if (onMajorColumn && onMajorRow) return GRID_LIFT.cross;
  if (onMajorColumn || onMajorRow) return GRID_LIFT.major;
  // Minor lines are dotted, every other pixel along their length.
  if (column % GRID.cell === 0) return row % 2 === 0 ? GRID_LIFT.minor : 0;
  if (row % GRID.cell === 0) return column % 2 === 0 ? GRID_LIFT.minor : 0;
  return 0;
}
