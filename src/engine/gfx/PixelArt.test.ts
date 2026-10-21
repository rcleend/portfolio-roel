import { describe, expect, it } from 'vitest';
import { PixelArtError, type PixelArtSheet, validatePixelArt } from './PixelArt';

const valid: PixelArtSheet<'idle'> = {
  palette: { k: '#000000', w: '#ffffffcc' },
  size: { w: 3, h: 2 },
  animations: { idle: { fps: 4, loop: true, frames: [['k.k', '.w.']] } },
};

function withFrames(frames: readonly (readonly string[])[]): PixelArtSheet {
  return { ...valid, animations: { idle: { fps: 4, loop: true, frames } } };
}

describe('validatePixelArt', () => {
  it('accepts a well-formed sheet', () => {
    expect(() => validatePixelArt(valid, 'ok')).not.toThrow();
  });

  it('pinpoints a row with the wrong width', () => {
    expect(() => validatePixelArt(withFrames([['k.k', '.w']]), 'hero')).toThrow(
      'PixelArt "hero": animation "idle" frame 0 row 1 has 2 characters, expected 3: ".w"',
    );
  });

  it('reports a frame with the wrong number of rows', () => {
    expect(() => validatePixelArt(withFrames([['k.k', '.w.'], ['k.k']]), 'hero')).toThrow(
      /frame 1 has 1 rows, expected 2/,
    );
  });

  it('reports characters missing from the palette', () => {
    expect(() => validatePixelArt(withFrames([['k.x', '.w.']]), 'hero')).toThrow(
      /row 0 column 2 uses "x", which is not in the palette/,
    );
  });

  it('rejects the reserved transparent key and bad colours', () => {
    expect(() => validatePixelArt({ ...valid, palette: { '.': '#000000' } }, 'p')).toThrow(/reserved/);
    expect(() => validatePixelArt({ ...valid, palette: { k: 'black', w: '#fff' } }, 'p')).toThrow(
      /invalid colour "black"/,
    );
    expect(() => validatePixelArt({ ...valid, palette: { kk: '#000000' } }, 'p')).toThrow(/exactly one character/);
  });

  it('rejects empty animations and non-positive fps', () => {
    expect(() => validatePixelArt(withFrames([]), 'p')).toThrow(/has no frames/);
    expect(() =>
      validatePixelArt({ ...valid, animations: { idle: { fps: 0, loop: true, frames: [['k.k', '.w.']] } } }, 'p'),
    ).toThrow(/fps > 0/);
  });

  it('throws a PixelArtError', () => {
    expect(() => validatePixelArt(withFrames([]), 'p')).toThrow(PixelArtError);
  });
});
