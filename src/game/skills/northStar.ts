import { BURSTS, Burst } from '../entities/effects/Burst';
import { HomingStar } from '../entities/shots/HomingStar';
import { NO_MODIFIERS, type Skill } from './Skill';

/** NORTH STAR: launches a star that homes in on the most frustrated customer on screen. */
export const northStar: Skill = {
  id: 'north-star',
  sfx: 'skill-north-star',
  cast(world) {
    const { caster } = world;
    const x = caster.x + caster.facing * 8;
    const y = caster.feet - 30;
    world.fire(new HomingStar(x, y, caster.facing));
    world.effect(new Burst(x, y, BURSTS.sparkle, world.rng));
    // The star does the work; the cast itself is instant.
    return { done: true, modifiers: NO_MODIFIERS, update: () => {}, render: () => {} };
  },
};
