import type { Gfx } from '@/engine/gfx/Gfx';
import { layoutText, type TextBlock, type TextStyle } from '@/engine/gfx/TextStyle';
import type { TextAlign } from '@/engine/gfx/textLayout';

/**
 * A block of wrapped text, laid out once. Rendering can be limited to the
 * first N characters, which is how `TypewriterText` reveals text without the
 * lines re-flowing as they grow.
 */
export class Paragraph {
  readonly style: TextStyle;
  readonly block: TextBlock;
  readonly align: TextAlign;
  readonly #width: number;

  constructor(text: string, style: TextStyle, options: { readonly maxWidth: number; readonly align?: TextAlign }) {
    this.style = style;
    this.align = options.align ?? 'left';
    this.#width = options.maxWidth;
    this.block = layoutText(style, text, { maxWidth: options.maxWidth });
  }

  /** Visible characters, excluding the line breaks introduced by wrapping. */
  get length(): number {
    return this.block.lines.reduce((sum, line) => sum + [...line].length, 0);
  }

  get height(): number {
    return this.block.height;
  }

  /** Draws at (x, y) = top-left of the box; `visibleChars` truncates the text in reading order. */
  render(gfx: Gfx, x: number, y: number, visibleChars = Number.POSITIVE_INFINITY): void {
    let remaining = visibleChars;
    const anchorX =
      this.align === 'center' ? x + Math.floor(this.#width / 2) : this.align === 'right' ? x + this.#width : x;
    this.block.lines.forEach((line, index) => {
      if (remaining <= 0) return;
      const chars = [...line];
      const shown = chars.slice(0, Math.min(chars.length, remaining)).join('');
      remaining -= chars.length;
      // Align on the full line so a half-typed line does not slide sideways.
      const fullWidth = this.style.font.measure(line);
      const left =
        this.align === 'center'
          ? anchorX - Math.floor(fullWidth / 2)
          : this.align === 'right'
            ? anchorX - fullWidth
            : anchorX;
      gfx.text(shown, left, y + index * this.block.lineHeight, this.style);
    });
  }
}
