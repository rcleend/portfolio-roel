/**
 * Ordered (Bayer) dithering, the period-correct way to fake intermediate
 * colours with a limited palette.
 */
export type DitherPattern = 'bayer2' | 'bayer4';

const BAYER_2: readonly number[] = [0, 2, 3, 1];
const BAYER_4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Threshold in [0, 1) for pixel (x, y); a pixel shows the "next" colour when its coverage exceeds it. */
export function bayerThreshold(pattern: DitherPattern, x: number, y: number): number {
  const size = pattern === 'bayer2' ? 2 : 4;
  const matrix = pattern === 'bayer2' ? BAYER_2 : BAYER_4;
  const xi = ((x % size) + size) % size;
  const yi = ((y % size) + size) % size;
  return (matrix[yi * size + xi] as number) / (size * size);
}

/** True when the pixel at (x, y) should take the second colour at the given coverage in [0, 1]. */
export function ditherOn(pattern: DitherPattern, x: number, y: number, coverage: number): boolean {
  return coverage > bayerThreshold(pattern, x, y);
}
