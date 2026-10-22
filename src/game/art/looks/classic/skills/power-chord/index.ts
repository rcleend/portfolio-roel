import { easeOutCubic } from '@/engine/motion/easing';
import { segment } from '@/engine/motion/progress';
import { defineSkillLook } from '@/game/art/looks/module';
import { skillIconSheets } from '../icons';

/** How fast the drawn sound-wave fronts race outwards, px/s (the stun itself is instant). */
const WAVE_SPEED = 520;

/** Classic POWER CHORD: zig-zag sound fronts race along the ground while white and lavender rings spread. */
export const look = defineSkillLook('power-chord', {
  icon: skillIconSheets['power-chord'],
  visual: () => ({
    active: (gfx, wave, _caster, layer) => {
      if (layer !== 'front' || wave.age >= wave.duration) return;
      // Two sound-wave fronts race outwards along the ground: zig-zag columns of light.
      const distance = wave.age * WAVE_SPEED;
      for (const direction of [-1, 1] as const) {
        const x = Math.round(wave.origin.x + direction * distance);
        for (let i = 0; i < 4; i++) {
          const column = x - direction * i * 5;
          const height = 26 - i * 6;
          for (let y = 0; y < height; y += 2) {
            gfx.pixel(column + ((y / 2) % 2), wave.origin.y + 14 - y, i === 0 ? '#ffffff' : '#a99cf0');
          }
        }
      }
    },
    // Classic's stunned customers wear their stars in the customer sheet's `stunned` animation.
    effect: (gfx, fx) => {
      if (fx.role !== 'ring') return;
      const { ring } = fx;
      if (ring.age >= ring.life) return;
      const progress = segment(ring.age, 0, ring.life, easeOutCubic);
      const radius = Math.max(1, Math.round(ring.radius * progress));
      // A white leading edge, three pixels thick while fresh, thinning to one as the wave spends itself.
      const thickness = progress < 0.4 ? 3 : progress < 0.75 ? 2 : 1;
      const color = ring.index === 1 ? '#a99cf0' : '#ffffff';
      for (let i = 0; i < thickness; i++) gfx.circle(ring.x, ring.y, radius - i, i === 0 ? '#ffffff' : color, false);
    },
  }),
});
