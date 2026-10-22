import type { Gfx } from '@/engine/gfx/Gfx';
import { lerp } from '@/engine/math/scalar';
import { INK, shadeOf } from './inks';
import type { PenCanvas, PenPath } from './pen';
import { eraseInk, type PlotterState } from './timeline';

/** Frames the pen spends lifted, hopping from one stroke's end to the next stroke's start. */
export const HOP_FRAMES = 3;

/** Fresh ink just behind the pen tip, hottest first: it cools to the settled ink a step per pixel. */
const FRESH_INK: readonly number[] = [INK.hot, INK.white, INK.white, INK.pale, INK.pale];

/** The settled ink of a finished drawing. */
export const DRAWING_INK = INK.mid;

/** As the pen first touches down, a small ring echoes the opening strike: radius and ink per frame. */
const TOUCH_DOWN: readonly (readonly [radius: number, ink: number])[] = [
  [2, INK.hot],
  [2, INK.hot],
  [3, INK.white],
  [3, INK.white],
  [4, INK.mid],
  [4, INK.mid],
];

/** The carriage's shadow on the paper, a deep navy, falls further as the pen lifts. */
const SHADOW = { ink: 2, down: 1, up: 2 } as const;

export interface PenPose {
  /** Pixels inked so far, in pen order. */
  readonly inked: number;
  readonly x: number;
  readonly y: number;
  /** Down while inking, up while hopping between strokes. */
  readonly down: boolean;
}

/** The plotter's steady speed for `path` in `frames`, in pixels per frame, after the hops between strokes. */
export function penSpeed(path: PenPath, frames: number): number {
  return path.length / (frames - (path.strokes.length - 1) * HOP_FRAMES);
}

/**
 * Where the pen is `at` frames into plotting `path` over `frames`: inking
 * each stroke at one steady speed, lifting for a short hop between strokes,
 * and done exactly as the window closes.
 */
export function penPose(path: PenPath, at: number, frames: number): PenPose {
  const speed = penSpeed(path, frames);
  let time = Math.max(0, at);
  let before = 0;
  for (let index = 0; index < path.strokes.length; index++) {
    const stroke = path.strokes[index] as PenPath['strokes'][number];
    if (index > 0) {
      if (time < HOP_FRAMES) {
        const [toX, toY] = stroke[0] ?? [path.x(before - 1), path.y(before - 1)];
        const along = (time + 1) / (HOP_FRAMES + 1);
        const x = Math.round(lerp(path.x(before - 1), toX, along));
        const y = Math.round(lerp(path.y(before - 1), toY, along));
        return { inked: before, x, y, down: false };
      }
      time -= HOP_FRAMES;
    }
    const duration = stroke.length / speed;
    if (time < duration) {
      const inked = before + Math.min(stroke.length, Math.floor(time * speed) + 1);
      return { inked, x: path.x(inked - 1), y: path.y(inked - 1), down: true };
    }
    time -= duration;
    before += stroke.length;
  }
  return { inked: path.length, x: path.x(path.length - 1), y: path.y(path.length - 1), down: false };
}

/**
 * Draws one plotter drawing in whatever phase the dope sheet has it: the pen
 * inking with fresh ink cooling behind it, the finished drawing held, or the
 * drawing erased a ramp step at a time.
 */
export function drawPlotter(gfx: Gfx, path: PenPath, state: PlotterState, reducedMotion: boolean): void {
  const { ctx } = gfx;
  if (state.phase === 'hold') {
    path.ink(ctx, path.length, shadeOf(DRAWING_INK));
    return;
  }
  if (state.phase === 'erase') {
    path.ink(ctx, path.length, shadeOf(eraseInk(state.at)));
    return;
  }
  const pose = penPose(path, state.at, state.of);
  path.ink(ctx, pose.inked, shadeOf(DRAWING_INK));
  if (reducedMotion) {
    drawHead(ctx, pose);
    return;
  }
  const touch = TOUCH_DOWN[state.at];
  if (touch) gfx.circle(path.x(0), path.y(0), touch[0], shadeOf(touch[1]), false);
  if (pose.down) {
    for (let back = 0; back < FRESH_INK.length && back < pose.inked; back++) {
      const index = pose.inked - 1 - back;
      ctx.fillStyle = shadeOf(FRESH_INK[back] as number);
      ctx.fillRect(path.x(index), path.y(index), 1, 1);
    }
  }
  drawHead(ctx, pose);
}

/** The pen carriage as a small crosshair round the tip, over its shadow; the tip lit while it inks. */
function drawHead(canvas: PenCanvas, pose: PenPose): void {
  const { x, y, down } = pose;
  const drop = down ? SHADOW.down : SHADOW.up;
  crosshair(canvas, x + drop, y + drop, shadeOf(SHADOW.ink));
  crosshair(canvas, x, y, shadeOf(down ? INK.pale : INK.mid));
  canvas.fillStyle = shadeOf(down ? INK.hot : INK.pale);
  canvas.fillRect(x, y, 1, 1);
}

/** How far the pen's crosshair reaches past its tip, so drawings can leave room for it. */
export const HEAD_REACH = 4;

/** Four three-pixel arms around (x, y), leaving the centre and its neighbours clear. */
function crosshair(canvas: PenCanvas, x: number, y: number, color: string): void {
  canvas.fillStyle = color;
  canvas.fillRect(x - HEAD_REACH, y, 3, 1);
  canvas.fillRect(x + 2, y, 3, 1);
  canvas.fillRect(x, y - HEAD_REACH, 1, 3);
  canvas.fillRect(x, y + 2, 1, 3);
}
