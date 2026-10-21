import { context2d, createCanvas } from '@/engine/gfx/canvas';
import type { Gfx } from '@/engine/gfx/Gfx';
import { drawText, type TextStyle } from '@/engine/gfx/TextStyle';

const PADDING = 4;
/** Share of ink pixels knocked out, so the stamp reads as rubber on paper rather than a UI badge. */
const WEAR = 0.2;

export interface StampOptions {
  /** Fill behind the ink, so the stamp stays legible over a busy picture (a stamped label rather than bare ink). */
  readonly paper?: string;
}

export interface StampDrawOptions {
  /** Integer scale; the stamp is drawn 2× for the frames before it "hits" the paper. */
  readonly scale?: 1 | 2;
  /**
   * Fakes a hand-stamped tilt without rotating pixels: every `tilt` rows the
   * row shifts one pixel, a stepped skew that stays on the pixel grid.
   * Positive leans the top to the right; 0 keeps it level.
   */
  readonly tilt?: number;
}

/**
 * A rubber-stamp mark ("CLEARED", "DEPLOY!"): label text in a double frame,
 * with a deterministic worn-ink texture. Rendered once to its own canvas.
 */
export class InkStamp {
  readonly #canvas: HTMLCanvasElement;

  constructor(label: string, style: TextStyle, options: StampOptions = {}) {
    const color = typeof style.fill === 'string' ? style.fill : (style.fill[0] ?? '#e2352d');
    const text = { font: style.font, fill: color };
    const size = { w: style.font.measure(label) + PADDING * 2 + 2, h: style.font.cellHeight + PADDING * 2 };
    const ink = createCanvas(size.w, size.h);
    const inkCtx = context2d(ink);
    inkCtx.fillStyle = color;
    strokeRect(inkCtx, 0, 0, size.w, size.h);
    strokeRect(inkCtx, 2, 2, size.w - 4, size.h - 4);
    // Only the frame is worn: knocking pixels out of 8 px lettering would make it illegible.
    wear(inkCtx, size.w, size.h);
    drawText(inkCtx, text, label, PADDING + 1, PADDING, {});

    this.#canvas = createCanvas(size.w, size.h);
    const ctx = context2d(this.#canvas);
    if (options.paper) {
      ctx.fillStyle = options.paper;
      ctx.fillRect(1, 1, size.w - 2, size.h - 2);
    }
    ctx.drawImage(ink, 0, 0);
  }

  get width(): number {
    return this.#canvas.width;
  }

  get height(): number {
    return this.#canvas.height;
  }

  /** Draws with the stamp's centre at (cx, cy). */
  draw(gfx: Gfx, cx: number, cy: number, options: StampDrawOptions = {}): void {
    const scale = options.scale ?? 1;
    const tilt = options.tilt ?? 0;
    const { width, height } = this.#canvas;
    const left = Math.round(cx - (width * scale) / 2);
    const top = Math.round(cy - (height * scale) / 2);
    for (let row = 0; row < height; row++) {
      const shift = tilt === 0 ? 0 : Math.sign(tilt) * Math.floor((height - 1 - row) / Math.abs(tilt));
      gfx.ctx.drawImage(this.#canvas, 0, row, width, 1, left + shift * scale, top + row * scale, width * scale, scale);
    }
  }
}

function strokeRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}

function wear(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (hash01(x, y) < WEAR) ctx.clearRect(x, y, 1, 1);
  }
}

/** Stable per-pixel noise: the same stamp looks identically worn every frame and every run. */
function hash01(x: number, y: number): number {
  let h = Math.imul(x * 374761393 + y * 668265263, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
