import { profile } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import { type TextOptions, type TextStyle, textBounds } from '@/engine/gfx/TextStyle';
import { type Rect, rect, union } from '@/engine/math/Rect';
import { condensedType, LOCKUP_INK, type TitleLogoLine, titleLogo } from '../../../../art/logos';
import { lazy } from '../../../../art/logos/lazy';
import { palette } from '../../../../palette';
import type { GlintTarget } from '../../glint';
import type { LockupArt, TitleLockup } from '../TitleLockup';

/** Where the lockup settles, in screen pixels. Line positions are the top-left of each word's first letter. */
const LAYOUT = {
  topLine: { x: 26, y: 40 },
  bottomLine: { x: 14, y: 88 },
  /** The name sits on the top word's shoulder, ending a little inside its right edge. */
  nameInset: 4,
  nameGap: 3,
  /** The trademark follows the bottom word, its foot a pixel below the baseline. */
  trademarkGap: 7,
} as const;

const NAME_OPTIONS: TextOptions = { align: 'right' };

/**
 * Metal Slug's lockup (docs/ART-DIRECTION.md › Title): the headline in two
 * rough, rust-banded lines, "PRODUCT" over "ENGINEER", with the name riding
 * the top word's shoulder the way "SUPER VEHICLE-001" does and a small
 * trademark after the bottom word.
 */
export const classicLockup: TitleLockup<'classic'> = {
  id: 'classic',
  name: 'Classic',
  description: "PRODUCT over ENGINEER in rusted slab letters, the name on the top word's shoulder.",
  prepare: lazy(paintClassicLockup),
};

function paintClassicLockup(): LockupArt {
  const { top, bottom, trademark } = titleLogo();
  const name = profile.name.toUpperCase();
  const nameStyle: TextStyle = {
    font: condensedType(),
    fill: palette.cream,
    outline: LOCKUP_INK,
    shadow: { color: LOCKUP_INK, x: 1, y: 1 },
  };
  const nameTop = LAYOUT.topLine.y - nameStyle.font.cellHeight - LAYOUT.nameGap;
  const trademarkTop = LAYOUT.bottomLine.y + bottom.height - trademark.height + 1;

  // The top word comes in from the right and the bottom word from the left; the name and trademark ride on them.
  const place = (travel: number) => {
    const topX = LAYOUT.topLine.x + travel;
    const bottomX = LAYOUT.bottomLine.x - travel;
    return {
      topX,
      bottomX,
      nameRight: topX + top.capWidth - LAYOUT.nameInset,
      trademarkLeft: bottomX + bottom.width + LAYOUT.trademarkGap,
    };
  };

  const settled = place(0);
  return {
    bounds: [
      lineBox(top, settled.topX, LAYOUT.topLine.y),
      textBounds(nameStyle, name, settled.nameRight, nameTop, NAME_OPTIONS),
      lineBox(bottom, settled.bottomX, LAYOUT.bottomLine.y),
      rect(settled.trademarkLeft, trademarkTop, trademark.width, trademark.height),
    ].reduce(union),
    glint: {
      targets: [shineAt(top, settled.topX, LAYOUT.topLine.y), shineAt(bottom, settled.bottomX, LAYOUT.bottomLine.y)],
      pivotY: LAYOUT.bottomLine.y + bottom.height,
    },
    draw(gfx: Gfx, travel: number): void {
      const at = place(travel);
      drawLine(gfx, top, at.topX, LAYOUT.topLine.y);
      gfx.text(name, at.nameRight, nameTop, nameStyle, NAME_OPTIONS);
      drawLine(gfx, bottom, at.bottomX, LAYOUT.bottomLine.y);
      gfx.image(trademark, at.trademarkLeft, trademarkTop);
    },
  };
}

/** Draws a painted word with its first letter's top-left at (x, y). */
function drawLine(gfx: Gfx, line: TitleLogoLine, x: number, y: number): void {
  gfx.image(line.image, x - line.origin.x, y - line.origin.y);
}

/** The box a painted word covers with its first letter's top-left at (x, y). */
function lineBox(line: TitleLogoLine, x: number, y: number): Rect {
  return rect(x - line.origin.x, y - line.origin.y, line.image.width, line.image.height);
}

/** Where a word's shine image sits with its first letter's top-left at (x, y). */
function shineAt(line: TitleLogoLine, x: number, y: number): GlintTarget {
  return { shine: line.shine, left: x - line.origin.x, top: y - line.origin.y };
}
