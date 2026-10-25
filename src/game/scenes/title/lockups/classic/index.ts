import { profile } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { type TextStyle, textBounds, textInk } from '@/engine/gfx/TextStyle';
import { type Rect, rect, union } from '@/engine/math/Rect';
import { condensedType, LOCKUP_INK, type TitleLogoLine, titleLogo } from '../../../../art/logos';
import { lazy } from '../../../../art/logos/lazy';
import { palette } from '../../../../palette';
import type { GlintTarget } from '../../glint';
import { TITLE_LAYOUT } from '../../layout';
import type { LockupArt, TitleLockup } from '../TitleLockup';

/**
 * How the lockup sits, in screen pixels. Its rows are fixed; its columns
 * follow from what the art inks, so the settled lockup is centred on screen
 * whatever the letters paint.
 */
const LAYOUT = {
  /** The cap line of each word, where its first letter's top-left sits. */
  topLineY: 40,
  bottomLineY: 88,
  /** ENGINEER starts this far left of PRODUCT, staggering the slanted lines. */
  bottomLineShift: -12,
  /** Empty rows between the name row's glyph cells and PRODUCT's cap line. */
  rowGap: 6,
  /** The trademark follows the bottom word, its foot a pixel below the baseline. */
  trademarkGap: 7,
} as const;

/**
 * Metal Slug's lockup (docs/ART-DIRECTION.md › Title): the headline in two
 * rough, rust-banded lines, "PRODUCT" over "ENGINEER", under a row in the
 * "SUPER VEHICLE-001" kicker's face, the name and the site joined by a
 * middle dot and flush right, and a small trademark after the bottom word.
 */
export const classicLockup: TitleLockup<'classic'> = {
  id: 'classic',
  name: 'Classic',
  description: 'PRODUCT over ENGINEER in rusted slab letters, under the name · PORTFOLIO in one row, flush right.',
  prepare: lazy(paintClassicLockup),
};

function paintClassicLockup(): LockupArt {
  const { top, bottom, trademark } = titleLogo();
  const row = `${profile.name} · ${profile.site}`.toUpperCase();
  const rowStyle: TextStyle = {
    font: condensedType(),
    fill: palette.cream,
    outline: LOCKUP_INK,
    shadow: { color: LOCKUP_INK, x: 1, y: 1 },
  };
  const rowTop = LAYOUT.topLineY - rowStyle.font.cellHeight - LAYOUT.rowGap;
  const trademarkTop = LAYOUT.bottomLineY + bottom.height - trademark.height + 1;

  // Measure the header's ink with PRODUCT starting at x = 0, then centre it on screen.
  const header = [
    lineInk(top, 0, LAYOUT.topLineY),
    lineInk(bottom, LAYOUT.bottomLineShift, LAYOUT.bottomLineY),
    // Its outline reaches every edge of its image, so the trademark inks the whole of it.
    rect(LAYOUT.bottomLineShift + bottom.width + LAYOUT.trademarkGap, trademarkTop, trademark.width, trademark.height),
  ].reduce(union);
  const settledTopX = Math.floor((TITLE_LAYOUT.screen.width - header.w) / 2) - header.x;
  // The row's ink ends flush with the header's on the right.
  const rowInk = inkOf(rowStyle, row);
  const rowShift = header.x + header.w - (rowInk.x + rowInk.w);

  // The top word comes in from the right and the bottom word from the left; the row and trademark ride on them.
  const place = (travel: number) => {
    const topX = settledTopX + travel;
    const bottomX = settledTopX + LAYOUT.bottomLineShift - travel;
    return {
      topX,
      bottomX,
      rowX: topX + rowShift,
      trademarkLeft: bottomX + bottom.width + LAYOUT.trademarkGap,
    };
  };

  const settled = place(0);
  return {
    bounds: [
      lineBox(top, settled.topX, LAYOUT.topLineY),
      textBounds(rowStyle, row, settled.rowX, rowTop),
      lineBox(bottom, settled.bottomX, LAYOUT.bottomLineY),
      rect(settled.trademarkLeft, trademarkTop, trademark.width, trademark.height),
    ].reduce(union),
    glint: {
      targets: [shineAt(top, settled.topX, LAYOUT.topLineY), shineAt(bottom, settled.bottomX, LAYOUT.bottomLineY)],
      pivotY: LAYOUT.bottomLineY + bottom.height,
    },
    draw(gfx: Gfx, travel: number): void {
      const at = place(travel);
      drawLine(gfx, top, at.topX, LAYOUT.topLineY);
      gfx.text(row, at.rowX, rowTop, rowStyle);
      drawLine(gfx, bottom, at.bottomX, LAYOUT.bottomLineY);
      gfx.image(trademark, at.trademarkLeft, trademarkTop);
    },
  };
}

/** What `text` inks in `style`, outline and shadow included, set with its first glyph cell at x = 0. */
function inkOf(style: TextStyle, text: string): Rect {
  const ink = textInk(style, text, 0, 0);
  if (!ink) throw new Error(`Classic lockup: "${text}" inks nothing`);
  return ink;
}

/** Draws a painted word with its first letter's top-left at (x, y). */
function drawLine(gfx: Gfx, line: TitleLogoLine, x: number, y: number): void {
  gfx.image(line.image, x - line.origin.x, y - line.origin.y);
}

/** The box a painted word covers with its first letter's top-left at (x, y). */
function lineBox(line: TitleLogoLine, x: number, y: number): Rect {
  return rect(x - line.origin.x, y - line.origin.y, line.image.width, line.image.height);
}

/** The box a painted word inks with its first letter's top-left at (x, y): its image box less the empty margin. */
function lineInk(line: TitleLogoLine, x: number, y: number): Rect {
  const { origin, ink } = line;
  return rect(x - origin.x + ink.x, y - origin.y + ink.y, ink.w, ink.h);
}

/** Where a word's shine image sits with its first letter's top-left at (x, y). */
function shineAt(line: TitleLogoLine, x: number, y: number): GlintTarget {
  return { shine: line.shine, left: x - line.origin.x, top: y - line.origin.y };
}
