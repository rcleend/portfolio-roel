import { describe, expect, it } from 'vitest';
import { profile } from '@/content';
import { EXTRUSION_DEPTH, SLANT, setLettering } from './lettering';
import { logoLetters } from './letters';
import { buildTitleLogo, logoWords } from './logo';
import { paintLettering } from './paint';
import { paintTrademark } from './trademark';

describe('logoWords', () => {
  it('splits the headline into two upper-case lines', () => {
    expect(logoWords('Product Engineer')).toEqual(['PRODUCT', 'ENGINEER']);
    expect(() => logoWords('Engineer')).toThrow(/two-word headline/);
  });

  it('has a letter for everything in the current headline', () => {
    for (const char of logoWords(profile.headline).join('')) expect(logoLetters[char]).toBeDefined();
  });
});

describe('lettering', () => {
  const lettering = setLettering('PRO', { height: 44, seed: 7 });

  it('leaves room for the extrusion and the outline around the face', () => {
    const ink = lettering.face.bounds();
    expect(ink).not.toBeNull();
    expect(ink?.x).toBeGreaterThanOrEqual(EXTRUSION_DEPTH + 1);
    expect((ink?.y ?? 0) + (ink?.h ?? 0)).toBeLessThanOrEqual(lettering.face.height - EXTRUSION_DEPTH - 1);
    expect(lettering.letters).toHaveLength(3);
  });

  it('slants: letters reach further right at the top than at the bottom', () => {
    const rows = lettering.face.toRows();
    const top = rows[lettering.origin.y + 3] ?? '';
    const bottom = rows[lettering.origin.y + lettering.height - 3] ?? '';
    expect(top.lastIndexOf('#')).toBeGreaterThan(bottom.lastIndexOf('#') + lettering.height * SLANT * 0.5);
  });

  it('is deterministic for a seed and varies with it', () => {
    expect(setLettering('PRO', { height: 44, seed: 7 }).face.toRows()).toEqual(lettering.face.toRows());
    expect(setLettering('PRO', { height: 44, seed: 8 }).face.toRows()).not.toEqual(lettering.face.toRows());
  });

  it('rejects letters the logo has no drawing for', () => {
    expect(() => setLettering('PRQ', { height: 44, seed: 1 })).toThrow(/no letter for "Q"/);
  });
});

describe('painted logo', () => {
  it('paints face, extrusion and outline: warm on top, dark below and to the left', () => {
    const lettering = setLettering('O', { height: 44, seed: 3 });
    const bitmap = paintLettering(lettering, 3);
    const box = lettering.face.bounds();
    if (!box) throw new Error('no ink');
    // Down-left of the bottom-left of the face lies extrusion: darker than the face.
    const face = bitmap.get(box.x + 12, lettering.origin.y + 12);
    const below = bitmap.get(box.x + 4, box.y + box.h + 2);
    expect(face?.r).toBeGreaterThan(200);
    expect(below && below.r + below.g + below.b).toBeLessThan(250);
  });

  it('sets the two-word headline in two lines of roughly 280 px', () => {
    const { top, bottom } = buildTitleLogo('Product Engineer');
    expect(top.word).toBe('PRODUCT');
    expect(bottom.word).toBe('ENGINEER');
    for (const line of [top, bottom]) {
      expect(line.width).toBeGreaterThan(220);
      expect(line.image.width).toBeLessThanOrEqual(320);
      expect(line.shine.width).toBe(line.image.width);
    }
    expect(top.height).toBeGreaterThan(bottom.height);
  });

  it('draws an outlined trademark', () => {
    const tm = paintTrademark('#ffffff', '#000000');
    expect(tm.get(0, 0)).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    expect(tm.get(1, 1)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
  });
});
