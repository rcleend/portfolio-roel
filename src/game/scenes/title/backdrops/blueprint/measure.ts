import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import type { Vec2 } from '@/engine/math/Vec2';
import type { TitleFrame } from '../TitleBackdrop';
import { INK, shadeOf } from './inks';
import { LETTER_HEIGHT, LetteringAtlas, letteredWidth } from './lettering';
import { circle, PenPath } from './pen';
import { FRAME } from './sheet';
import {
  ARMS,
  type Arm,
  armReach,
  boxesShown,
  constructionInk,
  datumShown,
  MARK_LANDING,
  MARK_RADIUS,
  registrationRadius,
} from './timeline';

/** Numbers are lettered a step brighter than the lines they label; these are all the inks they pass through. */
const NUMBER_LIFT = 1;
const NUMBER_INKS = [INK.white, INK.hot, INK.pale, INK.ghost + NUMBER_LIFT] as const;
/** The registration mark's cross reaches this far past its circle. */
const CROSS_OVERHANG = 4;
/** Arms start a little clear of the mark's cross, as dimension lines keep off what they measure. */
const ARM_CLEARANCE = 13;
/** Dashes of the construction boxes: on, then off. */
const DASH = { on: 3, off: 2 } as const;
/** The boxes stand this far either side of the row where the lockup's lines meet, the datum line between them. */
const BOX_GAP = 2;
/** The datum line in the centre-line convention: long dash, gap, dot, gap. */
const DATUM_PATTERN = [9, 2, 1, 2] as const;
/**
 * How tall a lockup's bottom line stands, extrusion and outline included:
 * every lockup sets ENGINEER in the same lettering, so measuring up from
 * the bottom of the box finds where the two lines meet.
 */
const BOTTOM_LINE = 50;

export interface MeasureArt {
  /** The registration mark's circle at each radius it passes through as it lands. */
  readonly marks: ReadonlyMap<number, PenPath>;
  readonly numbers: LetteringAtlas;
}

export function measureArt(): MeasureArt {
  const radii = [...MARK_LANDING, MARK_RADIUS];
  const marks = new Map(radii.map((radius) => [radius, new PenPath([circle(0, 0, radius)])] as const));
  return { marks, numbers: new LetteringAtlas('0123456789', NUMBER_INKS) };
}

/** A dimension arm's way out from the strike and how far it has to go. */
interface Reach {
  /** Unit step outwards. */
  readonly dx: number;
  readonly dy: number;
  /** Distance from the strike to the frame line, which the arm's number reads when it arrives. */
  readonly span: number;
}

function reachOf(arm: Arm, at: Vec2): Reach {
  switch (arm) {
    case 'right':
      return { dx: 1, dy: 0, span: FRAME.x + FRAME.w - 1 - at.x };
    case 'left':
      return { dx: -1, dy: 0, span: at.x - FRAME.x };
    case 'up':
      return { dx: 0, dy: -1, span: at.y - FRAME.y };
    case 'down':
      return { dx: 0, dy: 1, span: FRAME.y + FRAME.h - 1 - at.y };
  }
}

/**
 * The anticipation (docs/ART-DIRECTION.md › Title › Blueprint): the engineer
 * measures the spot before the words arrive. A registration mark lands on
 * the strike, dimension arms shoot to the frame with their numbers ticking
 * up, and dashed construction boxes blink in where the lockup will settle,
 * one over each of its lines, with the datum line they slide in along. The
 * lock satisfies all of it.
 */
export function drawMeasure(gfx: Gfx, frame: TitleFrame, at: number, art: MeasureArt): void {
  const { beats, reducedMotion, impact, lockupBounds } = frame;
  const ink = constructionInk(at, beats, reducedMotion);
  const radius = registrationRadius(at, reducedMotion);
  if (ink === null || radius === null) return;
  const { ctx } = gfx;
  const color = shadeOf(ink);
  if (boxesShown(at, beats, reducedMotion)) drawBoxes(ctx, lockupBounds, color);
  if (datumShown(at, beats, reducedMotion)) drawDatum(ctx, splitRow(lockupBounds), shadeOf(INK.mid));

  const mark = art.marks.get(radius);
  if (mark) gfx.withOffset(impact.x, impact.y, () => mark.ink(ctx, mark.length, color));
  ctx.fillStyle = color;
  const cross = radius + CROSS_OVERHANG;
  ctx.fillRect(impact.x - cross, impact.y, cross * 2 + 1, 1);
  ctx.fillRect(impact.x, impact.y - cross, 1, cross * 2 + 1);

  const numberInk = Math.min(INK.hot, ink + NUMBER_LIFT);
  for (const arm of ARMS) {
    const progress = armReach(at, arm, reducedMotion);
    if (progress <= 0) continue;
    const reach = reachOf(arm, impact);
    drawArm(ctx, impact, reach, ARM_CLEARANCE + Math.round(progress * (reach.span - ARM_CLEARANCE)), color);
    // The number reads the measurement, so it stops at the frame even while the arrow overshoots it.
    drawArmNumber(ctx, art.numbers, impact, reach, Math.round(Math.min(1, progress) * reach.span), numberInk);
  }
}

