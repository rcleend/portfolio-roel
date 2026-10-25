import { ditherOn } from '@/engine/gfx/dither';
import { type Rect, rect } from '@/engine/math/Rect';
import { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { hash2, valueNoise } from '../../../../art/logos/raster/noise';
import { rampAt } from '../../../../art/logos/raster/ramp';
import { TITLE_LAYOUT } from '../../layout';
import { INK, RAMP_RGBA } from './inks';
import { glyphPixels, LETTER_HEIGHT, letteredWidth } from './lettering';

const { width: WIDTH, height: HEIGHT } = TITLE_LAYOUT.screen;

/** The drafting frame: the sheet's border line, an 8 px margin in from the screen edge. */
export const FRAME: Rect = rect(8, 8, WIDTH - 15, HEIGHT - 15);
/** Grid pitch: fine lines every cell, heavier ones every major cell. */
export const GRID = { cell: 8, major: 32 } as const;
/** Heavy lines run through the sheet's centre, so the major cells split evenly around the middle. */
export const MAJOR_OFFSET = { x: (WIDTH / 2) % GRID.major, y: (HEIGHT / 2) % GRID.major } as const;

/**
 * The paper's value field, in ramp steps: Prussian navy at the top settling
 * towards blueprint blue at the bottom, lifted by the light table in a broad
 * ellipse behind the logo. That lift is what keeps the logo's near-black
 * outline and dark-red extrusion readable on a dark sheet.
 */
const PAPER = {
  top: 1.1,
  bottom: 4.1,
  /** A broad plateau behind the lockup that falls off towards the corners. */
  light: { x: TITLE_LAYOUT.impact.x, y: 88, rx: 220, ry: 126, plateau: 1.6, lift: 5.4 },
  /** Low, broad unevenness in the wash, like a cyanotype exposed by hand. */
  mottle: { amount: 0.7, cellW: 44, cellH: 30 },
  /** How far below a band edge, in steps, the ordered dither starts mixing in the next band. */
  ditherWidth: 0.35,
  /** Share of pixels that are a step lighter or darker grain. */
  grain: 0.018,
} as const;

/** How many ramp steps above the paper the grid is printed. */
const LINE_LIFT = { minor: 1, major: 2 } as const;
const SEED = 0xb1e9;

/**
 * The static blueprint sheet as ramp steps per pixel (docs/ART-DIRECTION.md
 * › Title › Blueprint): banded cyanotype paper with sparse grain and, with
 * `lines`, the drafting grid and the frame with its zone margin. Keeping
 * steps rather than colours lets one sheet be lit at any
 * exposure by `exposeSheet`, the way a palette fade relights a whole screen.
 */
export function sheetSteps(lines: boolean): Int8Array {
  const steps = new Int8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) steps[y * WIDTH + x] = paperStep(x, y) + (lines ? gridLift(x, y) : 0);
  }
  if (lines) paintMarkings(steps);
  return steps;
}

/** Whether a backdrop prints one of its own lines at (x, y). */
export type LinePattern = (x: number, y: number) => boolean;

/**
 * The paper as the title lights it, with `pattern` printed on it a fine
 * grid line's step above: how the select screens print their own textures
 * on the blueprint (docs/ART-DIRECTION.md › Title › Blueprint), so they
 * stand on the title's paper pixel for pixel and only their lines differ.
 */
export function printOnPaper(pattern: LinePattern): Bitmap {
  const steps = new Int8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) steps[y * WIDTH + x] = paperStep(x, y) + (pattern(x, y) ? LINE_LIFT.minor : 0);
  }
  return exposeSheet(steps, 0);
}

/** The sheet `exposure` ramp steps brighter (or darker, when negative) than fully lit. */
export function exposeSheet(steps: Int8Array, exposure: number): Bitmap {
  const bitmap = new Bitmap(WIDTH, HEIGHT);
  for (let i = 0; i < steps.length; i++) {
    bitmap.set(i % WIDTH, Math.floor(i / WIDTH), rampAt(RAMP_RGBA, (steps[i] as number) + exposure));
  }
  return bitmap;
}

/** The paper's ramp step at (x, y): banded, joined by ordered dither, with grain. */
export function paperStep(x: number, y: number): number {
  const dithered = bandedStep(paperShade(x, y), x, y);
  const grain = hash2(x, y, SEED);
  if (grain < PAPER.grain / 2) return dithered + 1;
  if (grain > 1 - PAPER.grain / 2) return dithered - 1;
  return dithered;
}

