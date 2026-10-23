import { Bitmap } from '../raster/Bitmap';
import type { Mask, PixelBox } from '../raster/Mask';
import { type InitialScale, type Lettering, SLANT, setLettering } from './lettering';
import { paintLettering } from './paint';
import { measureShelf, type Shelf } from './shelf';

/** Cap heights of the two lines: the longer bottom word is set a little smaller, as SLUG is to METAL. */
const LINE_HEIGHTS = [44, 40] as const;
const SEEDS = [0x1996, 0x2024] as const;

export interface LogoLine {
  readonly word: string;
  readonly image: Bitmap;
  /** The letters' face alone in a pale shine colour, for the glint that sweeps across the settled logo. */
  readonly shine: Bitmap;
  /** Top-left of the line's upright cap box inside `image`, where its first letter starts on the cap line; align lines on this point. */
  readonly origin: { readonly x: number; readonly y: number };
  /**
   * What `image` actually paints, outline and extrusion included, inside its
   * transparent margin: lay lines out by this, not by the image's own box.
   */
  readonly ink: PixelBox;
  /**
   * The column where the first letter's face starts at its top: its
   * leftmost pixel in its top few rows, in `image` pixels. The slant
   * carries a letter right as it climbs, so this, not the face's leftmost
   * pixel, is where lettering set above the line lines up with it.
   */
  readonly faceStart: number;
  /** Cap height of the line. */
  readonly height: number;
  /** Upright width of the set word, from `origin` to the last letter's right edge. */
  readonly width: number;
  /** Width along the cap line, where the slant has carried the letters furthest right. */
  readonly capWidth: number;
  /** The room beside a raised first letter, or `null` when it is set like the rest. */
  readonly shelf: Shelf | null;
}

export interface TitleLogo {
  readonly top: LogoLine;
  readonly bottom: LogoLine;
}

/** Splits a two-word headline into the logo's lines, upper-cased. */
export function logoWords(headline: string): readonly [string, string] {
  const words = headline.trim().toUpperCase().split(/\s+/);
  if (words.length !== 2) throw new Error(`Title logo: expected a two-word headline, got "${headline}"`);
  return [words[0] as string, words[1] as string];
}

/**
 * Paints the two-line title logo — "PRODUCT" over "ENGINEER" — as
 * transparent bitmaps, one per line, so the lines can slide in separately.
 */
export function buildTitleLogo(headline: string): TitleLogo {
  const [top, bottom] = logoWords(headline);
  return { top: paintLine(top, 0), bottom: paintLine(bottom, 1) };
}

/**
 * The logo's top line on its own, its first letter raised by `initial` so a
 * name can sit beside it, as "SUPER VEHICLE-001" sits beside the "M" of
 * METAL SLUG. The bottom line does not change with it.
 */
export function buildRaisedTopLine(headline: string, initial: InitialScale): LogoLine {
  return paintLine(logoWords(headline)[0], 0, initial);
}

function paintLine(word: string, index: 0 | 1, initial?: InitialScale): LogoLine {
  const seed = SEEDS[index];
  const lettering: Lettering = setLettering(word, { height: LINE_HEIGHTS[index], seed, initial });
  const last = lettering.letters[lettering.letters.length - 1];
  const width = last ? last.x + last.w - lettering.origin.x : 0;
  const image = paintLettering(lettering, seed);
  const ink = image.bounds();
  if (!ink) throw new Error(`Title logo: "${word}" paints nothing`);
  return {
    word,
    image,
    shine: paintShine(lettering),
    origin: lettering.origin,
    ink,
    faceStart: topLeftColumn(lettering.first),
    height: lettering.height,
    width,
    capWidth: Math.round(width + lettering.height * SLANT),
    shelf: measureShelf(lettering),
  };
}

/**
 * How many of a letter's top rows its top-left corner is found in: few
 * enough that the slant, a pixel every five rows, barely moves the edge
 * across them, and enough that one row's wobble cannot decide it alone.
 */
const CORNER_ROWS = 3;

/** The leftmost column `mask` sets in its top `CORNER_ROWS` rows. */
function topLeftColumn(mask: Mask): number {
  const box = mask.bounds();
  if (!box) throw new Error('Title logo: the first letter paints nothing');
  const rows = Array.from({ length: CORNER_ROWS }, (_, i) => box.y + i);
  let x = box.x;
  while (!rows.some((y) => mask.has(x, y))) x++;
  return x;
}

const SHINE = '#fff7d0';

function paintShine(lettering: Lettering): Bitmap {
  const shine = new Bitmap(lettering.face.width, lettering.face.height);
  shine.fill(lettering.face, SHINE);
  return shine;
}
