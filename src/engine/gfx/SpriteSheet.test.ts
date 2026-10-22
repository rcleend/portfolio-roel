import { describe, expect, it } from 'vitest';
import type { PixelImage } from './canvas';
import { SpriteSheet } from './SpriteSheet';
import { parseSpriteSheetSpec } from './SpriteSheetSpec';

const spec = parseSpriteSheetSpec(
  {
    frame: { w: 64, h: 64 },
    origin: { x: 32, y: 64 },
    animations: [
      { name: 'idle', fps: 8, loop: true, frames: 2 },
      {
        name: 'attack',
        fps: 10,
        loop: false,
        frames: 4,
        anchors: {
          muzzle: [
            [50, 30],
            [52, 31],
            [54, 29],
            [40, 28],
          ],
        },
      },
    ],
  },
  'hero.json',
);

/** Only the size of the image matters until something is drawn. */
const image = (width: number, height: number) => ({ width, height }) as PixelImage;

describe('SpriteSheet.fromImage', () => {
  const sheet = SpriteSheet.fromImage(image(256, 128), spec, 'hero');

  it('plays an image sheet like a compiled one', () => {
    expect(sheet.width).toBe(64);
    expect(sheet.height).toBe(64);
    expect(sheet.origin).toEqual({ x: 32, y: 64 });
    expect(sheet.animationNames).toEqual(['idle', 'attack']);
    expect(sheet.duration('attack')).toBeCloseTo(0.4);
    expect(sheet.frameIndex('idle', 0.3)).toBe(0);
    expect(sheet.frameIndex('attack', 0.25)).toBe(2);
    expect(sheet.isFinished('attack', 0.4)).toBe(true);
  });

  it('rejects an image that does not match its JSON', () => {
    expect(() => SpriteSheet.fromImage(image(256, 64), spec, 'hero')).toThrow(
      'SpriteSheet "hero": the image is 256×64, but its JSON describes 256×128 (2 rows of 64×64 frames)',
    );
  });

  it('narrows its animation names once they are checked', () => {
    expect(sheet.hasAll(['idle', 'attack'])).toBe(true);
    expect(sheet.hasAll(['idle', 'victory'])).toBe(false);
  });
});

describe('anchors', () => {
  const sheet = SpriteSheet.fromImage(image(256, 128), spec, 'hero');

  it('follows the frame shown at a time, and is null where an animation has none', () => {
    expect(sheet.anchor('attack', 'muzzle', 0)).toEqual({ x: 50, y: 30 });
    expect(sheet.anchor('attack', 'muzzle', 0.21)).toEqual({ x: 54, y: 29 });
    expect(sheet.anchor('attack', 'muzzle', 9)).toEqual({ x: 40, y: 28 });
    expect(sheet.anchor('attack', 'hand', 0)).toBeNull();
    expect(sheet.anchor('idle', 'muzzle', 0)).toBeNull();
  });

  it('lands on the pixel the sprite paints, facing either way', () => {
    // Drawn at (100, 200): the frame spans x 68–131 and y 136–199, mirrored around x = 100.
    expect(sheet.toScreen({ x: 50, y: 30 }, 100, 200)).toEqual({ x: 118, y: 166 });
    expect(sheet.toScreen({ x: 50, y: 30 }, 100, 200, true)).toEqual({ x: 81, y: 166 });
    expect(sheet.toScreen({ x: 0, y: 0 }, 99.6, 200.4)).toEqual({ x: 68, y: 136 });
    expect(sheet.toScreen({ x: 63, y: 0 }, 100, 200, true)).toEqual({ x: 68, y: 136 });
  });
});
