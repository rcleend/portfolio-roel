import { Bitmap } from '../raster/Bitmap';
import { type Lettering, SLANT, setLettering } from './lettering';
import { paintLettering } from './paint';

/** Cap heights of the two lines: the longer bottom word is set a little smaller, as SLUG is to METAL. */
const LINE_HEIGHTS = [44, 40] as const;
const SEEDS = [0x1996, 0x2024] as const;

export interface LogoLine {
  readonly word: string;
  readonly image: Bitmap;
  /** The letters' face alone in a pale shine colour, for the glint that sweeps across the settled logo. */
  readonly shine: Bitmap;
  /** Top-left of the first letter's upright box inside `image`; align lines on this point. */
  readonly origin: { readonly x: number; readonly y: number };
  /** Cap height of the line. */
  readonly height: number;
  /** Upright width of the set word, from `origin` to the last letter's right edge. */
  readonly width: number;
  /** Width along the cap line, where the slant has carried the letters furthest right. */
  readonly capWidth: number;
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

function paintLine(word: string, index: 0 | 1): LogoLine {
  const seed = SEEDS[index];
  const lettering: Lettering = setLettering(word, { height: LINE_HEIGHTS[index], seed });
  const last = lettering.letters[lettering.letters.length - 1];
  const width = last ? last.x + last.w - lettering.origin.x : 0;
  return {
    word,
    image: paintLettering(lettering, seed),
    shine: paintShine(lettering),
    origin: lettering.origin,
    height: lettering.height,
    width,
    capWidth: Math.round(width + lettering.height * SLANT),
  };
}

const SHINE = '#fff7d0';

function paintShine(lettering: Lettering): Bitmap {
  const shine = new Bitmap(lettering.face.width, lettering.face.height);
  shine.fill(lettering.face, SHINE);
  return shine;
}
