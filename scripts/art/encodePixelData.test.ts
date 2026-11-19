import { describe, expect, it } from 'vitest';
import { decodePixelData, PIXEL_COLOURS, pixelDataSize, pixelSymbol } from '@/engine/gfx/PixelData';
import { encodePixelData } from './encodePixelData';

/** A picture of `colours` colours in noisy stretches and long runs, some see-through, some hidden under alpha 0. */
function picture(width: number, height: number, colours: number, seed = 1): Uint8Array {
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const palette = Array.from({ length: colours }, (_, index) => [
    Math.floor(random() * 256),
    Math.floor(random() * 256),
    Math.floor(random() * 256),
    index % 5 === 0 ? 0 : index % 7 === 0 ? 128 : 255,
  ]);
  const rgba = new Uint8Array(width * height * 4);
  let pixel = 0;
  while (pixel < width * height) {
    const colour = palette[Math.floor(random() * colours)] as number[];
    const run = random() < 0.3 ? 1 + Math.floor(random() * 300) : 1;
    for (let n = 0; n < run && pixel < width * height; n++, pixel++) rgba.set(colour, pixel * 4);
  }
  return rgba;
}

describe('pixel data', () => {
  it.each([
    [1, 1, 1],
    [7, 3, 2],
    [64, 64, 16],
    [321, 97, PIXEL_COLOURS],
  ])('gives back every byte of a %i×%i picture of %i colours', (width, height, colours) => {
    const rgba = picture(width, height, colours);
    const data = encodePixelData(rgba, width, height);
    expect(pixelDataSize(data)).toEqual({ width, height });
    const decoded = decodePixelData(data);
    expect([decoded.width, decoded.height]).toEqual([width, height]);
    expect(Buffer.from(decoded.rgba).equals(Buffer.from(rgba))).toBe(true);
  });

  it('keeps the colour hidden under a transparent pixel and a partial alpha', () => {
    const rgba = Uint8Array.from([10, 20, 30, 0, 0, 0, 0, 0, 1, 2, 3, 128, 255, 255, 255, 255]);
    const data = encodePixelData(rgba, 2, 2);
    expect(data.split(';')[0]?.split(',').slice(1).sort()).toEqual(['00000000', '01020380', '0a141e00', 'ffffff']);
    expect([...decodePixelData(data).rgba]).toEqual([...rgba]);
  });

  it('writes a string that needs no escapes, the same one every time', () => {
    const rgba = picture(200, 50, PIXEL_COLOURS, 7);
    const data = encodePixelData(rgba, 200, 50);
    expect(data).toBe(encodePixelData(rgba, 200, 50));
    expect(data).toMatch(/^[0-9a-fx,]+;[0-9:-[\]-~]+$/);
    expect(Array.from({ length: PIXEL_COLOURS }, (_, index) => pixelSymbol(index)).join('')).toBe(
      ':;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~',
    );
    expect(JSON.stringify(data)).toBe(`"${data}"`);
  });

  it('counts long runs', () => {
    const data = encodePixelData(new Uint8Array(1000 * 4), 100, 10);
    expect(data).toBe('100x10,00000000;:1000');
  });

  it('refuses more colours than it has symbols', () => {
    const colours = PIXEL_COLOURS + 1;
    const rgba = new Uint8Array(colours * 4);
    for (let index = 0; index < colours; index++) rgba.set([index, 0, 0, 255], index * 4);
    expect(() => encodePixelData(rgba, colours, 1)).toThrow(/69 colours/);
  });

  it('rejects data that does not fill its picture, or names a colour it does not have', () => {
    expect([...decodePixelData('2x2,ff0000;:4').rgba.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(() => decodePixelData('2x2,ff0000;:3')).toThrow(/bad pixels/);
    expect(() => decodePixelData('2x2,ff0000;:5')).toThrow(/bad pixels/);
    expect(() => decodePixelData('2x2,ff0000;:::::')).toThrow(/bad pixels/);
    expect(() => decodePixelData('2x2,ff0000;::;:')).toThrow(/bad pixels at 13/);
    expect(() => decodePixelData('2x2,ff0000;:: :')).toThrow(/bad pixels/);
    expect(() => decodePixelData('nonsense')).toThrow(/no size/);
  });
});
