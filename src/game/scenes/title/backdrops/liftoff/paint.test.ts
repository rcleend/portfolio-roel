import { describe, expect, it } from 'vitest';
import { parseHex, type Rgba } from '@/engine/gfx/color';
import { containsPoint } from '@/engine/math/Rect';
import type { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { layoutClouds } from './clouds';
import { PAD_BOX, paintLaunchPad } from './launchpad';
import { KEEP_CLEAR, STAGE } from './layout';
import { paintPuffAtlas } from './puffs';
import { paintRocket } from './rocket';
import { LIGHT_LEVELS, paintBackdrops } from './sky';
import { paintSkyline, SKYLINE_TOP } from './skyline';

const BACKDROPS = paintBackdrops(layoutClouds());
/** The classic lockup's near-black outline, the darkest thing that has to read against the sky. */
const LOGO_OUTLINE = parseHex('#1c0703');

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance({ r, g, b }: Rgba): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** A plain loop: a deep `toEqual` diff over megabytes of pixels is far too slow for this. */
function samePixels(a: Bitmap, b: Bitmap | undefined): boolean {
  return b !== undefined && a.data.length === b.data.length && a.data.every((value, i) => value === b.data[i]);
}

function totalLight(bitmap: Bitmap): number {
  let total = 0;
  for (let i = 0; i < bitmap.data.length; i += 4)
    total += (bitmap.data[i] ?? 0) + (bitmap.data[i + 1] ?? 0) + (bitmap.data[i + 2] ?? 0);
  return total;
}

/** Opaque pixels of `bitmap` placed with its top-left at (left, top), in screen pixels. */
function opaquePixels(bitmap: Bitmap, left: number, top: number): { x: number; y: number }[] {
  const pixels: { x: number; y: number }[] = [];
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) if (bitmap.isOpaque(x, y)) pixels.push({ x: x + left, y: y + top });
  }
  return pixels;
}

describe('liftoff painting', () => {
  it('paints exactly the same pixels every time', () => {
    const again = paintBackdrops(layoutClouds());
    for (const [level, bitmap] of BACKDROPS.entries()) expect(samePixels(bitmap, again[level])).toBe(true);
    expect(samePixels(paintSkyline(), paintSkyline())).toBe(true);
    expect(samePixels(paintLaunchPad(), paintLaunchPad())).toBe(true);
    expect(samePixels(paintPuffAtlas(), paintPuffAtlas())).toBe(true);
    expect(samePixels(paintRocket(true), paintRocket(true))).toBe(true);
  });

  it('floods the sky a whole step brighter per ignition level, whitest at the pad', () => {
    expect(BACKDROPS).toHaveLength(LIGHT_LEVELS);
    const light = BACKDROPS.map(totalLight);
    expect(light.every((total, level) => level === 0 || total > (light[level - 1] ?? total))).toBe(true);
    const brightest = BACKDROPS.at(-1)?.get(STAGE.pad.x, STAGE.pad.y - 6);
    expect(brightest && brightest.r + brightest.g + brightest.b).toBeGreaterThan(700);
    for (const bitmap of BACKDROPS) expect(bitmap.isOpaque(0, 0) && bitmap.isOpaque(319, 239)).toBe(true);
  });

  it('sets the logo on a mid-tone band of sky, between a night zenith and the warm horizon', () => {
    const plain = BACKDROPS[0];
    if (!plain) throw new Error('no plain backdrop');
    const rowLight = (y: number): number => {
      const values = Array.from({ length: STAGE.width }, (_, x) => luminance(plain.get(x, y) ?? LOGO_OUTLINE));
      return values.sort((a, b) => a - b)[values.length >> 1] ?? 0;
    };
    // Where the classic lockup's extrusion and outline fall, they must stand off the sky.
    for (const y of [60, 90, 120, 136])
      expect(contrast(rowLight(y), luminance(LOGO_OUTLINE)), `row ${y}`).toBeGreaterThan(1.6);
    expect(rowLight(4)).toBeLessThan(rowLight(90));
    expect(rowLight(90)).toBeLessThan(rowLight(STAGE.horizon - 2));
  });

  it('keeps the skyline and the pad out from behind the prompt and the copyright', () => {
    const solid = [
      ...opaquePixels(paintSkyline(), 0, SKYLINE_TOP),
      ...opaquePixels(paintLaunchPad(), PAD_BOX.x, PAD_BOX.y),
    ];
    expect(solid.length).toBeGreaterThan(0);
    for (const { x, y } of solid) {
      expect(containsPoint(KEEP_CLEAR.prompt, x, y), `(${x}, ${y})`).toBe(false);
      expect(containsPoint(KEEP_CLEAR.copyright, x, y), `(${x}, ${y})`).toBe(false);
    }
  });
});
