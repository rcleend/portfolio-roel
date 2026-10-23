import type { Shape } from './shape';

/** Pixel rectangle; `w` and `h` are at least 1. */
export interface PixelBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * A 1-bit image: which pixels a glyph, logo layer or splash covers, before
 * any colour is applied. Operations return new masks, so a layer can be
 * derived from another (outline from silhouette, extrusion from face)
 * without bookkeeping.
 */
export class Mask {
  readonly width: number;
  readonly height: number;
  readonly #bits: Uint8Array;

  constructor(width: number, height: number, bits?: Uint8Array) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError(`Mask: size must be positive integers, got ${width} × ${height}`);
    }
    if (bits && bits.length !== width * height) throw new RangeError('Mask: bits do not match the size');
    this.width = width;
    this.height = height;
    this.#bits = bits ?? new Uint8Array(width * height);
  }

  /** Rasterises `shape` by testing every pixel centre — crisp, with no anti-aliasing to threshold away. */
  static fromShape(width: number, height: number, shape: Shape): Mask {
    const mask = new Mask(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (shape(x + 0.5, y + 0.5)) mask.#bits[y * width + x] = 1;
      }
    }
    return mask;
  }

  /** `#` is set, anything else is clear. Mostly for tests and hand-made details. */
  static fromRows(rows: readonly string[]): Mask {
    const width = Math.max(1, ...rows.map((row) => row.length));
    const mask = new Mask(width, Math.max(1, rows.length));
    rows.forEach((row, y) => {
      [...row].forEach((cell, x) => {
        if (cell === '#') mask.#bits[y * width + x] = 1;
      });
    });
    return mask;
  }

  /** False outside the mask, so neighbourhood tests need no bounds checks. */
  has(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.#bits[y * this.width + x] === 1;
  }

  count(): number {
    let total = 0;
    for (const bit of this.#bits) total += bit;
    return total;
  }

  /** Pixels set in this mask or in `other` placed at (dx, dy). */
  union(other: Mask, dx = 0, dy = 0): Mask {
    return this.#combine(other, dx, dy, (a, b) => a || b);
  }

  /** Pixels of this mask not covered by `other` placed at (dx, dy). */
  subtract(other: Mask, dx = 0, dy = 0): Mask {
    return this.#combine(other, dx, dy, (a, b) => a && !b);
  }

  /** Pixels set in both. */
  intersect(other: Mask, dx = 0, dy = 0): Mask {
    return this.#combine(other, dx, dy, (a, b) => a && b);
  }

  /** Grows every set pixel into its 8 neighbours: the silhouette a 1 px square-cornered outline wraps. */
  dilate(): Mask {
    const out = new Mask(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.#nearInk(x, y)) out.#bits[y * this.width + x] = 1;
      }
    }
    return out;
  }

  /** The 1 px ring just outside the set pixels. */
  outline(): Mask {
    return this.dilate().subtract(this);
  }

  /**
   * For every set pixel, how many pixels it lies inside the shape (1 on the
   * edge, 2 one step further in, …, capped at `limit`); 0 outside. The
   * gradient of this field gives each pixel a surface direction, which is
   * enough to light a flat splash so it reads as embossed metal.
   */
  depths(limit: number): Uint8Array {
    const depths = new Uint8Array(this.width * this.height);
    let ring: Mask = this;
    for (let depth = 1; depth <= limit; depth++) {
      const inner = depth === limit ? new Mask(this.width, this.height) : ring.#eroded();
      for (let i = 0; i < depths.length; i++) {
        if (ring.#bits[i] && !inner.#bits[i]) depths[i] = depth;
      }
      ring = inner;
    }
    return depths;
  }

  /** Smallest box containing every set pixel, or `null` for an empty mask. */
  bounds(): PixelBox | null {
    let [minX, minY, maxX, maxY] = [this.width, this.height, -1, -1];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (!this.#bits[y * this.width + x]) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  /** A copy of the given region; pixels outside this mask come out clear. */
  crop(box: PixelBox): Mask {
    const out = new Mask(box.w, box.h);
    for (let y = 0; y < box.h; y++) {
      for (let x = 0; x < box.w; x++) {
        if (this.has(box.x + x, box.y + y)) out.#bits[y * box.w + x] = 1;
      }
    }
    return out;
  }

  /** `#` / `.` rows, the inverse of `fromRows`. */
  toRows(): string[] {
    return Array.from({ length: this.height }, (_, y) =>
      Array.from({ length: this.width }, (_, x) => (this.has(x, y) ? '#' : '.')).join(''),
    );
  }

  /** Set pixels whose eight neighbours are all set. */
  #eroded(): Mask {
    const out = new Mask(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.has(x, y) && !this.#nearGap(x, y)) out.#bits[y * this.width + x] = 1;
      }
    }
    return out;
  }

  #nearGap(x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.has(x + dx, y + dy)) return true;
      }
    }
    return false;
  }

  #nearInk(x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (this.has(x + dx, y + dy)) return true;
      }
    }
    return false;
  }

  #combine(other: Mask, dx: number, dy: number, op: (a: boolean, b: boolean) => boolean): Mask {
    const out = new Mask(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (op(this.has(x, y), other.has(x - dx, y - dy))) out.#bits[y * this.width + x] = 1;
      }
    }
    return out;
  }
}
