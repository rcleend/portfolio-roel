import type { TitleFrame } from '../TitleBackdrop';
import { shadeOf } from './inks';
import type { PenCanvas } from './pen';
import { FRAME, GRID, isMajorColumn, isMajorRow } from './sheet';
import { ripple } from './timeline';

const LEFT = FRAME.x + GRID.cell;
const RIGHT = FRAME.x + FRAME.w - 1;
const TOP = FRAME.y + GRID.cell;
const BOTTOM = FRAME.y + FRAME.h - 1;

/** The ripple's band: grid lines this many pixels behind its front light up. */
const RIPPLE_BAND = 6;

/**
 * The 1 px grid ripple the lock sends out from the middle of the lockup
 * (docs/ART-DIRECTION.md › Title › Blueprint), its heavy lines a step
 * brighter than its fine ones.
 */
export function drawRipple(ctx: PenCanvas, frame: TitleFrame, at: number): void {
  const wave = ripple(at, frame.beats, frame.reducedMotion);
  if (!wave) return;
  const { x, y, w, h } = frame.lockupBounds;
  const cx = x + Math.floor(w / 2);
  const cy = y + Math.floor(h / 2);
  lightGrid(ctx, cx, cy, wave.radius - RIPPLE_BAND, wave.radius, shadeOf(wave.ink), shadeOf(wave.ink + 1));
}

/** Scratch for `crossing`: up to two spans as [from, to] pairs, reused so the per-frame loops allocate nothing. */
const SPANS = new Int16Array(4);

/**
 * Relights the printed grid where it crosses the ring between `inner` and
 * `outer` around (cx, cy): a few pixels of every grid line, so a wave reads
 * as the grid itself lighting up rather than a circle drawn over it. Major
 * lines take `majorColor`. Lines stop where the sheet stops printing them,
 * at the frame. Costs at most two rectangles per grid line.
 */
export function lightGrid(
  ctx: PenCanvas,
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  minorColor: string,
  majorColor: string,
): void {
  if (outer <= 0) return;
  for (let x = LEFT; x < RIGHT; x += GRID.cell) {
    const spans = crossing(x - cx, cy, inner, outer, FRAME.y + 1, BOTTOM - 1);
    if (spans === 0) continue;
    ctx.fillStyle = isMajorColumn(x) ? majorColor : minorColor;
    for (let s = 0; s < spans; s++) {
      const from = SPANS[s * 2] as number;
      ctx.fillRect(x, from, 1, (SPANS[s * 2 + 1] as number) - from + 1);
    }
  }
  for (let y = TOP; y < BOTTOM; y += GRID.cell) {
    const spans = crossing(y - cy, cx, inner, outer, FRAME.x + 1, RIGHT - 1);
    if (spans === 0) continue;
    ctx.fillStyle = isMajorRow(y) ? majorColor : minorColor;
    for (let s = 0; s < spans; s++) {
      const from = SPANS[s * 2] as number;
      ctx.fillRect(from, y, (SPANS[s * 2 + 1] as number) - from + 1, 1);
    }
  }
}

/**
 * Where a grid line `offset` pixels from the centre crosses the ring, as
 * spans along the line around `centre` clipped to [min, max], written to
 * `SPANS`. Returns how many there are.
 */
function crossing(offset: number, centre: number, inner: number, outer: number, min: number, max: number): number {
  const distance = Math.abs(offset);
  if (distance > outer) return 0;
  const far = Math.round(Math.sqrt(outer * outer - offset * offset));
  const near = distance < inner ? Math.round(Math.sqrt(inner * inner - offset * offset)) : 0;
  if (near === 0) return clip(0, centre - far, centre + far, min, max);
  const first = clip(0, centre - far, centre - near, min, max);
  return first + clip(first, centre + near, centre + far, min, max);
}

/** Writes [from, to] ∩ [min, max] as span `slot` when it is not empty; returns 1 if it wrote one. */
function clip(slot: number, from: number, to: number, min: number, max: number): number {
  const a = Math.max(min, from);
  const b = Math.min(max, to);
  if (a > b) return 0;
  SPANS[slot * 2] = a;
  SPANS[slot * 2 + 1] = b;
  return 1;
}
