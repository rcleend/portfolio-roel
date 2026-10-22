import { describe, expect, it } from 'vitest';
import { BitmapFont, parseGlyphSheet } from '@/engine/gfx/BitmapFont';
import type { Bitmap } from '../raster/Bitmap';
import { type KickerStyle, paintKicker } from './kicker';

const font = BitmapFont.fromGlyphData({
  name: 'test',
  cellHeight: 5,
  ascent: 5,
  lineHeight: 6,
  letterSpacing: 2,
  spaceWidth: 2,
  glyphs: parseGlyphSheet(`
    = H
    ###.###
    ###.###
    #######
    ###.###
    ###.###

    = I
    ###
    ###
    ###
    ###
    ###

    = ?
    ###
    ..#
    .##
    ...
    .#.
  `),
});

const STYLE: KickerStyle = {
  face: ['#eeeeee'],
  outline: '#111111',
  shadow: { color: '#222222', x: 1, y: 1 },
};

/** The colour of an image pixel as `#rrggbb`, or `null` where nothing is painted. */
function colorAt(image: Bitmap, x: number, y: number): string | null {
  const color = image.get(x, y);
  if (!color || color.a === 0) return null;
  return `#${[color.r, color.g, color.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Columns of `image` holding face colour in the given row. */
function faceColumns(image: Bitmap, y: number, face: string): number[] {
  return Array.from({ length: image.width }, (_, x) => x).filter((x) => colorAt(image, x, y) === face);
}

describe('paintKicker', () => {
  it('paints the face inside a dark outline with a drop shadow, cropped to what it paints', () => {
    const { image, origin } = paintKicker(font, 'I', STYLE);
    expect(origin).toEqual({ x: 1, y: 1 });
    expect(colorAt(image, origin.x, origin.y)).toBe('#eeeeee');
    expect(colorAt(image, 0, 0)).toBe('#111111');
    expect(colorAt(image, image.width - 1, image.height - 1)).toBe('#222222');
    expect(colorAt(image, image.width - 1, 0)).toBeNull();
    expect([image.width, image.height]).toEqual([3 + 3, 5 + 3]);
  });

  it('spreads the letters to exactly the span asked for, no gap more than a pixel wider than another', () => {
    const natural = paintKicker(font, 'IIII', STYLE);
    const spread = paintKicker(font, 'IIII', STYLE, natural.width + 5);
    expect(spread.width).toBe(natural.width + 5);
    const columns = faceColumns(spread.image, spread.origin.y, '#eeeeee');
    const gaps = columns
      .slice(1)
      .map((x, i) => x - (columns[i] as number) - 1)
      .filter((gap) => gap > 0);
    expect(gaps).toHaveLength(3);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
    expect(gaps.reduce((sum, gap) => sum + gap, 0)).toBe(3 * 2 + 5);
  });

  it('refuses a span it cannot meet: narrower than the text, or wider than a single letter', () => {
    expect(() => paintKicker(font, 'HH', STYLE, font.measure('HH') - 1)).toThrow(/wider than its/);
    expect(() => paintKicker(font, 'H', STYLE, font.measure('H') + 1)).toThrow(/no gaps/);
    expect(paintKicker(font, 'H', STYLE, font.measure('H')).width).toBe(font.measure('H'));
  });

  it('shades the side of each upright stroke that faces into its letter, never a bar', () => {
    const { image, origin } = paintKicker(font, 'HI', { ...STYLE, shade: '#777777' });
    const at = (x: number, y: number) => colorAt(image, origin.x + x, origin.y + y);
    expect([0, 1, 2, 4, 5, 6].map((x) => at(x, 0))).toEqual([
      '#eeeeee',
      '#eeeeee',
      '#777777',
      '#777777',
      '#eeeeee',
      '#eeeeee',
    ]);
    expect(Array.from({ length: 7 }, (_, x) => at(x, 2)).every((color) => color === '#eeeeee')).toBe(true);
    // A lone stem, like the I, is shaded on its right.
    expect([9, 10, 11].map((x) => at(x, 0))).toEqual(['#eeeeee', '#eeeeee', '#777777']);
  });

  it('stacks the face bands top to bottom and lights the top edge of every stroke', () => {
    const { image, origin } = paintKicker(font, 'H', {
      ...STYLE,
      face: ['#aaaaaa', '#bbbbbb', '#cccccc', '#dddddd', '#eeeeee'],
      highlight: '#ffffff',
    });
    const column = (x: number) => Array.from({ length: 5 }, (_, y) => colorAt(image, origin.x + x, origin.y + y));
    expect(column(0)).toEqual(['#ffffff', '#bbbbbb', '#cccccc', '#dddddd', '#eeeeee']);
    // The crossbar's top is lit where nothing of the letter sits above it; the slit around it is all outline.
    expect(column(3)).toEqual(['#111111', '#111111', '#ffffff', '#111111', '#111111']);
  });
});
