import { ditherOn } from '@/engine/gfx/dither';
import { bandAt } from '@/engine/gfx/Gfx';
import { type Rect, rect } from '@/engine/math/Rect';
import { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { rampAt } from '../../../../art/logos/raster/ramp';
import { MENU_FIELD } from '../../../character-select/backdrop';
import { TITLE_LAYOUT } from '../../layout';
import { GLOW_STEP, GRID_FLOOR, INK, PAPER_STEPS, RAMP_RGBA } from './inks';
import { glyphPixels, LETTER_HEIGHT, letteredWidth } from './lettering';

const { width: WIDTH, height: HEIGHT } = TITLE_LAYOUT.screen;

/** The drafting frame: the sheet's border line, an 8 px margin in from the screen edge. */
export const FRAME: Rect = rect(8, 8, WIDTH - 15, HEIGHT - 15);
/** Grid pitch: fine lines every cell, heavier ones every major cell. */
export const GRID = { cell: 8, major: 32 } as const;
/** Heavy lines run through the sheet's centre, so the major cells split evenly around the middle. */
export const MAJOR_OFFSET = { x: (WIDTH / 2) % GRID.major, y: (HEIGHT / 2) % GRID.major } as const;

/**
 * The light table's glow behind the lockup: a broad plateau lit to the
 * indigo window's dark violet, falling off in dithered rings until the field
 * shows through, the way the character card's spotlight is laid over its
 * backdrop. It is what keeps the logo's near-black outline and dark-red
 * extrusion crisp on the dark menu navy.
 */
const LIGHT = {
  /** Behind the middle of the lockup. */
  x: TITLE_LAYOUT.impact.x,
  y: 80,
  rx: 200,
  ry: 96,
  /** How much of the ellipse is lit fully: the larger, the wider the flat middle. */
  plateau: 1.6,
  /** How far below a ring's edge, in steps, the ordered dither starts mixing in the next ring. */
  ditherWidth: 0.35,
} as const;

/** How many ramp steps above the paper the grid is printed. */
const LINE_LIFT = { minor: 1, major: 2 } as const;

/**
 * The static blueprint sheet as ramp steps per pixel (docs/ART-DIRECTION.md
 * › Title › Blueprint): the menus' banded navy field, lit behind the logo by
 * the light table, and, with `lines`, the drafting grid and the frame with
 * its zone margin. Keeping steps rather than colours lets one sheet be lit
 * at any exposure by `exposeSheet`, the way a palette fade relights a whole
 * screen.
 */
export function sheetSteps(lines: boolean): Int8Array {
  const steps = new Int8Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const paper = paperStep(x, y);
      steps[y * WIDTH + x] = lines ? gridStep(x, y, paper) : paper;
    }
  }
  if (lines) paintMarkings(steps);
  return steps;
}

/** The sheet `exposure` ramp steps brighter (or darker, when negative) than fully lit. */
export function exposeSheet(steps: Int8Array, exposure: number): Bitmap {
  const bitmap = new Bitmap(WIDTH, HEIGHT);
  for (let i = 0; i < steps.length; i++) {
    bitmap.set(i % WIDTH, Math.floor(i / WIDTH), rampAt(RAMP_RGBA, (steps[i] as number) + exposure));
  }
  return bitmap;
}

/** The paper's ramp step at (x, y): the field, or the light table's glow where that is brighter. */
export function paperStep(x: number, y: number): number {
  return Math.max(fieldStep(x, y), lightStep(x, y));
}

/** The ramp step of the menus' field at (x, y): character select's bands and Bayer rows, pixel for pixel. */
export function fieldStep(x: number, y: number): number {
  return PAPER_STEPS.first + PAPER_STEPS.count - 1 - bandAt(MENU_FIELD, WIDTH, HEIGHT, x, y);
}

/** The ramp step the light table lights (x, y) to, its rings joined by ordered dither. */
function lightStep(x: number, y: number): number {
  const level = lightLevel(x, y);
  const step = Math.floor(level);
  const into = (level - step - (1 - LIGHT.ditherWidth)) / LIGHT.ditherWidth;
  return into > 0 && ditherOn('bayer4', x, y, into) ? step + 1 : step;
}

/** The light table's glow at (x, y) as a fractional ramp step, before it is quantised into rings. */
export function lightLevel(x: number, y: number): number {
  const dx = (x + 0.5 - LIGHT.x) / LIGHT.rx;
  const dy = (y + 0.5 - LIGHT.y) / LIGHT.ry;
  return Math.min(1, Math.max(0, 1 - dx * dx - dy * dy) * LIGHT.plateau) * GLOW_STEP;
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

/**
 * The ramp step of the sheet at (x, y) with the grid printed over `paper`,
 * inside the frame only: a step or two above the paper, and never fainter
 * than the menus' own lines on the dark field.
 */
function gridStep(x: number, y: number, paper: number): number {
  if (!insideFrame(x, y)) return paper;
  if (isMajorColumn(x) || isMajorRow(y)) return Math.max(paper + LINE_LIFT.major, GRID_FLOOR.major);
  if (x % GRID.cell === 0 || y % GRID.cell === 0) return Math.max(paper + LINE_LIFT.minor, GRID_FLOOR.minor);
  return paper;
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
