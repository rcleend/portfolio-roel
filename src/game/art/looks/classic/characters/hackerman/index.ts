import { defineHeroLook } from '@/game/art/looks/module';
import { drawBurst } from '@/game/entities/effects/Burst';
import { codeBoltSheet } from '../../projectiles';
import { hackermanSheet } from './sheet';

/** Classic HACKERMAN; his code bolt flies a "</>" with a short glowing trail. */
export const look = defineHeroLook('hackerman', {
  sheet: hackermanSheet,
  fx: { bolt: codeBoltSheet },
  attack: (fx) => ({
    shot: (gfx, shot) => {
      const trail = -shot.direction;
      for (let i = 1; i <= 3; i++) {
        gfx.pixel(shot.x + trail * (6 + i * 3), shot.y + (i % 2), i === 1 ? '#7dff9a' : '#2a8a4a');
      }
      gfx.sprite(fx.bolt, 'fly', shot.age, shot.x, shot.y, { flipX: shot.direction < 0 });
    },
    impact: drawBurst,
    hit: drawBurst,
  }),
});
