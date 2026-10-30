import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { clearHiddenColour, countColours, sameVisiblePixels, slimPng } from './pngSlim';

/**
 * A 32 × 32 RGBA PNG, stored uncompressed: `colours` flat colours in bands over its left half (an edge column at half
 * alpha), the right half transparent but full of colour noise, as the art tools leave it.
 */
async function sprite(colours: number): Promise<{ png: Uint8Array; rgba: Uint8Array }> {
  const rgba = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 4;
      const band = (y * 16 + Math.min(x, 15)) % colours;
      rgba[i] = (band * 37) % 256;
      rgba[i + 1] = (band * 53 + (band >> 8) * 11) % 256;
      rgba[i + 2] = (band * 17 + (band >> 4)) % 256;
      rgba[i + 3] = x < 16 ? (x === 15 ? 128 : 255) : 0;
      if (x >= 16) rgba.set([(x * 91) % 256, (y * 13) % 256, (x * y) % 256], i);
    }
  }
  const png = await sharp(rgba, { raw: { width: 32, height: 32, channels: 4 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
  return { png: new Uint8Array(png), rgba };
}

async function pixels(png: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await sharp(png).ensureAlpha().raw().toBuffer());
}

describe('slimPng', () => {
  it('clears only the colour no one can see', () => {
    const rgba = new Uint8Array([10, 20, 30, 0, 10, 20, 30, 1, 10, 20, 30, 255]);
    clearHiddenColour(rgba);
    expect([...rgba]).toEqual([0, 0, 0, 0, 10, 20, 30, 1, 10, 20, 30, 255]);
  });

  it('counts colours, and stops counting past the limit', () => {
    expect(countColours(new Uint8Array([1, 2, 3, 255, 1, 2, 3, 255, 0, 0, 0, 0]))).toBe(2);
    expect(
      countColours(
        new Uint8Array(4 * 600).map((_, i) => i % 251),
        4,
      ),
    ).toBe(5);
  });

  it('compares what shows: alpha everywhere, colour where a pixel is not transparent', () => {
    expect(sameVisiblePixels(new Uint8Array([1, 2, 3, 0]), new Uint8Array([9, 9, 9, 0]))).toBe(true);
    expect(sameVisiblePixels(new Uint8Array([1, 2, 3, 1]), new Uint8Array([9, 2, 3, 1]))).toBe(false);
    expect(sameVisiblePixels(new Uint8Array([1, 2, 3, 0]), new Uint8Array([1, 2, 3, 1]))).toBe(false);
  });

  it('writes pixel art as an indexed PNG with every visible pixel and every alpha intact, in fewer bytes', async () => {
    const { png, rgba } = await sprite(40);
    const slim = await slimPng(png);
    expect(slim.length).toBeLessThan(png.length);
    expect((await sharp(slim).metadata()).isPalette).toBe(true);
    expect(sameVisiblePixels(rgba, await pixels(slim))).toBe(true);
  });

  it('leaves an image of more than 256 colours as it is', async () => {
    const { png } = await sprite(300);
    expect(await slimPng(png)).toBe(png);
  });
});