/**
 * A fractional ramp step as the paper bands it at screen pixel (x, y): the
 * whole step below, with the next one dithered in over the last stretch
 * before the band's edge. Panels set into the paper band their own shades
 * with it, so their banding and dither match the sheet's.
 */
export function bandedStep(shade: number, x: number, y: number): number {
  const band = Math.floor(shade);
  const into = (shade - band - (1 - PAPER.ditherWidth)) / PAPER.ditherWidth;
  return into > 0 && ditherOn('bayer4', x, y, into) ? band + 1 : band;
}

/** Fractional ramp step of the paper before banding. */
export function paperShade(x: number, y: number): number {
  const { top, bottom, light, mottle } = PAPER;
  const vertical = top + ((bottom - top) * y) / (HEIGHT - 1);
  const dx = (x + 0.5 - light.x) / light.rx;
  const dy = (y + 0.5 - light.y) / light.ry;
  const lit = Math.min(1, Math.max(0, 1 - dx * dx - dy * dy) * light.plateau) * light.lift;
  const wash = (valueNoise(x, y, mottle.cellW, mottle.cellH, SEED + 1) - 0.5) * mottle.amount;
  return vertical + lit + wash;
}

/** Whether (x, y) is inside the frame, off its border line. */
export function insideFrame(x: number, y: number): boolean {
  return x > FRAME.x && y > FRAME.y && x < FRAME.x + FRAME.w - 1 && y < FRAME.y + FRAME.h - 1;
}

export function isMajorColumn(x: number): boolean {
  return x % GRID.major === MAJOR_OFFSET.x;
}

export function isMajorRow(y: number): boolean {
  return y % GRID.major === MAJOR_OFFSET.y;
}

/** Ramp steps the grid adds at (x, y), inside the frame only. */
function gridLift(x: number, y: number): number {
  if (!insideFrame(x, y)) return 0;
  if (isMajorColumn(x) || isMajorRow(y)) return LINE_LIFT.major;
  if (x % GRID.cell === 0 || y % GRID.cell === 0) return LINE_LIFT.minor;
  return 0;
}

/** The frame and its zone margin, in absolute inks. */
function paintMarkings(steps: Int8Array): void {
  const set = (x: number, y: number, step: number): void => {
    if (x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT) steps[y * WIDTH + x] = step;
  };
  const { x, y, w, h } = FRAME;
  for (let i = x; i < x + w; i++) {
    set(i, y, INK.mid);
    set(i, y + h - 1, INK.mid);
  }
  for (let j = y; j < y + h; j++) {
    set(x, j, INK.mid);
    set(x + w - 1, j, INK.mid);
  }
  paintZones(set);
}

type StepSetter = (x: number, y: number, step: number) => void;

function letterSteps(set: StepSetter, text: string, x: number, y: number, step: number): void {
  for (const [px, py] of glyphPixels(text, x, y)) set(px, py, step);
}

/** Zone references in the margin, numbers across and letters down, as on a real drawing sheet. */
const ZONES = { columns: 8, rows: 6, tick: 3 } as const;

function paintZones(set: StepSetter): void {
  const { x, y, w, h } = FRAME;
  const ink = INK.ghost;
  for (let column = 0; column < ZONES.columns; column++) {
    const left = x + Math.round((column * (w - 1)) / ZONES.columns);
    const right = x + Math.round(((column + 1) * (w - 1)) / ZONES.columns);
    const label = String(column + 1);
    const labelX = Math.round((left + right - letteredWidth(label)) / 2);
    letterSteps(set, label, labelX, y - LETTER_HEIGHT - 2, ink);
    letterSteps(set, label, labelX, y + h + 1, ink);
    if (column === 0) continue;
    for (let t = 1; t <= ZONES.tick; t++) {
      set(left, y - t, ink);
      set(left, y + h - 1 + t, ink);
    }
  }
  for (let row = 0; row < ZONES.rows; row++) {
    const top = y + Math.round((row * (h - 1)) / ZONES.rows);
    const bottom = y + Math.round(((row + 1) * (h - 1)) / ZONES.rows);
    const label = String.fromCharCode(65 + row);
    const labelY = Math.round((top + bottom - LETTER_HEIGHT) / 2);
    letterSteps(set, label, x - 6, labelY, ink);
    letterSteps(set, label, x + w + 2, labelY, ink);
    if (row === 0) continue;
    for (let t = 1; t <= ZONES.tick; t++) {
      set(x - t, top, ink);
      set(x + w - 1 + t, top, ink);
    }
  }
}
