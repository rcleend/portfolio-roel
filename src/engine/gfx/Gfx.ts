import type { PixelImage } from './canvas';
import { context2d, createCanvas } from './canvas';
import { bandColors } from './color';
import { type DitherPattern, ditherOn } from './dither';
import type { SpriteDrawOptions, SpriteSheet } from './SpriteSheet';
import { drawText, layoutText, type TextBlock, type TextOptions, type TextStyle } from './TextStyle';

/** A flat colour or a banded gradient. */
export type Fill = string | BandedGradient;

/**
 * A gradient quantised into flat bands, optionally stitched together with an
 * ordered-dither row at each band edge — never a smooth CSS-style ramp.
 */
export interface BandedGradient {
  /** Colour stops from top to bottom (or left to right). */
  readonly stops: readonly string[];
  /** Number of flat bands; 3–6 looks right at 320 × 240. */
  readonly bands: number;
  readonly direction?: 'vertical' | 'horizontal';
  readonly dither?: DitherPattern;
}

export interface ImageDrawOptions {
  /** Source rectangle; defaults to the whole image. */
  readonly source?: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  readonly flipX?: boolean;
  readonly alpha?: number;
}

/**
 * Pixel-snapped drawing over the native-resolution canvas.
 *
 * Every coordinate is rounded to whole pixels before it reaches the canvas, so
 * nothing can be drawn between pixels by accident. Anything this API cannot
 * express is available through `ctx`, with the same no-smoothing guarantee.
 */
export class Gfx {
  readonly ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  readonly #gradientCache = new Map<string, HTMLCanvasElement>();

