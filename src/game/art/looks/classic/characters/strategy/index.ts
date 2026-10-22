import { defineHeroLook } from '@/game/art/looks/module';
import { drawBurst } from '@/game/entities/effects/Burst';
import { stickyNoteSheet } from '../../projectiles';
import { strategySheet } from './sheet';

/** Classic STRATEGY; his sticky notes spin and flutter as they fly. */
export const look = defineHeroLook('strategy', {
  sheet: strategySheet,
  fx: { note: stickyNoteSheet },
  attack: (fx) => ({
    shot: (gfx, shot) => {
      const flutter = Math.round(Math.sin(shot.age * 22) * 2);
      gfx.sprite(fx.note, 'spin', shot.age, shot.x, shot.y + flutter, { flipX: shot.direction < 0 });
    },
    impact: drawBurst,
  }),
});
