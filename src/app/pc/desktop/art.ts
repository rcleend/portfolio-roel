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
  readonly opacity?: number;
}

export interface Art {
  /** The square view box's side. */
  readonly size: number;
  readonly parts: readonly ArtPart[];
}

/** A vertical gradient across the whole view box, the most common paint. */
export function vertical(size: number, ...colors: readonly string[]): LinearPaint {
  return {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: size,
    stops: colors.map((color, index) => ({ offset: index / Math.max(1, colors.length - 1), color })),
  };
}
