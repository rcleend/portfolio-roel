/** A box in viewport CSS px. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * FLIP: the transform (origin top left) that makes an element laid out at
 * `last` appear exactly at `first`. Animating from it to `none` grows the
 * element from `first` into place with transforms only, without re-laying it
 * out at any intermediate size.
 */
export function flipTransform(first: Box, last: Box): string {
  const scaleX = last.width > 0 ? first.width / last.width : 1;
  const scaleY = last.height > 0 ? first.height / last.height : 1;
  return `translate(${round(first.left - last.left)}px, ${round(first.top - last.top)}px) scale(${round(scaleX)}, ${round(scaleY)})`;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
