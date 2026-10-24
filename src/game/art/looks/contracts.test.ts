import { describe, expect, it } from 'vitest';
import type { PixelImage } from '@/engine/gfx/canvas';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { parseSpriteSheetSpec } from '@/engine/gfx/SpriteSheetSpec';
import { CHARACTER_ANIMATIONS, type HeroAnimation, heroAnimation, skillPose, strayHeroAnimations } from './contracts';

/** A hero sheet playing the eight hero animations and `poses`, over an image that is never drawn. */
function heroSheet(...poses: string[]): SpriteSheet<HeroAnimation> {
  const names = [...CHARACTER_ANIMATIONS, ...poses];
  const spec = parseSpriteSheetSpec(
    {
      frame: { w: 64, h: 64 },
      origin: { x: 32, y: 64 },
      animations: names.map((name) => ({ name, fps: 10, loop: false, frames: 1 })),
    },
    'sheet.json',
  );
  const sheet = SpriteSheet.fromImage({ width: 64, height: 64 * names.length } as PixelImage, spec, 'sheet');
  if (!sheet.hasAll<HeroAnimation>(CHARACTER_ANIMATIONS)) throw new Error('unreachable: it plays all eight');
  return sheet;
}

describe('heroAnimation', () => {
  it('plays a skill its own pose where the sheet draws one, and the shared skill pose where it does not', () => {
    const sheet = heroSheet(skillPose('ux-elixir'));
    expect(heroAnimation(sheet, 'skill', 'ux-elixir')).toBe('skill-ux-elixir');
    expect(heroAnimation(sheet, 'skill', 'power-chord')).toBe('skill');
    expect(heroAnimation(heroSheet(), 'skill', 'ux-elixir')).toBe('skill');
  });

  it('leaves every other animation, and a skill pose struck without a skill, as they are', () => {
    const sheet = heroSheet(skillPose('ux-elixir'));
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
});
