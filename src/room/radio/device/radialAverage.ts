import { AVERAGE_BINS } from './discShader';

/** The side of the square a label is downsampled to before averaging: enough for 64 bins, cheap on a phone. */
export const AVERAGE_SAMPLE_SIZE = 128;

/** RGBA pixels, row-major, straight alpha, sRGB-encoded (a canvas's ImageData). */
export interface LabelPixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray | Uint8Array;
}

const toLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number): number => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

/**
 * A disc print's radial average: for each of 64 rings from the centre to the rim, the mean ink (premultiplied by its
 * coverage, in linear light) and the mean coverage, sRGB-encoded as one RGBA row. A disc at play speed is drawn as
 * this: every point of a ring passes under the same pixel many times a frame. Empty rings take their neighbour's.
 */
export function radialAverage(pixels: LabelPixels, bins = AVERAGE_BINS): Uint8Array {
  const { width, height, data } = pixels;
  const sums = new Float64Array(bins * 4);
  const counts = new Uint32Array(bins);
  const cx = width / 2;
  const cy = height / 2;
  const half = Math.min(width, height) / 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / half;
      if (r >= 1) continue;
      const bin = Math.min(bins - 1, Math.floor(r * bins));
      const i = (y * width + x) * 4;
      const a = (data[i + 3] ?? 0) / 255;
      sums[bin * 4] = (sums[bin * 4] ?? 0) + toLinear(data[i] ?? 0) * a;
      sums[bin * 4 + 1] = (sums[bin * 4 + 1] ?? 0) + toLinear(data[i + 1] ?? 0) * a;
      sums[bin * 4 + 2] = (sums[bin * 4 + 2] ?? 0) + toLinear(data[i + 2] ?? 0) * a;
      sums[bin * 4 + 3] = (sums[bin * 4 + 3] ?? 0) + a;
      counts[bin] = (counts[bin] ?? 0) + 1;
    }
  }
  const row = new Uint8Array(bins * 4);
  for (let bin = 0; bin < bins; bin++) {
    const source = (counts[bin] ?? 0) > 0 ? bin : nearestFilled(counts, bin);
    if (source < 0) continue;
    const n = counts[source] ?? 1;
    for (let c = 0; c < 3; c++) row[bin * 4 + c] = toSrgb((sums[source * 4 + c] ?? 0) / n);
    row[bin * 4 + 3] = Math.round(((sums[source * 4 + 3] ?? 0) / n) * 255);
  }
  return row;
}

function nearestFilled(counts: Uint32Array, bin: number): number {
  for (let d = 1; d < counts.length; d++) {
    if ((counts[bin + d] ?? 0) > 0) return bin + d;
    if ((counts[bin - d] ?? 0) > 0) return bin - d;
  }
  return -1;
}
