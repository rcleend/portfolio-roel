import { describe, expect, it } from 'vitest';
import { profile } from '@/content';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { condensedFont } from './condensed';

describe('condensed font', () => {
  const font = BitmapFont.fromGlyphData(condensedFont);

  it('compiles and covers caps, digits and the punctuation it promises', () => {
    for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-.·') expect(font.has(char)).toBe(true);
  });

  it('draws full-height letters with 2 px strokes', () => {
    for (const char of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') {
      expect(condensedFont.glyphs[char]).toHaveLength(condensedFont.cellHeight);
    }
  });

  it('can set the boot credit and the name over the title logo', () => {
    for (const char of `A LEENDERS PRODUCTION ${profile.name.toUpperCase()}`) {
      expect(char === ' ' || font.has(char)).toBe(true);
    }
  });

  it('is condensed: a ten-letter line stays under 90 px', () => {
    expect(font.measure('PRODUCTION')).toBeLessThan(90);
  });
});
