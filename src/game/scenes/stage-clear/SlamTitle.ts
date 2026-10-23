import { context2d, createCanvas } from '@/engine/gfx/canvas';
import type { Gfx } from '@/engine/gfx/Gfx';
import { drawText, type TextStyle } from '@/engine/gfx/TextStyle';
import { frames, segment } from '@/engine/motion/progress';

/** Margin around each glyph for its outline (left/top) and drop shadow (right/bottom). */
const PAD = { left: 1, top: 1, right: 2, bottom: 3 } as const;
/** Extra whole-number scale steps a letter starts with before it lands. */
const PUNCH_STEPS = 2;
const FLASH_SECONDS = frames(2);

interface Letter {
  readonly image: HTMLCanvasElement;
  readonly flash: HTMLCanvasElement;
  /** Left edge of the glyph cell within its line, unscaled. */
  readonly x: number;
  readonly line: number;
}

export interface LetterTiming {
  readonly letterStart: (index: number) => number;
  readonly fall: number;
}

/**
 * Metal Slug-style "MISSION COMPLETE!" lettering: every letter punches in
 * on its own beat, oversized, slams down to size and flashes white on impact. Letters are
 * pre-rendered once and drawn at a whole-number scale, so the chunky 2×
 * lettering stays on the pixel grid.
 */
export class SlamTitle {
  readonly #letters: readonly Letter[];
  readonly #lineWidths: readonly number[];
  readonly #lineHeight: number;
  readonly #scale: number;

  constructor(lines: readonly string[], style: TextStyle, scale: number) {
    this.#scale = scale;
    this.#lineHeight = style.font.cellHeight + 4;
    const flashStyle: TextStyle = { ...style, fill: '#ffffff', outline: '#ffffff', shadow: undefined };
    const letters: Letter[] = [];
    this.#lineWidths = lines.map((text, line) => {
      let pen = 0;
      for (const char of text) {
        const advance = style.font.glyph(char).advance;
        if (char.trim()) {
          letters.push({ image: renderGlyph(char, style), flash: renderGlyph(char, flashStyle), x: pen, line });
        }
        pen += advance;
      }
      return pen;
    });
    this.#letters = letters;
  }

  get letterCount(): number {
    return this.#letters.length;
  }

  /** Total height of the block at its scale, for centring. */
  get height(): number {
    return this.#lineWidths.length * this.#lineHeight * this.#scale;
  }

  /** Draws the block horizontally centred on `centerX` with its top at `top`. */
  render(gfx: Gfx, centerX: number, top: number, time: number, timing: LetterTiming): void {
    const scale = this.#scale;
    this.#letters.forEach((letter, index) => {
      const start = timing.letterStart(index);
      if (time < start) return;
      // Punch in towards the viewer: the letter arrives a few whole scale steps too big and slams down to size.
      const approach = segment(time, start, start + timing.fall);
      const size = scale + Math.max(0, PUNCH_STEPS - Math.floor(approach * (PUNCH_STEPS + 1)));
      const lineLeft = centerX - Math.floor(((this.#lineWidths[letter.line] ?? 0) * scale) / 2);
      const left = lineLeft + (letter.x - PAD.left) * scale;
      const lineTop = top + letter.line * this.#lineHeight * scale - PAD.top * scale;
      const landed = time - (start + timing.fall);
      const image = landed >= 0 && landed < FLASH_SECONDS ? letter.flash : letter.image;
      const w = image.width * size;
      const h = image.height * size;
      const x = left + Math.round((image.width * scale - w) / 2);
      const y = lineTop + Math.round((image.height * scale - h) / 2);
      gfx.ctx.drawImage(image, x, y, w, h);
    });
  }
}

function renderGlyph(char: string, style: TextStyle): HTMLCanvasElement {
  const glyph = style.font.glyph(char);
  const canvas = createCanvas(glyph.advance + PAD.left + PAD.right, style.font.cellHeight + PAD.top + PAD.bottom);
  drawText(context2d(canvas), style, char, PAD.left, PAD.top);
  return canvas;
}
