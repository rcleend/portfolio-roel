import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { customerLabels } from '@/content';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { RasterCanvas } from '@/engine/gfx/testing';
import { palette } from '../../palette';
import { smallFont } from '../fonts/small';
import { customerLabelArt, type LabelPicture } from './customerLabel';

beforeAll(() => vi.stubGlobal('document', { createElement: () => new RasterCanvas() }));
afterAll(() => vi.unstubAllGlobals());

const PICTURES: readonly LabelPicture[] = ['unhappy', 'happy', 'flash'];
const FONT = BitmapFont.fromGlyphData(smallFont);
const art = customerLabelArt(FONT);

/** A picture's pixels as '#rrggbb', or '' where it is transparent. */
function pixels(picture: LabelPicture): string[][] {
  const { image, width, height } = art.bitmaps()[picture];
  const { data } = (image as unknown as RasterCanvas).getContext();
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0) return '';
      return `#${[...data.subarray(i, i + 3)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
    }),
  );
}

describe('customer label pictures', () => {
  it('letter both labels in the game’s small face, which has every glyph they need, lower case included', () => {
    for (const text of Object.values(customerLabels)) for (const char of text) expect(FONT.has(char), char).toBe(true);
  });

  it('are one line of the face with its outline, the flash the size of the happy label it pops into', () => {
    for (const picture of PICTURES) expect(art.sizes[picture].height).toBe(FONT.cellHeight + 2);
    expect(art.sizes.flash).toEqual(art.sizes.happy);
    // The words and a pixel of outline either side.
    expect(art.sizes.unhappy.width).toBe(FONT.measure(customerLabels.unhappy) + 2);
    expect(art.sizes.happy.width).toBe(FONT.measure(customerLabels.happy) + 2);
  });

  it('are cropped to what they paint, with opaque pixels only', () => {
    for (const picture of PICTURES) {
      const { image, width, height } = art.bitmaps()[picture];
      expect([image.width, image.height]).toEqual([width, height]);
      const rows = pixels(picture);
      const painted = (cells: readonly string[]) => cells.some((cell) => cell !== '');
      expect([painted(rows[0] ?? []), painted(rows[height - 1] ?? [])], picture).toEqual([true, true]);
      expect([painted(rows.map((row) => row[0] ?? '')), painted(rows.map((row) => row[width - 1] ?? ''))]).toEqual([
        true,
        true,
      ]);
      const { data } = (image as unknown as RasterCanvas).getContext();
      for (let i = 3; i < data.length; i += 4) expect([0, 255]).toContain(data[i]);
    }
  });

  it('letter the angry scarlet, the friendly green and a white flash, outlined in ink', () => {
    const colors = (picture: LabelPicture) =>
      new Set(
        pixels(picture)
          .flat()
          .filter((color) => color !== ''),
      );
    expect(colors('unhappy')).toEqual(new Set([palette.ink, palette.scarlet]));
    expect(colors('happy')).toEqual(new Set([palette.ink, palette.green]));
    expect(colors('flash')).toEqual(new Set([palette.ink, palette.white]));
  });

  it('outline every letter all round, so no letter pixel meets the stage behind it', () => {
    for (const picture of PICTURES) {
      const rows = pixels(picture);
      const exposed: string[] = [];
      for (const [y, row] of rows.entries()) {
        for (const [x, color] of row.entries()) {
          if (color === '' || color === palette.ink) continue;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) if ((rows[y + dy]?.[x + dx] ?? '') === '') exposed.push(`${x},${y}`);
          }
        }
      }
      expect(exposed, picture).toEqual([]);
    }
  });

  it('are built once per font and painted once', () => {
    expect(customerLabelArt(FONT)).toBe(art);
    expect(art.bitmaps()).toBe(art.bitmaps());
  });
});
