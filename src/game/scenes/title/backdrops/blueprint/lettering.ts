import { BitmapFont, type GlyphFontData, parseGlyphSheet } from '@/engine/gfx/BitmapFont';
import { context2d, createCanvas } from '@/engine/gfx/canvas';
import { lazy } from '../../../../art/logos/lazy';
import { shadeOf } from './inks';

/**
 * Drafting lettering: single-stroke 3 × 5 capitals, the smallest legible
 * hand on a 320 × 240 sheet, for the zone margin, the dimensions and the
 * plotter's labels. M, N, W and Ø need more room and get it; 0 is square so
 * it never reads as O.
 */
const draftingFont: GlyphFontData = {
  name: 'drafting',
  cellHeight: 5,
  ascent: 5,
  lineHeight: 7,
  letterSpacing: 1,
  spaceWidth: 2,
  glyphs: parseGlyphSheet(`
= A
.#.
#.#
###
#.#
#.#

= B
##.
#.#
##.
#.#
##.

= C
.##
#..
#..
#..
.##

= D
##.
#.#
#.#
#.#
##.

= E
###
#..
##.
#..
###

= F
###
#..
##.
#..
#..

= G
.##
#..
#.#
#.#
.##

= H
#.#
#.#
###
#.#
#.#

= I
###
.#.
.#.
.#.
###

= J
..#
..#
..#
#.#
.#.

= K
#.#
#.#
##.
#.#
#.#

= L
#..
#..
#..
#..
###

= M
#...#
##.##
#.#.#
#...#
#...#

= N
#..#
##.#
#.##
#..#
#..#

= O
.#.
#.#
#.#
#.#
.#.

= P
##.
#.#
##.
#..
#..

= Q
.#.
#.#
#.#
##.
.##

= R
##.
#.#
##.
#.#
#.#

= S
.##
#..
.#.
..#
##.

= T
###
.#.
.#.
.#.
.#.

= U
#.#
#.#
#.#
#.#
###

= V
#.#
#.#
#.#
.#.
.#.

= W
#...#
#...#
#.#.#
##.##
#...#

= X
#.#
#.#
.#.
#.#
#.#

= Y
#.#
#.#
.#.
.#.
.#.

= Z
###
..#
.#.
#..
###

= 0
###
#.#
#.#
#.#
###

= 1
.#.
##.
.#.
.#.
###

= 2
##.
..#
.#.
#..
###

= 3
##.
..#
.#.
..#
##.

= 4
#.#
#.#
###
..#
..#

= 5
###
#..
##.
..#
##.

= 6
.##
#..
###
#.#
###

= 7
###
..#
.#.
.#.
.#.

= 8
###
#.#
###
#.#
###

= 9
###
#.#
###
..#
##.

= -
...
...
###
...
...

= .
.
.
.
.
#

= :
.
#
.
#
.

= /
..#
..#
.#.
#..
#..

= ?
##.
..#
.#.
...
.#.

= Ø
.###.
#..##
#.#.#
##..#
.###.
`),
};

export const draftingType = lazy(() => BitmapFont.fromGlyphData(draftingFont));

/** Cap height of drafting lettering, in pixels. */
export const LETTER_HEIGHT = draftingFont.cellHeight;

/**
 * The pixels `text` inks with the top-left of its first glyph cell at
 * (x, y), column by column from the left: the order a plotter writes them.
 */
export function glyphPixels(text: string, x: number, y: number): [number, number][] {
  const font = draftingType();
  const pixels: [number, number][] = [];
  let penX = x;
  for (const char of text) {
    const glyph = font.glyph(char);
    for (let col = 0; col < glyph.width; col++) {
      for (let row = 0; row < font.cellHeight; row++) {
        if (glyph.bits[row * glyph.width + col]) pixels.push([penX + col, y + row]);
      }
    }
    penX += glyph.advance;
  }
  return pixels;
}

/** Width of `text` in drafting lettering, in pixels. */
export function letteredWidth(text: string): number {
  return draftingType().measure(text);
}

/**
 * A few characters pre-lettered in a few inks, for text that changes from
 * frame to frame (the ticking dimensions): drawing it is a copy per
 * character, with nothing laid out or allocated.
 */
export class LetteringAtlas {
  readonly #canvas: HTMLCanvasElement;
  readonly #chars: string;
  readonly #inks: readonly number[];
  readonly #cell: number;

  constructor(chars: string, inks: readonly number[]) {
    const font = draftingType();
    this.#chars = chars;
    this.#inks = inks;
    this.#cell = Math.max(...[...chars].map((char) => font.glyph(char).width));
    this.#canvas = createCanvas(this.#cell * chars.length, LETTER_HEIGHT * inks.length);
    const ctx = context2d(this.#canvas);
    inks.forEach((ink, row) => {
      ctx.fillStyle = shadeOf(ink);
      [...chars].forEach((char, column) => {
        for (const [px, py] of glyphPixels(char, column * this.#cell, row * LETTER_HEIGHT)) ctx.fillRect(px, py, 1, 1);
      });
    });
  }

  /** Letters `text` at (x, y) in `ink`, which must be one the atlas was made with; other characters are skipped. */
  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, ink: number): void {
    const row = this.#inks.indexOf(ink);
    if (row < 0) return;
    const font = draftingType();
    let penX = Math.round(x);
    for (let i = 0; i < text.length; i++) {
      const char = text.charAt(i);
      const column = this.#chars.indexOf(char);
      const glyph = font.glyph(char);
      if (column >= 0) {
        ctx.drawImage(
          this.#canvas,
          column * this.#cell,
          row * LETTER_HEIGHT,
          glyph.width,
          LETTER_HEIGHT,
          penX,
          Math.round(y),
          glyph.width,
          LETTER_HEIGHT,
        );
      }
      penX += glyph.advance;
    }
  }
}
