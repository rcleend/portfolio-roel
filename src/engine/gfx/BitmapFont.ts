import { context2d, createCanvas } from './canvas';

/**
 * A 1-bit pixel font. Glyphs are bitmaps, never vector outlines, so text is
 * as crisp as sprites at native resolution and can be styled per pixel
 * (banded fills, outlines, shadows) by `TextStyle`.
 */
export interface Glyph {
  /** Bitmap width in pixels; `bits` holds `width × cellHeight` entries, row-major, 1 = ink. */
  readonly width: number;
  readonly bits: Uint8Array;
  /** Horizontal distance to the next glyph's origin, letter spacing included. */
  readonly advance: number;
  /** Width up to and including the rightmost inked column; used to measure the last glyph of a line. */
  readonly inkWidth: number;
}

/** Hand-authored glyphs: `#` is ink, `.` is empty. */
export interface GlyphFontData {
  readonly name: string;
  /** Rows per glyph; shorter glyphs are padded at the bottom. */
  readonly cellHeight: number;
  /** Rows from the top of the cell down to and including the baseline row. */
  readonly ascent: number;
  readonly lineHeight: number;
  /** Empty columns between glyphs. */
  readonly letterSpacing: number;
  /** Advance of the space character, letter spacing excluded. */
  readonly spaceWidth: number;
  /** Shown for characters the font lacks. Defaults to `?`. */
  readonly fallback?: string;
  readonly glyphs: Readonly<Record<string, readonly string[]>>;
}

/** A pixel TTF rendered at its native size and alpha-thresholded to 1 bit. */
export interface TtfFontOptions {
  readonly name: string;
  /** CSS font family; the font must already be loaded (see `AssetStore.loadFont`). */
  readonly family: string;
  /** Native pixel size the font was designed for — any other size will not be crisp. */
  readonly size: number;
  readonly weight?: number | string;
  /** Every character to rasterise. Space is handled separately. */
  readonly chars: string;
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  /** Alpha (0–255) at or above which a pixel counts as ink. */
  readonly threshold?: number;
}

export class BitmapFontError extends Error {
  override readonly name = 'BitmapFontError';
}

const SPACE = ' ';

export class BitmapFont {
  readonly name: string;
  readonly cellHeight: number;
  readonly ascent: number;
  readonly lineHeight: number;
  readonly #glyphs: ReadonlyMap<string, Glyph>;
  readonly #fallback: Glyph;

  private constructor(
    name: string,
    cellHeight: number,
    ascent: number,
    lineHeight: number,
    glyphs: Map<string, Glyph>,
    fallback: string,
  ) {
    this.name = name;
    this.cellHeight = cellHeight;
    this.ascent = ascent;
    this.lineHeight = lineHeight;
    this.#glyphs = glyphs;
    const fallbackGlyph = glyphs.get(fallback);
    if (!fallbackGlyph) throw new BitmapFontError(`Font "${name}": fallback glyph "${fallback}" is missing`);
    this.#fallback = fallbackGlyph;
  }

  static fromGlyphData(data: GlyphFontData): BitmapFont {
    const glyphs = new Map<string, Glyph>();
    const fail = (message: string): never => {
      throw new BitmapFontError(`Font "${data.name}": ${message}`);
    };
    if (data.ascent < 1 || data.ascent > data.cellHeight)
      fail(`ascent ${data.ascent} must be within 1..${data.cellHeight}`);
    for (const [char, rows] of Object.entries(data.glyphs)) {
      if ([...char].length !== 1) fail(`glyph key "${char}" must be a single character`);
      if (rows.length === 0 || rows.length > data.cellHeight) {
        fail(`glyph "${char}" has ${rows.length} rows, expected 1..${data.cellHeight}`);
      }
      const width = (rows[0] as string).length;
      const bits = new Uint8Array(width * data.cellHeight);
      let inkWidth = 0;
      rows.forEach((row, y) => {
        if (row.length !== width) fail(`glyph "${char}" row ${y} is ${row.length} wide, expected ${width}`);
        [...row].forEach((cell, x) => {
          if (cell !== '#' && cell !== '.')
            fail(`glyph "${char}" row ${y} has "${cell}"; use "#" for ink and "." for empty`);
          if (cell === '#') {
            bits[y * width + x] = 1;
            inkWidth = Math.max(inkWidth, x + 1);
          }
        });
      });
      glyphs.set(char, { width, bits, advance: width + data.letterSpacing, inkWidth: Math.max(inkWidth, 1) });
    }
    glyphs.set(SPACE, emptyGlyph(data.spaceWidth + data.letterSpacing, data.cellHeight));
    return new BitmapFont(data.name, data.cellHeight, data.ascent, data.lineHeight, glyphs, data.fallback ?? '?');
  }

