import { parseHex, type Rgba } from '@/engine/gfx/color';
import type { Mask } from './Mask';

/** A colour per pixel, or `null` to leave the pixel as it is. */
export type PixelPaint = (x: number, y: number) => Rgba | null;

/**
 * An RGBA image painted pixel by pixel, without a canvas, so procedural art
 * is built (and unit-tested) as plain data and only uploaded to a canvas
 * once, by `bitmapToCanvas`.
 */
export class Bitmap {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA, the layout `ImageData` expects. */
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError(`Bitmap: size must be positive integers, got ${width} × ${height}`);
    }
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  /** Writes an opaque or transparent colour; pixels outside the bitmap are ignored. */
  set(x: number, y: number, color: Rgba): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const offset = (y * this.width + x) * 4;
    this.data[offset] = color.r;
    this.data[offset + 1] = color.g;
    this.data[offset + 2] = color.b;
    this.data[offset + 3] = color.a;
  }

  /** The colour at (x, y), or `null` outside the bitmap. */
  get(x: number, y: number): Rgba | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const offset = (y * this.width + x) * 4;
    return {
      r: this.data[offset] as number,
      g: this.data[offset + 1] as number,
      b: this.data[offset + 2] as number,
      a: this.data[offset + 3] as number,
    };
  }

  /** True when the pixel has any coverage. */
  isOpaque(x: number, y: number): boolean {
    return (this.get(x, y)?.a ?? 0) > 0;
  }

  /** Paints every set pixel of `mask` (placed at dx, dy) with a flat colour or a per-pixel paint. */
  fill(mask: Mask, paint: string | Rgba | PixelPaint, dx = 0, dy = 0): void {
    const resolve = toPaint(paint);
    for (let y = 0; y < mask.height; y++) {
      for (let x = 0; x < mask.width; x++) {
        if (!mask.has(x, y)) continue;
        const color = resolve(x + dx, y + dy);
        if (color) this.set(x + dx, y + dy, color);
      }
    }
  }
}

function toPaint(paint: string | Rgba | PixelPaint): PixelPaint {
  if (typeof paint === 'function') return paint;
  const color = typeof paint === 'string' ? parseHex(paint) : paint;
  return () => color;
}
