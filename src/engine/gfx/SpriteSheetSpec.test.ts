import { describe, expect, it } from 'vitest';
import { parseSpriteSheetSpec, SpriteSheetSpecError, specImageSize } from './SpriteSheetSpec';

const hero = {
  frame: { w: 64, h: 64 },
  origin: { x: 32, y: 64 },
  animations: [
    { name: 'idle', fps: 8, loop: true, frames: 6 },
    { name: 'run', fps: 12, loop: true, frames: 8 },
    {
      name: 'attack',
      fps: 15,
      loop: false,
      frames: 3,
      anchors: {
        muzzle: [
          [50, 30],
          [52, 30],
          [54, 29],
        ],
      },
    },
  ],
};

/** `hero` with one field replaced, addressed by a path such as `animations.2.anchors`. */
function withField(path: string, value: unknown): unknown {
  const copy = structuredClone(hero) as Record<string, unknown>;
  const keys = path.split('.');
  const last = keys.pop() as string;
  let target: Record<string, unknown> = copy;
  for (const key of keys) target = target[key] as Record<string, unknown>;
  if (value === undefined) delete target[last];
  else target[last] = value;
  return copy;
}

const parse = (raw: unknown) => parseSpriteSheetSpec(raw, 'looks/arcade/characters/hackerman/sheet.json');

describe('parseSpriteSheetSpec', () => {
  it('reads frames, the origin, every animation and its anchors', () => {
    const spec = parse(hero);
    expect(spec.frame).toEqual({ w: 64, h: 64 });
    expect(spec.origin).toEqual({ x: 32, y: 64 });
    expect(spec.animations.map((animation) => animation.name)).toEqual(['idle', 'run', 'attack']);
    expect(spec.animations[0]).toEqual({ name: 'idle', fps: 8, loop: true, frames: 6, anchors: {} });
    expect(spec.animations[2]?.anchors.muzzle).toEqual([
      { x: 50, y: 30 },
      { x: 52, y: 30 },
      { x: 54, y: 29 },
    ]);
  });

  it('sizes the PNG as one row per animation, as wide as the longest', () => {
    expect(specImageSize(parse(hero))).toEqual({ w: 512, h: 192 });
  });

  it.each([
    ['frame', undefined, /: frame must be an object/],
    ['frame.w', 0, /: frame\.w must be a positive integer, got 0/],
    ['origin.y', 65, /: origin\.y must be an integer from 0 to 64, got 65/],
    ['animations', [], /: animations must list at least one animation/],
    ['animations.1.name', 'idle', /: animations\[1\]\.name "idle" is used twice/],
    ['animations.1.fps', 0, /: animations\[1\]\.fps must be a number above 0, got 0/],
    ['animations.1.loop', 'yes', /: animations\[1\]\.loop must be true or false, got "yes"/],
    ['animations.1.frames', 2.5, /: animations\[1\]\.frames must be a positive integer, got 2\.5/],
    [
      'animations.2.anchors.muzzle',
      [[50, 30]],
      /: animations\[2\]\.anchors\.muzzle must list one \[x, y\] per frame \(3\)/,
    ],
    [
      'animations.2.anchors.muzzle.1',
      [64, 30],
      /: animations\[2\]\.anchors\.muzzle\[1\] must be \[x, y\] inside the 64×64 frame, got \[64,30\]/,
    ],
    ['animations.0.anchor', {}, /: animations\[0\] has an unknown key "anchor"/],
  ])('locates a bad %s', (path, value, message) => {
    expect(() => parse(withField(path, value))).toThrow(message);
  });

  it('names the file in every error and throws a SpriteSheetSpecError', () => {
    expect(() => parse(null)).toThrow(
      'Invalid sprite sheet looks/arcade/characters/hackerman/sheet.json: the root must be an object',
    );
    expect(() => parse(null)).toThrow(SpriteSheetSpecError);
  });
});