/** A dimension line from the mark out to `tip` pixels from the strike, with an arrowhead at its tip. */
function drawArm(ctx: CanvasRenderingContext2D, at: Vec2, { dx, dy }: Reach, tip: number, color: string): void {
  ctx.fillStyle = color;
  const x0 = at.x + dx * ARM_CLEARANCE;
  const y0 = at.y + dy * ARM_CLEARANCE;
  const x1 = at.x + dx * tip;
  const y1 = at.y + dy * tip;
  ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) + 1, Math.abs(y1 - y0) + 1);
  // A two-pixel-deep arrowhead: the tip, then a three-pixel base behind it.
  ctx.fillRect(x1 - dx - Math.abs(dy), y1 - dy - Math.abs(dx), 1 + Math.abs(dy) * 2, 1 + Math.abs(dx) * 2);
}

/** The arm's dimension, centred on its finished span: above a level arm, beside an upright one. */
function drawArmNumber(
  ctx: CanvasRenderingContext2D,
  numbers: LetteringAtlas,
  at: Vec2,
  { dx, dy, span }: Reach,
  value: number,
  ink: number,
): void {
  const text = String(value);
  const middle = Math.round((ARM_CLEARANCE + span) / 2);
  if (dy === 0) {
    const left = at.x + dx * middle - Math.floor(letteredWidth(text) / 2);
    numbers.draw(ctx, text, left, at.y - LETTER_HEIGHT - 2, ink);
  } else numbers.draw(ctx, text, at.x + 3, at.y + dy * middle - Math.floor(LETTER_HEIGHT / 2), ink);
}

/** Where the lockup's two lines meet: the row splitting its box, never above its upper third. */
export function splitRow(lockup: Rect): number {
  return Math.max(lockup.y + Math.floor(lockup.h / 3), lockup.y + lockup.h - BOTTOM_LINE);
}

/** The lockup's box inside the frame, as a dashed box over each of its lines. */
function drawBoxes(ctx: CanvasRenderingContext2D, lockup: Rect, color: string): void {
  const left = Math.max(lockup.x, FRAME.x + 2);
  const right = Math.min(lockup.x + lockup.w - 1, FRAME.x + FRAME.w - 3);
  const top = Math.max(lockup.y, FRAME.y + 2);
  const bottom = Math.min(lockup.y + lockup.h - 1, FRAME.y + FRAME.h - 3);
  const split = splitRow(lockup);
  ctx.fillStyle = color;
  dashedBox(ctx, left, top, right, split - BOX_GAP);
  dashedBox(ctx, left, split + BOX_GAP, right, bottom);
}

/** A dashed outline from corner to corner, every side dashed from its first corner so the corners are inked. */
function dashedBox(ctx: CanvasRenderingContext2D, left: number, top: number, right: number, bottom: number): void {
  if (right - left < 2 || bottom - top < 2) return;
  for (let x = left; x <= right; x += DASH.on + DASH.off) {
    const length = Math.min(DASH.on, right - x + 1);
    ctx.fillRect(x, top, length, 1);
    ctx.fillRect(x, bottom, length, 1);
  }
  for (let y = top; y <= bottom; y += DASH.on + DASH.off) {
    const length = Math.min(DASH.on, bottom - y + 1);
    ctx.fillRect(left, y, 1, length);
    ctx.fillRect(right, y, 1, length);
  }
}

/** A centre line across the frame at `row`. */
function drawDatum(ctx: CanvasRenderingContext2D, row: number, color: string): void {
  ctx.fillStyle = color;
  const end = FRAME.x + FRAME.w - 1;
  let x = FRAME.x + 1;
  for (let i = 0; x < end; i = (i + 1) % DATUM_PATTERN.length) {
    const run = DATUM_PATTERN[i] as number;
    if (i % 2 === 0) ctx.fillRect(x, row, Math.min(run, end - x), 1);
    x += run;
  }
}
