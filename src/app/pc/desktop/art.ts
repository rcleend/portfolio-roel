import type { GradientStop } from './lunaTokens';

/**
 * Original vector art as plain data: SVG path strings with fills. The still
 * painter draws them with `new Path2D(d)` and the DOM renders the same
 * strings as `<path d>`, so an icon looks the same on the glass and live.
 */

/** A linear gradient in the art's own coordinates (its view box). */
export interface LinearPaint {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly stops: readonly GradientStop[];
}

export type Paint = string | LinearPaint;

export interface ArtPart {
  readonly d: string;
  readonly fill?: Paint;
  readonly stroke?: string;
  /** Stroke width in view-box units (default 1). */
  readonly width?: number;
  readonly evenOdd?: boolean;
  /** Casts the soft drop shadow every desktop icon has: the same shape, offset down and right, under it. */
  readonly shadow?: boolean;
}

/** Where a part's drop shadow falls, and its colour. */
export const ART_SHADOW = { x: 1, y: 1.5, color: 'rgba(0, 0, 0, 0.2)' } as const;

export interface Art {
  /** The square view box's side. */
  readonly size: number;
  readonly parts: readonly ArtPart[];
}

/** A linear gradient from (x1, y1) to (x2, y2) through evenly spaced colours. */
export function linear(x1: number, y1: number, x2: number, y2: number, ...colors: readonly string[]): LinearPaint {
  const last = Math.max(1, colors.length - 1);
  return { x1, y1, x2, y2, stops: colors.map((color, index) => ({ offset: index / last, color })) };
}

/** Equal hard-edged colour bands from x1 to x2 (a test card's colour bars). */
export function bands(x1: number, x2: number, ...colors: readonly string[]): LinearPaint {
  const stops = colors.flatMap((color, index) => [
    { offset: index / colors.length, color },
    { offset: (index + 1) / colors.length, color },
  ]);
  return { x1, y1: 0, x2, y2: 0, stops };
}

/** A vertical gradient across the whole view box, the most common paint. */
export function vertical(size: number, ...colors: readonly string[]): LinearPaint {
  return linear(0, 0, 0, size, ...colors);
}

/** Path data for a circle (two half arcs). */
export function circle(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0z`;
}

/** Path data for a rectangle with rounded corners of radius `r`. */
export function roundRect(x: number, y: number, width: number, height: number, r: number): string {
  const arc = (dx: number, dy: number) => `a${n(r)} ${n(r)} 0 0 1 ${n(dx)} ${n(dy)}`;
  return (
    `M${n(x + r)} ${n(y)}h${n(width - 2 * r)}${arc(r, r)}v${n(height - 2 * r)}${arc(-r, r)}` +
    `h${n(2 * r - width)}${arc(-r, -r)}v${n(2 * r - height)}${arc(r, -r)}z`
  );
}

/** Rounds away floating-point noise (8 - 7.4 = 0.5999…) so path data stays tidy. */
function n(value: number): number {
  return Math.round(value * 1000) / 1000;
}
