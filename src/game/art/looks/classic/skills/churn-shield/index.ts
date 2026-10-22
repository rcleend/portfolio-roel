import { ditherOn } from '@/engine/gfx/dither';
import { blink } from '@/engine/motion/oscillators';
import { defineSkillLook } from '@/game/art/looks/module';
import { skillIconSheets } from '../icons';

/** Classic CHURN SHIELD: a sparsely dithered cyan bubble with a double rim and a glint sliding around it. */
export const look = defineSkillLook('churn-shield', {
  icon: skillIconSheets['churn-shield'],
  visual: () => ({
    active: (gfx, shield, caster, layer) => {
      if (layer !== 'front' || shield.age >= shield.duration) return;
      if (shield.duration - shield.age < 0.8 && !blink(shield.age, 3 / 60, 3 / 60)) return;
      const center = shield.centerAt(caster);
      const cx = Math.round(center.x);
      const cy = Math.round(center.y);
      const { radius } = shield;
      // A sparse dither keeps the hero visible through the bubble without any alpha blending.
      for (let dy = -radius + 1; dy < radius; dy++) {
        const span = Math.floor(Math.sqrt(radius * radius - dy * dy));
        for (let dx = -span; dx <= span; dx++) {
          if (ditherOn('bayer4', cx + dx, cy + dy, 0.12)) gfx.pixel(cx + dx, cy + dy, '#bff6ff');
        }
      }
      gfx.circle(cx, cy, radius, '#6fe8ff', false);
      gfx.circle(cx, cy, radius - 1, '#1a6a8a', false);
      // A highlight glint slides around the rim.
      const angle = shield.age * 3;
      for (let i = 0; i < 4; i++) {
        const a = angle + i * 0.12;
        gfx.pixel(cx + Math.round(Math.cos(a) * (radius - 3)), cy + Math.round(Math.sin(a) * (radius - 3)), '#ffffff');
      }
    },
  }),
});