  constructor(ctx: CanvasRenderingContext2D, width = ctx.canvas.width, height = ctx.canvas.height) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
    ctx.imageSmoothingEnabled = false;
  }

  clear(color = '#000000'): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  pixel(x: number, y: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(snap(x), snap(y), 1, 1);
  }

  fillRect(x: number, y: number, w: number, h: number, fill: Fill): void {
    const [rx, ry, rw, rh] = [snap(x), snap(y), snap(w), snap(h)];
    if (rw <= 0 || rh <= 0) return;
    if (typeof fill === 'string') {
      this.ctx.fillStyle = fill;
      this.ctx.fillRect(rx, ry, rw, rh);
      return;
    }
    this.ctx.drawImage(this.#gradient(rw, rh, fill), rx, ry);
  }

  /** 1 px outline drawn inside the box, so `rect` and `fillRect` with equal arguments cover the same pixels. */
  rect(x: number, y: number, w: number, h: number, color: string): void {
    const [rx, ry, rw, rh] = [snap(x), snap(y), snap(w), snap(h)];
    if (rw <= 0 || rh <= 0) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(rx, ry, rw, 1);
    this.ctx.fillRect(rx, ry + rh - 1, rw, 1);
    this.ctx.fillRect(rx, ry, 1, rh);
    this.ctx.fillRect(rx + rw - 1, ry, 1, rh);
  }

  /** Bresenham line, both endpoints inclusive. */
  line(x0: number, y0: number, x1: number, y1: number, color: string): void {
    let [x, y] = [snap(x0), snap(y0)];
    const [tx, ty] = [snap(x1), snap(y1)];
    const dx = Math.abs(tx - x);
    const dy = -Math.abs(ty - y);
    const sx = x < tx ? 1 : -1;
    const sy = y < ty ? 1 : -1;
    let err = dx + dy;
    this.ctx.fillStyle = color;
    for (;;) {
      this.ctx.fillRect(x, y, 1, 1);
      if (x === tx && y === ty) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  /** Midpoint circle — symmetric, gap-free and identical every frame. */
  circle(cx: number, cy: number, radius: number, color: string, filled = true): void {
    const [x0, y0, r] = [snap(cx), snap(cy), Math.max(0, snap(radius))];
    this.ctx.fillStyle = color;
    let x = r;
    let y = 0;
    let err = 1 - r;
    while (x >= y) {
      if (filled) {
        this.ctx.fillRect(x0 - x, y0 + y, x * 2 + 1, 1);
        this.ctx.fillRect(x0 - x, y0 - y, x * 2 + 1, 1);
        this.ctx.fillRect(x0 - y, y0 + x, y * 2 + 1, 1);
        this.ctx.fillRect(x0 - y, y0 - x, y * 2 + 1, 1);
      } else {
        for (const [px, py] of [
          [x, y],
          [y, x],
          [-y, x],
          [-x, y],
          [-x, -y],
          [-y, -x],
          [y, -x],
          [x, -y],
        ] as const) {
          this.ctx.fillRect(x0 + px, y0 + py, 1, 1);
        }
      }
      y++;
      if (err < 0) {
        err += 2 * y + 1;
      } else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  }

  image(image: PixelImage, x: number, y: number, options: ImageDrawOptions = {}): void {
    const source = options.source ?? { x: 0, y: 0, w: image.width, h: image.height };
    const [dx, dy] = [snap(x), snap(y)];
    const ctx = this.ctx;
    const alpha = options.alpha ?? 1;
    if (alpha <= 0) return;
    if (alpha >= 1 && !options.flipX) {
      ctx.drawImage(image, source.x, source.y, source.w, source.h, dx, dy, source.w, source.h);
      return;
    }
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (options.flipX) {
      ctx.translate(dx + source.w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(image, source.x, source.y, source.w, source.h, 0, 0, source.w, source.h);
    } else {
      ctx.drawImage(image, source.x, source.y, source.w, source.h, dx, dy, source.w, source.h);
    }
    ctx.restore();
  }

  /** Draws `animation` at `time` seconds with the sheet's origin (default bottom-centre) at (x, y). */
  sprite<A extends string>(
    sheet: SpriteSheet<A>,
    animation: A,
    time: number,
    x: number,
    y: number,
    options?: SpriteDrawOptions,
  ): void {
    sheet.draw(this.ctx, animation, time, snap(x), snap(y), options);
  }

  /** Draws text with the top-left of the first glyph cell at (x, y); `align` anchors each line on `x`. */
  text(text: string, x: number, y: number, style: TextStyle, options?: TextOptions): TextBlock {
    return drawText(this.ctx, style, text, snap(x), snap(y), options);
  }

  measureText(text: string, style: TextStyle, options?: TextOptions): TextBlock {
    return layoutText(style, text, options);
  }

  withAlpha(alpha: number, draw: () => void): void {
    if (alpha <= 0) return;
    this.ctx.save();
    this.ctx.globalAlpha *= Math.min(1, alpha);
    try {
      draw();
    } finally {
      this.ctx.restore();
    }
  }

  /** Restricts drawing inside `draw` to the given rectangle. */
  withClip(x: number, y: number, w: number, h: number, draw: () => void): void {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(snap(x), snap(y), snap(w), snap(h));
    this.ctx.clip();
    try {
      draw();
    } finally {
      this.ctx.restore();
    }
  }

  /** Shifts the origin by whole pixels, e.g. to apply a camera or a shake. */
  withOffset(dx: number, dy: number, draw: () => void): void {
    this.ctx.save();
    this.ctx.translate(snap(dx), snap(dy));
    try {
      draw();
    } finally {
      this.ctx.restore();
    }
  }

  #gradient(w: number, h: number, gradient: BandedGradient): HTMLCanvasElement {
    const key = JSON.stringify([w, h, gradient.stops, gradient.bands, gradient.direction, gradient.dither]);
    let canvas = this.#gradientCache.get(key);
    if (!canvas) {
      canvas = renderBandedGradient(w, h, gradient);
      // Gradients are keyed by size; cap the cache so animated sizes cannot grow it without bound.
      if (this.#gradientCache.size >= 64) {
        const oldest = this.#gradientCache.keys().next().value;
        if (oldest !== undefined) this.#gradientCache.delete(oldest);
      }
      this.#gradientCache.set(key, canvas);
    }
    return canvas;
  }
}

/** Integer pixel coordinate. Rounding (not flooring) keeps symmetric motion symmetric around zero. */
export function snap(value: number): number {
  return Math.round(value);
}

/**
 * Which band of `gradient` a w × h fill paints at (x, y), its dither rows
 * included: 0 for the first stop's band. Art that builds on the same
 * banding pixel by pixel, rather than drawing it with `fillRect`, starts
 * from this so the two always agree.
 */
export function bandAt(gradient: BandedGradient, w: number, h: number, x: number, y: number): number {
  const vertical = (gradient.direction ?? 'vertical') === 'vertical';
  const length = vertical ? h : w;
  const along = vertical ? y : x;
  const bands = Math.max(1, Math.min(gradient.bands, length));
  const edge = (i: number): number => Math.round((i * length) / bands);
  let band = 0;
  while (band < bands - 1 && along >= edge(band + 1)) band++;
  if (!gradient.dither || band === bands - 1) return band;
  const boundary = edge(band + 1);
  const rows = ditherRows(gradient.dither, boundary - edge(band));
  const coverage = rows[along - (boundary - rows.length)];
  return coverage !== undefined && ditherOn(gradient.dither, x, y, coverage) ? band + 1 : band;
}

/**
 * The coverage of the next band's colour in each of the last rows of a band
 * `bandSize` rows deep: a short dithered ramp leaking across every band edge,
 * cut short in bands too thin to hold it and its own flat row.
 */
function ditherRows(pattern: DitherPattern, bandSize: number): readonly number[] {
  const ramp = pattern === 'bayer2' ? [0.5] : [0.25, 0.5, 0.75];
  return ramp.slice(-Math.max(0, Math.min(ramp.length, bandSize - 1)));
}

function renderBandedGradient(w: number, h: number, gradient: BandedGradient): HTMLCanvasElement {
  const vertical = (gradient.direction ?? 'vertical') === 'vertical';
  const length = vertical ? h : w;
  const bands = Math.max(1, Math.min(gradient.bands, length));
  const colors = bandColors(gradient.stops, bands);
  const canvas = createCanvas(w, h);
  const ctx = context2d(canvas);
  const edge = (i: number): number => Math.round((i * length) / bands);

  colors.forEach((color, i) => {
    const start = edge(i);
    const size = edge(i + 1) - start;
    ctx.fillStyle = color;
    if (vertical) ctx.fillRect(0, start, w, size);
    else ctx.fillRect(start, 0, size, h);
  });

  if (gradient.dither) {
    const pattern = gradient.dither;
    for (let i = 0; i < bands - 1; i++) {
      const boundary = edge(i + 1);
      const rows = ditherRows(pattern, boundary - edge(i));
      ctx.fillStyle = colors[i + 1] as string;
      rows.forEach((coverage, r) => {
        const along = boundary - rows.length + r;
        const across = vertical ? w : h;
        for (let a = 0; a < across; a++) {
          const [px, py] = vertical ? [a, along] : [along, a];
          if (ditherOn(pattern, px, py, coverage)) ctx.fillRect(px, py, 1, 1);
        }
      });
    }
  }
  return canvas;
}
