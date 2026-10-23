import { describe, expect, it } from 'vitest';
import { profile } from '@/content';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { parseHex } from '@/engine/gfx/color';
import { buildRaisedTopLine, buildTitleLogo } from '../../../art/logos/product-engineer/logo';
import type { Bitmap } from '../../../art/logos/raster/Bitmap';
import { TITLE_LAYOUT } from '../layout';
import { FAITHFUL } from './faithful';
import { HEADLINER } from './headliner';
import { HEAVY_METAL } from './heavy-metal';
import { type SeatedName, type ShelfLockupRecipe, seatName } from './shelfLockup';

const SHELF_LOCKUPS: readonly (readonly [string, ShelfLockupRecipe])[] = [
  ['faithful', FAITHFUL],
  ['headliner', HEADLINER],
  ['heavy-metal', HEAVY_METAL],
];
const NAME = profile.name.toUpperCase();
const LETTERS_AND_DIGITS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** Every character a name may need: names come from content, not from this lockup. */
const CHARSET = `${LETTERS_AND_DIGITS}-.`;
/** Room the settled lockup leaves at the screen's sides and top, and above the prompt. */
const MARGIN = { side: 6, top: 12, abovePrompt: 12 } as const;

/** Every [x, y] where `image` paints, offset by (dx, dy). */
function painted(image: Bitmap, dx = 0, dy = 0): [number, number][] {
  const pixels: [number, number][] = [];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) if (image.isOpaque(x, y)) pixels.push([x + dx, y + dy]);
  }
  return pixels;
}

const same = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): boolean =>
  a.r === b.r && a.g === b.g && a.b === b.b;

/** The name's letter pixels, outline and shadow left out, in the top line's image pixels. */
function letterPixels(seat: SeatedName, recipe: ShelfLockupRecipe): [number, number][] {
  const outline = parseHex(recipe.style.outline);
  const shadow = parseHex(recipe.style.shadow.color);
  return painted(seat.kicker.image)
    .filter(([x, y]) => {
      const color = seat.kicker.image.get(x, y);
      return color !== null && !same(color, outline) && !same(color, shadow);
    })
    .map(([x, y]) => [x + seat.x, y + seat.y]);
}

describe('seatName', () => {
  it('needs a raised initial to seat the name beside', () => {
    const { top } = buildTitleLogo(profile.headline);
    const font = BitmapFont.fromGlyphData(FAITHFUL.type);
    expect(() => seatName(top, font, FAITHFUL.style, NAME)).toThrow(/no raised initial/);
  });
});

describe.each(SHELF_LOCKUPS)('shelf lockup "%s"', (_, recipe) => {
  const line = buildRaisedTopLine(profile.headline, recipe.initial);
  const font = BitmapFont.fromGlyphData(recipe.type);
  const seat = seatName(line, font, recipe.style, NAME);
  const letters = letterPixels(seat, recipe);
  const nameRows = { top: seat.y, bottom: seat.y + seat.kicker.image.height - 1 };
  const nameColumns = { left: seat.x, right: seat.x + seat.kicker.image.width - 1 };

  it('has a glyph at full cap height for every letter and digit, and for everything in the name', () => {
    for (const char of `${CHARSET}${NAME.replaceAll(' ', '')}`) expect(font.has(char), char).toBe(true);
    for (const char of LETTERS_AND_DIGITS) expect(recipe.type.glyphs[char], char).toHaveLength(recipe.type.cellHeight);
  });

  it("ends the name within a pixel of the T's top-right corner on the cap line", () => {
    const capRows = painted(line.shine).filter(([, y]) => Math.abs(y - line.origin.y) <= 2);
    const corner = Math.max(...capRows.map(([x]) => x));
    const nameEnd = Math.max(...letters.map(([x]) => x));
    expect(Math.abs(nameEnd - corner)).toBeLessThanOrEqual(1);
  });

  it('raises the P at least as high as the name, as the M of METAL SLUG is level with its kicker', () => {
    const initialTop = Math.min(...painted(line.shine).map(([, y]) => y));
    const nameTop = Math.min(...letters.map(([, y]) => y));
    expect(initialTop).toBeLessThan(nameTop);
    expect(initialTop).toBeLessThanOrEqual(nameRows.top);
  });

  it('starts the name just clear of the P, and nearly touches the letters below with its shadow', () => {
    const linePixels = painted(line.image);
    const beside = linePixels.filter(([, y]) => y >= nameRows.top && y <= nameRows.bottom);
    const gapAfterInitial = nameColumns.left - Math.max(...beside.map(([x]) => x)) - 1;
    expect(gapAfterInitial).toBeGreaterThanOrEqual(1);
    expect(gapAfterInitial).toBeLessThanOrEqual(3);

    const below = linePixels.filter(([x]) => x >= nameColumns.left && x <= nameColumns.right);
    const gapAboveLine = Math.min(...below.map(([, y]) => y)) - nameRows.bottom - 1;
    expect(gapAboveLine).toBe(1);
  });

  it('settles on screen with room to spare, above the prompt', () => {
    // The trademark tucks inside the bottom line's reach, so the two lines and the name span the lockup.
    const { bottom } = buildTitleLogo(profile.headline);
    const { topLine, bottomLine } = recipe;
    const lineLeft = topLine.x - line.origin.x;
    const lineTop = topLine.y - line.origin.y;
    const pixels = [
      ...painted(line.image, lineLeft, lineTop),
      ...painted(seat.kicker.image, lineLeft + seat.x, lineTop + seat.y),
      ...painted(bottom.image, bottomLine.x - bottom.origin.x, bottomLine.y - bottom.origin.y),
    ];
    const { width } = TITLE_LAYOUT.screen;
    expect(Math.min(...pixels.map(([x]) => x))).toBeGreaterThanOrEqual(MARGIN.side);
    expect(Math.max(...pixels.map(([x]) => x))).toBeLessThan(width - MARGIN.side);
    expect(Math.min(...pixels.map(([, y]) => y))).toBeGreaterThanOrEqual(MARGIN.top);
    expect(Math.max(...pixels.map(([, y]) => y))).toBeLessThan(TITLE_LAYOUT.promptY - MARGIN.abovePrompt);
  });
});
