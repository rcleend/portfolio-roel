import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { placeStill, stillFor, TV_STILLS } from './tvStills';

const root = resolve(import.meta.dirname, '../../..');

describe('stillFor', () => {
  it('picks the framing the room picks', () => {
    expect(stillFor({ width: 1440, height: 900 }).framing).toBe('set');
    expect(stillFor({ width: 1280, height: 600 }).framing).toBe('set');
    expect(stillFor({ width: 844, height: 390 }).framing).toBe('landscape');
    expect(stillFor({ width: 390, height: 844 }).framing).toBe('portrait');
  });
});

describe('placeStill', () => {
  it('reproduces each still at its own viewport', () => {
    for (const still of Object.values(TV_STILLS)) {
      const placed = placeStill({ width: still.width, height: still.height }, still.padInset > 0);
      expect(placed.image).toEqual({ left: 0, top: 0, width: still.width, height: still.height });
    }
  });

  it('fits the set to the height, centred, and covers a wide screen', () => {
    const { image, picture } = placeStill({ width: 1440, height: 900 }, false);
    expect(image.height).toBeCloseTo(900, 6);
    expect(image.left + image.width / 2).toBeCloseTo(720, 6);
    expect(image.left).toBeLessThanOrEqual(0);
    expect(picture.height / 900).toBeCloseTo((423.74 - 88.46) / 608, 6);
  });

  it('spans a portrait picture across the width, in the middle of what the touch pad leaves', () => {
    const { image, picture } = placeStill({ width: 430, height: 932 }, true);
    expect(image.width).toBeCloseTo(430, 6);
    expect(picture.left).toBeCloseTo(0.43, 2);
    expect(picture.top + picture.height / 2).toBeCloseTo((932 - 202) / 2, 6);
    expect(image.top).toBeLessThanOrEqual(0);
    expect(image.top + image.height).toBeGreaterThanOrEqual(932);
    // Without the pad, the middle of the whole height.
    const bare = placeStill({ width: 430, height: 932 }, false).picture;
    expect(bare.top + bare.height / 2).toBeCloseTo(466, 6);
  });
});

describe('the stills on disk', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8');

  it('are each in public/ and preloaded by index.html', () => {
    for (const still of Object.values(TV_STILLS)) {
      expect(existsSync(resolve(root, 'public', still.url))).toBe(true);
      expect(html).toContain(`<link rel="preload" as="image" type="image/webp" href="/${still.url}"`);
    }
  });
});
