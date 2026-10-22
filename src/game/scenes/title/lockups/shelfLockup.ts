import { profile } from '@/content';
import { BitmapFont, type GlyphFontData } from '@/engine/gfx/BitmapFont';
import type { Gfx } from '@/engine/gfx/Gfx';
import { type Rect, rect, union } from '@/engine/math/Rect';
import type { Vec2 } from '@/engine/math/Vec2';
import { raisedTitleLine, type TitleLogoLine, titleLogo } from '../../../art/logos';
import { type Kicker, type KickerStyle, paintKicker } from '../../../art/logos/kicker/kicker';
import type { InitialScale } from '../../../art/logos/product-engineer/lettering';
import type { LogoLine } from '../../../art/logos/product-engineer/logo';
import { bitmapToCanvas } from '../../../art/logos/raster/toCanvas';
import type { GlintTarget } from '../glint';
import type { LockupArt } from './TitleLockup';

/**
 * A lockup in Metal Slug's own arrangement: the top word's first letter
 * raised like the "M" of METAL SLUG, and the name on the shelf it leaves
 * above the rest of the word, as "SUPER VEHICLE-001" sits on "ETAL".
 */
export interface ShelfLockupRecipe {
  /** How much larger than the rest of the top word its first letter is drawn. */
  readonly initial: InitialScale;
  /** The name's typeface; it must cover every character of the name in the content. */
  readonly type: GlyphFontData;
  readonly style: KickerStyle;
  /** Where each line settles: the top-left of its cap box, in screen pixels. */
  readonly topLine: Vec2;
  readonly bottomLine: Vec2;
}

/** How tight the name sits, after the reference: close enough that the outlines nearly touch. */
const SEAT = {
  /** Empty columns between the initial's outline and the name's. */
  besideInitial: 2,
  /** Empty rows between the name's shadow and the outline of the letters below it. */
  aboveLine: 1,
} as const;

/** The trademark follows the bottom word, its foot a pixel below the baseline, as in the classic. */
const TRADEMARK_GAP = 7;

/** A name painted for the shelf and where its image's top-left sits in the top line's image. */
export interface SeatedName {
  readonly kicker: Kicker;
  readonly x: number;
  readonly y: number;
}

/**
 * Seats the name on the shelf of a raised top line: its last letter ends
 * flush with the line's top-right corner, its first starts just clear of
 * the initial, and its shadow stops a row short of the letters below. The
 * name is tracked out to span exactly that width.
 */
export function seatName(
  line: Pick<LogoLine, 'word' | 'shelf'>,
  font: BitmapFont,
  style: KickerStyle,
  name: string,
): SeatedName {
  const { shelf } = line;
  if (!shelf) throw new Error(`Shelf lockup: "${line.word}" has no raised initial to seat a name beside`);
  // Spacing changes neither the painted height nor what the outline and shadow add around the letters.
  const natural = paintKicker(font, name, style);
  const { height } = natural.image;
  const right = shelf.end + natural.image.width - natural.origin.x - natural.width;
  const leftAt = (bottom: number): number => shelf.clearOf(bottom - height + 1, bottom) + SEAT.besideInitial;
  const fits = (bottom: number): boolean => bottom < shelf.floor(leftAt(bottom), right) - SEAT.aboveLine;
  // Clear of the whole line, the seat fits wherever the name starts; it then drops while the letters below allow.
  let bottom = shelf.floor(0, right) - SEAT.aboveLine - 1;
  while (fits(bottom + 1)) bottom++;
  const left = leftAt(bottom);
  const kicker = paintKicker(font, name, style, shelf.end - (left + natural.origin.x) + 1);
  return { kicker, x: left, y: bottom - height + 1 };
}

/** Paints a shelf lockup: once, from the lockup's lazy `prepare`. */
export function paintShelfLockup(recipe: ShelfLockupRecipe): LockupArt {
  const { bottom, trademark } = titleLogo();
  const top = raisedTitleLine(recipe.initial);
  const seat = seatName(top, BitmapFont.fromGlyphData(recipe.type), recipe.style, profile.name.toUpperCase());
  const name = bitmapToCanvas(seat.kicker.image);
  const { topLine, bottomLine } = recipe;
  const trademarkTop = bottomLine.y + bottom.height - trademark.height + 1;

  // The top word comes in from the right and the bottom word from the left; the name and trademark ride on them.
  const place = (travel: number) => {
    const topX = topLine.x + travel;
    const bottomX = bottomLine.x - travel;
    return {
      topX,
      bottomX,
      name: { x: topX - top.origin.x + seat.x, y: topLine.y - top.origin.y + seat.y },
      trademarkLeft: bottomX + bottom.width + TRADEMARK_GAP,
    };
  };

  const settled = place(0);
  return {
    bounds: [
      lineBox(top, settled.topX, topLine.y),
      rect(settled.name.x, settled.name.y, name.width, name.height),
      lineBox(bottom, settled.bottomX, bottomLine.y),
      rect(settled.trademarkLeft, trademarkTop, trademark.width, trademark.height),
    ].reduce(union),
    glint: {
      targets: [shineAt(top, settled.topX, topLine.y), shineAt(bottom, settled.bottomX, bottomLine.y)],
      pivotY: bottomLine.y + bottom.height,
    },
    draw(gfx: Gfx, travel: number): void {
      const at = place(travel);
      drawLine(gfx, top, at.topX, topLine.y);
      gfx.image(name, at.name.x, at.name.y);
      drawLine(gfx, bottom, at.bottomX, bottomLine.y);
      gfx.image(trademark, at.trademarkLeft, trademarkTop);
    },
  };
}

/** Draws a painted word with its cap box's top-left at (x, y). */
function drawLine(gfx: Gfx, line: TitleLogoLine, x: number, y: number): void {
  gfx.image(line.image, x - line.origin.x, y - line.origin.y);
}

/** The box a painted word covers with its cap box's top-left at (x, y). */
function lineBox(line: TitleLogoLine, x: number, y: number): Rect {
  return rect(x - line.origin.x, y - line.origin.y, line.image.width, line.image.height);
}

/** Where a word's shine image sits with its cap box's top-left at (x, y). */
function shineAt(line: TitleLogoLine, x: number, y: number): GlintTarget {
  return { shine: line.shine, left: x - line.origin.x, top: y - line.origin.y };
}