  /**
   * Rasterises a loaded web font. Pixel TTFs are only crisp at their design
   * size; the alpha threshold removes the faint anti-aliasing fringe the
   * browser adds anyway, leaving a true 1-bit glyph.
   */
  static fromTtf(options: TtfFontOptions): BitmapFont {
    const { size, threshold = 128, letterSpacing = 0 } = options;
    const font = `${options.weight ?? 'normal'} ${size}px "${options.family}"`;
    const pad = size;
    const scratch = createCanvas(size * 3, size * 3);
    const ctx = context2d(scratch, { willReadFrequently: true });
    const baseline = pad + size;

    const raw = new Map<string, { ink: Uint8Array; advance: number }>();
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const char of new Set(options.chars.replace(/ /g, ''))) {
      ctx.clearRect(0, 0, scratch.width, scratch.height);
      ctx.font = font;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff';
      ctx.fillText(char, pad, baseline);
      const { data } = ctx.getImageData(0, 0, scratch.width, scratch.height);
      const ink = new Uint8Array(scratch.width * scratch.height);
      for (let i = 0; i < ink.length; i++) {
        if ((data[i * 4 + 3] as number) >= threshold) {
          ink[i] = 1;
          const y = Math.floor(i / scratch.width);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
      raw.set(char, { ink, advance: Math.round(ctx.measureText(char).width) });
    }
    if (!Number.isFinite(top)) {
      throw new BitmapFontError(`Font "${options.name}": "${options.family}" rendered no ink — is the font loaded?`);
    }

    const cellHeight = bottom - top + 1;
    const glyphs = new Map<string, Glyph>();
    for (const [char, { ink, advance }] of raw) {
      let inkWidth = 0;
      for (let y = top; y <= bottom; y++) {
        for (let x = pad; x < scratch.width; x++) {
          if (ink[y * scratch.width + x]) inkWidth = Math.max(inkWidth, x - pad + 1);
        }
      }
      const width = Math.max(advance, inkWidth, 1);
      const bits = new Uint8Array(width * cellHeight);
      for (let y = 0; y < cellHeight; y++) {
        for (let x = 0; x < width; x++) bits[y * width + x] = ink[(top + y) * scratch.width + pad + x] ?? 0;
      }
      glyphs.set(char, { width, bits, advance: advance + letterSpacing, inkWidth: Math.max(inkWidth, 1) });
    }
    const spaceAdvance = (() => {
      ctx.font = font;
      return Math.round(ctx.measureText(SPACE).width);
    })();
    glyphs.set(SPACE, emptyGlyph(spaceAdvance + letterSpacing, cellHeight));
    const fallback = glyphs.has('?') ? '?' : (raw.keys().next().value as string);
    // Ink for the baseline row sits just above the alphabetic baseline y.
    return new BitmapFont(
      options.name,
      cellHeight,
      baseline - top,
      options.lineHeight ?? cellHeight + 2,
      glyphs,
      fallback,
    );
  }

  has(char: string): boolean {
    return this.#glyphs.has(char);
  }

  glyph(char: string): Glyph {
    return this.#glyphs.get(char) ?? this.#fallback;
  }

  /** Every character with its own glyph (space included). */
  get chars(): readonly string[] {
    return [...this.#glyphs.keys()];
  }

  /** Width in pixels of a single line; the last glyph counts only up to its ink. */
  measure(text: string): number {
    let width = 0;
    let last: Glyph | null = null;
    for (const char of text) {
      if (last) width += last.advance;
      last = this.glyph(char);
    }
    return last ? width + (last === this.#glyphs.get(SPACE) ? last.advance : last.inkWidth) : 0;
  }
}

function emptyGlyph(advance: number, cellHeight: number): Glyph {
  return {
    width: Math.max(advance, 1),
    bits: new Uint8Array(Math.max(advance, 1) * cellHeight),
    advance,
    inkWidth: advance,
  };
}
