import { describe, expect, it } from 'vitest';
import type { PixelImage } from '@/engine/gfx/canvas';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import {
  CHARACTER_ANIMATIONS,
  type HeroAnimation,
  type HeroPose,
  heroAnimation,
  heroFrame,
  heroLayerErrors,
  skillPose,
  strayHeroAnimations,
} from './contracts';

/** The layers of a sheet drawn in layers that plays `poses` too. */
const layersOf = (...poses: string[]) => [
  'run-legs',
  'jump-legs',
  'fall-legs',
  ...['attack', 'skill', ...poses].map((pose) => `${pose}-upper`),
];

/**
 * A hero sheet playing the eight hero animations and `extra`, over an image that is never drawn: one frame at
 * 10 fps each, but `frames` of any named there.
 */
function heroSheet(
  extra: readonly string[] = [],
  frames: Readonly<Record<string, number>> = {},
): SpriteSheet<HeroAnimation> {
  const names = [...CHARACTER_ANIMATIONS, ...extra];
  const spec = parseSpriteSheetSpec(
    {
      frame: { w: 64, h: 64 },
      origin: { x: 32, y: 64 },
      animations: names.map((name) => ({ name, fps: 10, loop: false, frames: frames[name] ?? 1 })),
    },
    'sheet.json',
  );
  const width = 64 * Math.max(...spec.animations.map((animation) => animation.frames));
  const sheet = SpriteSheet.fromImage({ width, height: 64 * names.length } as PixelImage, spec, 'sheet');
  if (!sheet.hasAll<HeroAnimation>(CHARACTER_ANIMATIONS)) throw new Error('unreachable: it plays all eight');
  return sheet;
}

describe('heroAnimation', () => {
  it('plays a skill its own pose where the sheet draws one, and the shared skill pose where it does not', () => {
    const sheet = heroSheet([skillPose('ux-elixir')]);
    expect(heroAnimation(sheet, 'skill', 'ux-elixir')).toBe('skill-ux-elixir');
    expect(heroAnimation(sheet, 'skill', 'power-chord')).toBe('skill');
    expect(heroAnimation(heroSheet(), 'skill', 'ux-elixir')).toBe('skill');
  });

  it('leaves every other animation, and a skill pose struck without a skill, as they are', () => {
    const sheet = heroSheet([skillPose('ux-elixir')]);
    expect(heroAnimation(sheet, 'run', 'ux-elixir')).toBe('run');
    expect(heroAnimation(sheet, 'skill', null)).toBe('skill');
  });
});

describe('strayHeroAnimations', () => {
  it('allows the eight hero animations and poses of the hero’s own skills, and nothing else', () => {
    expect(strayHeroAnimations([...CHARACTER_ANIMATIONS, 'skill-ux-elixir', 'skill-power-chord'], 'artsy')).toEqual([]);
    expect(strayHeroAnimations(['idle', 'skill-north-star', 'skill-ux-elixr', 'wave'], 'artsy')).toEqual([
      'skill-north-star',
      'skill-ux-elixr',
      'wave',
    ]);
  });

  it('allows the layers of the layered moves and of every pose of his, and of nothing else', () => {
    expect(strayHeroAnimations([...CHARACTER_ANIMATIONS, ...layersOf('skill-ux-elixir')], 'artsy')).toEqual([]);
    expect(strayHeroAnimations(['idle-legs', 'hurt-upper', 'skill-north-star-upper', 'run-upper'], 'artsy')).toEqual([
      'idle-legs',
      'hurt-upper',
      'skill-north-star-upper',
      'run-upper',
    ]);
  });
});

describe('heroLayerErrors', () => {
  it('has nothing to say of a sheet drawn whole, or of one that splits everything in step', () => {
    expect(heroLayerErrors(heroSheet([skillPose('ux-elixir')]))).toEqual([]);
    const poses = [skillPose('ux-elixir')];
    expect(heroLayerErrors(heroSheet([...poses, ...layersOf(...poses)], { run: 13, 'run-legs': 13 }))).toEqual([]);
  });

  it('names every layer a sheet drawn in layers leaves out, or plays out of step', () => {
    const poses = [skillPose('ux-elixir')];
    const extra = [...poses, ...layersOf(...poses)].filter(
      (name) => name !== 'jump-legs' && name !== 'skill-ux-elixir-upper',
    );
    expect(heroLayerErrors(heroSheet(extra, { run: 13, 'run-legs': 12 }))).toEqual([
      '"run-legs" must play as many frames, as fast, as "run"',
      '"jump-legs" is missing: a sheet drawn in layers splits "jump" too',
      '"skill-ux-elixir-upper" is missing: a sheet drawn in layers splits "skill-ux-elixir" too',
    ]);
  });
});

describe('heroFrame', () => {
  const still: HeroPose = { animation: 'idle', skill: null, time: 0.5, onTheMove: null };
  const running: HeroPose = {
    animation: 'run',
    skill: null,
    time: 0.1,
    onTheMove: { action: 'attack', actionTime: 0.1, move: 'run', moveTime: 0.7 },
  };
  const castingInTheAir: HeroPose = {
    animation: 'skill',
    skill: 'ux-elixir',
    time: 0.2,
    onTheMove: { action: 'skill', actionTime: 0.2, move: 'fall', moveTime: 0.3 },
  };

  it('draws a sheet drawn whole one animation at a time, as the pose says', () => {
    const sheet = heroSheet([skillPose('ux-elixir')]);
    expect(heroFrame(sheet, still)).toEqual({ animation: 'idle', time: 0.5, legs: null });
    expect(heroFrame(sheet, running)).toEqual({ animation: 'run', time: 0.1, legs: null });
    expect(heroFrame(sheet, castingInTheAir)).toEqual({ animation: 'skill-ux-elixir', time: 0.2, legs: null });
  });

  it("keeps the move's legs, in stride, under the attack or the skill's own pose on the move", () => {
    const poses = [skillPose('ux-elixir')];
    const sheet = heroSheet([...poses, ...layersOf(...poses)]);
    expect(heroFrame(sheet, still)).toEqual({ animation: 'idle', time: 0.5, legs: null });
    expect(heroFrame(sheet, running)).toEqual({
      animation: 'attack-upper',
      time: 0.1,
      legs: { animation: 'run-legs', time: 0.7 },
    });
    expect(heroFrame(sheet, castingInTheAir)).toEqual({
      animation: 'skill-ux-elixir-upper',
      time: 0.2,
      legs: { animation: 'fall-legs', time: 0.3 },
    });
  });
});
