import { describe, expect, it } from 'vitest';
import { bandColors, mix, parseHex, shade, toHex } from './color';
import { bayerThreshold, ditherOn } from './dither';

describe('color', () => {
  it('parses short, long and alpha hex', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 255 });
    expect(parseHex('#1f6fff')).toEqual({ r: 31, g: 111, b: 255, a: 255 });
    expect(parseHex('#00000080').a).toBe(128);
  });

  it('rejects invalid colours with a helpful message', () => {
    expect(() => parseHex('red')).toThrow(/Invalid colour "red"/);
    expect(() => parseHex('#12345')).toThrow();
  });

  it('round-trips through toHex and drops opaque alpha', () => {
    expect(toHex(parseHex('#3f3424'))).toBe('#3f3424');
    expect(toHex(parseHex('#3f342480'))).toBe('#3f342480');
  });

  it('mixes and shades', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(shade('#808080', 1)).toBe('#ffffff');
    expect(shade('#808080', -1)).toBe('#000000');
  });

  it('bands a ramp keeping exact end colours', () => {
    const bands = bandColors(['#000000', '#ffffff'], 5);
    expect(bands).toHaveLength(5);
    expect(bands[0]).toBe('#000000');
    expect(bands[4]).toBe('#ffffff');
    expect(bands[2]).toBe('#808080');
    expect(bandColors(['#123456'], 3)).toEqual(['#123456', '#123456', '#123456']);
  });
});

describe('dither', () => {
  it('produces a 50% checkerboard with bayer2', () => {
    const row0 = [0, 1, 2, 3].map((x) => ditherOn('bayer2', x, 0, 0.5));
    const row1 = [0, 1, 2, 3].map((x) => ditherOn('bayer2', x, 1, 0.5));
    expect(row0).toEqual([true, false, true, false]);
    expect(row1).toEqual([false, true, false, true]);
  });

  it('wraps negative coordinates', () => {
    expect(bayerThreshold('bayer4', -1, -1)).toBe(bayerThreshold('bayer4', 3, 3));
  });
});
