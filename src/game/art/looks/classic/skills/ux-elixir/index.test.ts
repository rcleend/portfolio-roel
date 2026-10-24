import { describe, expect, it } from 'vitest';
import type { SkillId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { RenderKit } from '../../../../../entities/RenderKit';
import type { CasterSnapshot } from '../../../../../skills/SkillVisual';
import { look } from './index';

/** How many shapes classic UX ELIXIR draws in front of a hero 0.1 s into the skill. */
function drawnOver(posesOwn: (skill: SkillId) => boolean): number {
  let shapes = 0;
  const count = () => {
    shapes++;
  };
  const gfx = { fillRect: count, pixel: count } as Pick<Gfx, 'fillRect' | 'pixel'> as Gfx;
  const caster: CasterSnapshot = {
    x: 100,
    y: 80,
    feet: 100,
    facing: 1,
    height: 40,
    hand: null,
    muzzle: null,
    anchor: () => null,
    posesOwn,
  };
  look.visual?.({}).active?.(gfx, { age: 0.1, duration: 6 }, caster, 'front', {} as RenderKit);
  return shapes;
}

describe('classic UX ELIXIR', () => {
  it('pops its flask over the hero, unless he drinks his own potion in a pose of the skill', () => {
    expect(drawnOver(() => false)).toBeGreaterThan(0);
    expect(drawnOver((skill) => skill === 'ux-elixir')).toBe(0);
  });
});
