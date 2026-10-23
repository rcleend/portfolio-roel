import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { profile } from '@/content';
import type { Bitmap } from '../raster/Bitmap';
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

  it('bounds each line by what it paints, inside the margin its image leaves for wobble and extrusion', () => {
    const { top, bottom } = buildTitleLogo('Product Engineer');
    for (const line of [top, bottom]) {
      expect(line.ink).toEqual(line.image.bounds());
      expect(line.ink.x).toBeGreaterThan(0);
      expect(line.ink.x + line.ink.w).toBeLessThan(line.image.width);
    }
  });

  it('draws an outlined trademark', () => {
    const tm = paintTrademark('#ffffff', '#000000');
    expect(tm.get(0, 0)).toEqual({ r: 0, g: 0, b: 0, a: 255 });
    expect(tm.get(1, 1)).toEqual({ r: 255, g: 255, b: 255, a: 255 });
  });
});

describe('classic title logo', () => {
  const digest = (bitmap: Bitmap): string => createHash('sha256').update(bitmap.data).digest('hex');

  it('paints exactly the pixels it always has: every lettering option defaults to the classic look', () => {
    const { top, bottom } = buildTitleLogo('Product Engineer');
    expect({
      top: digest(top.image),
      topShine: digest(top.shine),
      bottom: digest(bottom.image),
      bottomShine: digest(bottom.shine),
      trademark: digest(paintTrademark('#efe3b5', '#2a1a0a')),
    }).toEqual({
      top: '97a7ae058d715c9751ddd6bf451113bc7b759e27423c541ee24614efbae00dfd',
      topShine: '1cdac02ea74508ce418167bdd6afbda9e36c0ef473f9e621353807aa3070a51a',
      bottom: 'd8634a96a5dc91076472aa1b27c0c4b01588116c0d0ed229806c43adb51ce6fa',
      bottomShine: '270e4244a18b6d30037adca355a0d437136931d4a20100726e33e47d8c201468',
      trademark: '4c3e2ae85721ba926ee4278409357e20473b78e5e3048de617f72489ae78abac',
    });
  });
});
