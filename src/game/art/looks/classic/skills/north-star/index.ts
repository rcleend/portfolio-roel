import { starSheet } from '@/game/art/fx/star';
import { defineSkillLook } from '@/game/art/looks/module';
import { drawBurst } from '@/game/entities/effects/Burst';
import { skillIconSheets } from '../icons';

/** Classic NORTH STAR: a twinkling gold star with a dotted trail, sparkling at launch and bursting on impact. */
export const look = defineSkillLook('north-star', {
  icon: skillIconSheets['north-star'],
  fx: { star: starSheet },
  visual: (fx) => ({
    shot: (gfx, star) => {
      star.trail.forEach((point, index) => {
        if (index % 2 === 1) return;
        gfx.pixel(point.x, point.y, index < 2 ? '#fff4b0' : '#ffd84a');
      });
      gfx.sprite(fx.star, 'twinkle', star.age, star.x, star.y);
    },
    effect: (gfx, fx) => drawBurst(gfx, fx.burst),
  }),
});
