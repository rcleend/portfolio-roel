import type { Gfx } from '../gfx/Gfx';
import { Rng } from '../math/Rng';
import { STEP_HZ } from './FixedLoop';

export type TransitionPhase = 'out' | 'in';

/**
 * A render-time overlay between two scenes. The old scene is covered during
 * `out`, the director swaps scenes at full coverage, and the new scene is
 * revealed during `in`.
 */
export interface Transition {
  readonly name: string;
  readonly outFrames: number;
  readonly inFrames: number;
  /** `coverage` is 0 when the scene is fully visible and 1 when fully hidden. */
  render(gfx: Gfx, coverage: number, phase: TransitionPhase): void;
  /** At `coverage` the whole frame is black, whatever the scene under it draws (`Director.dark`). */
  dark?(coverage: number): boolean;
}

/** Converts seconds to whole simulation frames. */
function toFrames(seconds: number): number {
  return Math.max(0, Math.round(seconds * STEP_HZ));
}

/** Quantises coverage into flat steps: retro fades jump between levels instead of gliding. */
function quantize(coverage: number, levels: number): number {
  return Math.round(coverage * levels) / levels;
}

/** Instant switch, no overlay. */
export function cut(): Transition {
  return { name: 'cut', outFrames: 0, inFrames: 0, render: () => {} };
}

export interface FadeOptions {
  readonly color?: string;
  /** Total duration in seconds, split evenly between out and in. */
  readonly duration?: number;
  /** Number of discrete opacity levels. */
  readonly levels?: number;
}

/** Fade through a solid colour in flat steps. */
export function fade(options: FadeOptions = {}): Transition {
  const { color = '#000000', duration = 0.5, levels = 6 } = options;
  const half = toFrames(duration / 2);
  return {
    name: 'fade',
    outFrames: half,
    inFrames: half,
    render: (gfx, coverage) => {
      const alpha = quantize(coverage, levels);
      if (alpha > 0) gfx.withAlpha(alpha, () => gfx.fillRect(0, 0, gfx.width, gfx.height, color));
    },
    dark: (coverage) => color === '#000000' && quantize(coverage, levels) === 1,
  };
}

/** A hard white (or coloured) flash: snaps to full, then decays in steps. */
export function flash(options: { readonly color?: string; readonly duration?: number } = {}): Transition {
  const { color = '#ffffff', duration = 0.3 } = options;
  return {
    name: 'flash',
    outFrames: 2,
    inFrames: Math.max(1, toFrames(duration) - 2),
    render: (gfx, coverage, phase) => {
      const alpha = phase === 'out' ? 1 : quantize(coverage, 4);
      if (coverage > 0 && alpha > 0) gfx.withAlpha(alpha, () => gfx.fillRect(0, 0, gfx.width, gfx.height, color));
    },
  };
}

export interface IrisOptions {
  readonly color?: string;
  readonly duration?: number;
  /** Centre of the iris in screen pixels; defaults to the screen centre. */
  readonly x?: number;
  readonly y?: number;
}

/** Classic circular wipe that closes on a point and opens again. */
export function iris(options: IrisOptions = {}): Transition {
  const { color = '#000000', duration = 0.8 } = options;
  const half = toFrames(duration / 2);
  return {
    name: 'iris',
    outFrames: half,
    inFrames: half,
    render: (gfx, coverage) => {
      const cx = Math.round(options.x ?? gfx.width / 2);
      const cy = Math.round(options.y ?? gfx.height / 2);
      const maxRadius = Math.ceil(
        Math.max(
          Math.hypot(cx, cy),
          Math.hypot(gfx.width - cx, cy),
          Math.hypot(cx, gfx.height - cy),
          Math.hypot(gfx.width - cx, gfx.height - cy),
        ),
      );
      const radius = Math.round((1 - coverage) * maxRadius);
      if (radius >= maxRadius) return;
      gfx.ctx.fillStyle = color;
      // Row-by-row spans give a pixel-exact circle edge with no anti-aliasing.
      for (let y = 0; y < gfx.height; y++) {
        const dy = y + 0.5 - cy;
        const span = radius > Math.abs(dy) ? Math.round(Math.sqrt(radius * radius - dy * dy)) : 0;
        if (span === 0) {
          gfx.ctx.fillRect(0, y, gfx.width, 1);
          continue;
        }
        gfx.ctx.fillRect(0, y, Math.max(0, cx - span), 1);
        gfx.ctx.fillRect(cx + span, y, Math.max(0, gfx.width - cx - span), 1);
      }
    },
  };
}

export interface WipeOptions {
  readonly color?: string;
  readonly duration?: number;
  /** Direction the bar travels. */
  readonly direction?: 'left' | 'right' | 'up' | 'down';
}

/** A solid bar sweeps across, covering the old scene, then keeps going to uncover the new one. */
export function wipe(options: WipeOptions = {}): Transition {
  const { color = '#000000', duration = 0.6, direction = 'right' } = options;
  const half = toFrames(duration / 2);
  return {
    name: 'wipe',
    outFrames: half,
    inFrames: half,
    render: (gfx, coverage, phase) => {
      const horizontal = direction === 'left' || direction === 'right';
      const extent = horizontal ? gfx.width : gfx.height;
      const size = Math.round(coverage * extent);
      if (size <= 0) return;
      // Out: the leading edge advances from the start side. In: the trailing edge leaves towards the far side.
      const forward = direction === 'right' || direction === 'down';
      const fromStart = phase === 'out' ? forward : !forward;
      const start = fromStart ? 0 : extent - size;
      if (horizontal) gfx.fillRect(start, 0, size, gfx.height, color);
      else gfx.fillRect(0, start, gfx.width, size, color);
    },
  };
}

export interface PixelDissolveOptions {
  readonly color?: string;
  readonly duration?: number;
  /** Size of each dissolving square in pixels. */
  readonly block?: number;
  readonly seed?: number;
}

/** Squares flip to solid in a shuffled (but deterministic) order. */
export function pixelDissolve(options: PixelDissolveOptions = {}): Transition {
  const { color = '#000000', duration = 0.6, block = 8, seed = 0x5eed } = options;
  const half = toFrames(duration / 2);
  let order: number[] | null = null;
  let columns = 0;
  return {
    name: 'pixelDissolve',
    outFrames: half,
    inFrames: half,
    render: (gfx, coverage) => {
      if (!order) {
        columns = Math.ceil(gfx.width / block);
        const rows = Math.ceil(gfx.height / block);
        order = shuffled(columns * rows, new Rng(seed));
      }
      const count = Math.round(coverage * order.length);
      gfx.ctx.fillStyle = color;
      for (let i = 0; i < count; i++) {
        const cell = order[i] as number;
        gfx.ctx.fillRect((cell % columns) * block, Math.floor(cell / columns) * block, block, block);
      }
    },
  };
}

function shuffled(length: number, rng: Rng): number[] {
  const items = Array.from({ length }, (_, i) => i);
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [items[i], items[j]] = [items[j] as number, items[i] as number];
  }
  return items;
}

/** All built-in transitions, for `director.goTo('title', undefined, transitions.fade())`. */
export const transitions = { cut, fade, flash, iris, wipe, pixelDissolve } as const;
