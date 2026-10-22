import type { BitmapFont, Glyph } from '@/engine/gfx/BitmapFont';
import { parseHex } from '@/engine/gfx/color';
import { Bitmap } from '../raster/Bitmap';
import { Mask } from '../raster/Mask';

/**
 * How a kicker is painted. Metal Slug's "SUPER VEHICLE-001" is cream, each
 * upright stroke shaded tan on the side facing into its letter, inside a
 * dark outline with a darker drop shadow.
 */
export interface KickerStyle {
  /** Face colours, one flat band each, stacked top to bottom over the cap height. */
  readonly face: readonly [string, ...string[]];
  /** Turns the inner pixel of every upright stroke this colour, so strokes read as rounded rather than flat. */
  readonly shade?: string;
  /** Lights the top pixel of every stroke, like the rim of a stamped plate. */
  readonly highlight?: string;
  readonly outline: string;
  /** Hard drop shadow of the outlined letters. */
  readonly shadow: { readonly color: string; readonly x: number; readonly y: number };
}

/** A painted kicker and where its letters sit in the image. */
export interface Kicker {
  readonly image: Bitmap;
  /** Top-left of the first letter's cell, on the cap line, inside `image`. */
  readonly origin: { readonly x: number; readonly y: number };
  /** From the first letter's left edge to the last letter's right edge. */
  readonly width: number;
  /** Cap height: the font's cell. */
  readonly height: number;
}

/**
 * Paints `text` in `font` as a kicker. Given a `span`, the letters spread
 * evenly until the line is exactly that wide, the way a letterer tracks a
 * line out to fill the space it was given; no two gaps differ by more than
 * a pixel. Throws when the text is already wider than the span.
 */
export function paintKicker(font: BitmapFont, text: string, style: KickerStyle, span?: number): Kicker {
  const chars = [...text];
  const gaps = chars.length - 1;
  const natural = font.measure(text);
  const extra = (span ?? natural) - natural;
  if (extra < 0) throw new Error(`Kicker: "${text}" is ${natural} px wide, wider than its ${span} px span`);
  if (extra > 0 && gaps < 1) throw new Error(`Kicker: "${text}" has no gaps to spread over ${span} px`);
  const pad = 1 + Math.max(Math.abs(style.shadow.x), Math.abs(style.shadow.y));
  const width = natural + extra + pad * 2;
  const height = font.cellHeight + pad * 2;
  let face = new Mask(width, height);
  let shade = new Mask(width, height);
  let pen = pad;
  chars.forEach((char, index) => {
    const glyph = font.glyph(char);
    // A mask keeps the array it is given; copy it so no mask ever aliases the font's glyph.
    face = face.union(new Mask(glyph.width, font.cellHeight, glyph.bits.slice()), pen, pad);
    if (style.shade) shade = shade.union(innerEdges(glyph, font.cellHeight), pen, pad);
    pen += glyph.advance + share(extra, gaps, index);
  });

  const body = face.dilate();
  const shadow = new Mask(width, height).union(body, style.shadow.x, style.shadow.y).subtract(body);
  // Crop to what is painted, so the image's edges are the outline's and the shadow's, and bounds stay exact.
  const box = body.union(shadow).bounds() ?? { x: 0, y: 0, w: width, h: height };
  const bands = style.face.map(parseHex);
  const image = new Bitmap(box.w, box.h);
  image.fill(shadow, style.shadow.color, -box.x, -box.y);
  image.fill(body.subtract(face), style.outline, -box.x, -box.y);
  image.fill(face, (_, y) => bandAt(bands, y + box.y - pad, font.cellHeight), -box.x, -box.y);
  if (style.shade) image.fill(shade, style.shade, -box.x, -box.y);
  if (style.highlight) image.fill(face.subtract(face, 0, 1), style.highlight, -box.x, -box.y);
  return { image, origin: { x: pad - box.x, y: pad - box.y }, width: natural + extra, height: font.cellHeight };
}

/** The flat band a face row falls in when `bands` are stacked evenly over the cap height. */
function bandAt<T>(bands: readonly T[], row: number, height: number): T | null {
  return bands[Math.min(Math.floor((Math.max(0, row) * bands.length) / height), bands.length - 1)] ?? null;
}

/** The pixels `extra` adds after letter `index` of a line with `gaps` gaps, spread so no two gaps differ by more than one. */
function share(extra: number, gaps: number, index: number): number {
  if (index >= gaps) return 0;
  return Math.floor(((index + 1) * extra) / gaps) - Math.floor((index * extra) / gaps);
}

/** Runs of ink this many pixels across are upright strokes; wider runs are bars, narrower ones hairlines. */
const STROKE = { min: 3, max: 4 } as const;

/**
 * In every row, the pixel of each upright stroke that faces the middle of
 * its letter: the right edge of a left stem, the left edge of a right one.
 * Bars, too wide to be strokes, and hairlines, too thin to give a pixel up,
 * stay flat.
 */
function innerEdges(glyph: Glyph, cellHeight: number): Mask {
  const bits = new Uint8Array(glyph.width * cellHeight);
  const ink = (x: number, y: number): boolean => glyph.bits[y * glyph.width + x] === 1;
  const middle = (glyph.inkWidth - 1) / 2;
  for (let y = 0; y < cellHeight; y++) {
    for (let x = 0; x < glyph.width; ) {
      if (!ink(x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x < glyph.width && ink(x, y)) x++;
      if (x - start < STROKE.min || x - start > STROKE.max) continue;
      const inner = (start + x - 1) / 2 > middle ? start : x - 1;
      bits[y * glyph.width + inner] = 1;
    }
  }
  return new Mask(glyph.width, cellHeight, bits);
}
