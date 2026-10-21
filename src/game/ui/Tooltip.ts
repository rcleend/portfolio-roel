import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { clamp } from '@/engine/math/scalar';
import { Paragraph } from './Paragraph';
import { WINDOW_BORDER, type WindowTheme } from './theme';
import { drawWindow } from './Window';

/** Size of the window, as a fraction of its final size, on each frame of the pop-in. */
const POP_IN = [0.35, 0.75, 1, 1] as const;
const PADDING = WINDOW_BORDER + 2;

export interface TooltipOptions {
  readonly maxWidth: number;
  readonly theme: WindowTheme;
  readonly style: TextStyle;
}

/**
 * A pixel tooltip that pops in over four frames: it grows from its anchor,
 * overshoots its final size by one pixel on the third frame, then settles.
 * Text appears only once the window has settled.
 */
export class Tooltip {
  readonly #options: TooltipOptions;
  #paragraph: Paragraph | null = null;
  #text: string | null = null;
  #frame = 0;

  constructor(options: TooltipOptions) {
    this.#options = options;
  }

  get visible(): boolean {
    return this.#paragraph !== null;
  }

  /** Shows `text`; calling again with the same text keeps the current animation. */
  show(text: string): void {
    if (text === this.#text) return;
    this.#text = text;
    this.#paragraph = new Paragraph(text, this.#options.style, { maxWidth: this.#options.maxWidth - PADDING * 2 });
    this.#frame = 0;
  }

  hide(): void {
    this.#text = null;
    this.#paragraph = null;
  }

  /** Advance by one fixed step. */
  update(): void {
    if (this.#paragraph) this.#frame++;
  }

  /** Width and height once fully open, for positioning before drawing. */
  get size(): { readonly w: number; readonly h: number } {
    const block = this.#paragraph?.block;
    if (!block) return { w: 0, h: 0 };
    return { w: block.width + PADDING * 2, h: block.height + PADDING * 2 };
  }

  /** Draws with the window's top-left at (x, y), clamped inside the screen. */
  render(gfx: Gfx, x: number, y: number): void {
    const paragraph = this.#paragraph;
    if (!paragraph) return;
    const { w, h } = this.size;
    const left = clamp(Math.round(x), 0, gfx.width - w);
    const top = clamp(Math.round(y), 0, gfx.height - h);
    const step = Math.min(this.#frame, POP_IN.length - 1);
    const scale = POP_IN[step] as number;
    // Frame 2 is the overshoot: one pixel larger on every side.
    const overshoot = step === 2 ? 1 : 0;
    const cw = Math.max(WINDOW_BORDER * 2 + 2, Math.round(w * scale)) + overshoot * 2;
    const ch = Math.max(WINDOW_BORDER * 2 + 2, Math.round(h * scale)) + overshoot * 2;
    const cx = left + Math.round((w - cw) / 2);
    const cy = top + Math.round((h - ch) / 2);
    drawWindow(gfx, { x: cx, y: cy, w: cw, h: ch }, this.#options.theme);
    if (step === POP_IN.length - 1) paragraph.render(gfx, left + PADDING, top + PADDING);
  }
}
