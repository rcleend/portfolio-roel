import { type Rect, rect } from '../math/Rect';
import { parseHex } from './color';

/**
 * Shared drawing test doubles. Lives next to the code (not in a test file)
 * so other modules' tests can reuse it; it is never imported by production
 * code.
 */

/**
 * A canvas that keeps its pixels, standing in for the DOM the test runner
 * lacks: stub `document.createElement` to hand these out and draw as usual.
 * It knows just the calls the game's pixel art makes, solid fills and
 * same-size copies, with transparent source pixels left out; alpha,
 * scaling and clipping are ignored.
 */
export class RasterCanvas {
  width = 0;
  height = 0;
  #context: RasterContext | null = null;

  getContext(): RasterContext {
    this.#context ??= new RasterContext(this);
    return this.#context;
  }
}

export class RasterContext {
  readonly canvas: RasterCanvas;
  /** Row-major RGBA, as `ImageData` lays it out. */
  readonly data: Uint8ClampedArray;
  fillStyle = '#000000';
  imageSmoothingEnabled = false;
  #x = 0;
  #y = 0;
  readonly #saved: [number, number][] = [];

  constructor(canvas: RasterCanvas) {
    this.canvas = canvas;
    this.data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
  }

  save(): void {
    this.#saved.push([this.#x, this.#y]);
  }

  restore(): void {
    [this.#x, this.#y] = this.#saved.pop() ?? [this.#x, this.#y];
  }

  translate(x: number, y: number): void {
    this.#x += x;
    this.#y += y;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const { r, g, b, a } = parseHex(this.fillStyle);
    const pixel = Uint8ClampedArray.of(r, g, b, a);
    this.#blit(pixel, 0, 0, 0, w, h, x, y);
  }

  createImageData(width: number, height: number): ImageData {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) } as ImageData;
  }

  putImageData(image: ImageData, x: number, y: number): void {
    this.#blit(image.data, image.width, 0, 0, image.width, image.height, x, y);
  }

  drawImage(image: RasterCanvas, ...args: number[]): void {
    const [sx = 0, sy = 0, sw = image.width, sh = image.height, dx = 0, dy = 0] =
      args.length === 8 ? args : [0, 0, image.width, image.height, ...args];
    this.#blit(image.getContext().data, image.width, sx, sy, sw, sh, dx, dy);
  }

  /** The smallest box around every pixel painted so far, or `null` while the canvas is blank. */
  paintedBounds(): Rect | null {
    const { width, height } = this.canvas;
    let [left, top, right, bottom] = [width, height, -1, -1];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!this.data[(y * width + x) * 4 + 3]) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    return right < 0 ? null : rect(left, top, right - left + 1, bottom - top + 1);
  }

  /**
   * Copies a w × h block of `source` from (sx, sy) to (x, y), skipping
   * transparent pixels and anything off the canvas. A zero `stride` repeats
   * one source pixel, which is how a solid fill comes through here too.
   */
  #blit(source: Uint8ClampedArray, stride: number, sx: number, sy: number, w: number, h: number, x: number, y: number) {
    const { data } = this;
    const { width, height } = this.canvas;
    const [left, top] = [x + this.#x, y + this.#y];
    for (let j = Math.max(0, -top); j < h && top + j < height; j++) {
      for (let i = Math.max(0, -left); i < w && left + i < width; i++) {
        const from = stride === 0 ? 0 : ((sy + j) * stride + sx + i) * 4;
        if (source[from + 3] === 0) continue;
        const to = ((top + j) * width + left + i) * 4;
        data[to] = source[from] as number;
        data[to + 1] = source[from + 1] as number;
        data[to + 2] = source[from + 2] as number;
        data[to + 3] = source[from + 3] as number;
      }
    }
  }
}

/** A blank raster canvas of the given size and its context. */
export function rasterContext(width: number, height: number): RasterContext {
  const canvas = new RasterCanvas();
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext();
}
