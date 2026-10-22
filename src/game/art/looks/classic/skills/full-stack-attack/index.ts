import { blink } from '@/engine/motion/oscillators';
import { defineSkillLook } from '@/game/art/looks/module';
import { drawBurst } from '@/game/entities/effects/Burst';
import { skillIconSheets } from '../icons';

const GROW_SECONDS = 0.08;
const SHRINK_SECONDS = 0.15;
/** Front-end, back-end, database: the three layers of the beam, top to bottom. */
const LAYERS = [
  { core: '#6fe8ff', rim: '#1a6a8a' },
  { core: '#c4b8f5', rim: '#3d2f8f' },
  { core: '#ffd84a', rim: '#9e5a10' },
] as const;
const LAYER_HEIGHT = 4;
const LAYER_GAP = 1;

/** Classic FULL-STACK ATTACK: three striped layers racing with data, a flare at the hand, white sparks where it pierces. */
export const look = defineSkillLook('full-stack-attack', {
  icon: skillIconSheets['full-stack-attack'],
  visual: () => ({
    active: (gfx, beam, _caster, layer) => {
      const { area, age } = beam;
      if (layer !== 'front' || !area || age >= beam.duration) return;
      const grow = Math.min(1, age / GROW_SECONDS);
      const fading = beam.duration - age < SHRINK_SECONDS;
      const length = Math.round(area.w * grow);
      const startX = beam.facing > 0 ? area.x : area.x + area.w;
      const left = beam.facing > 0 ? startX : startX - length;
      LAYERS.forEach((colors, index) => {
        // While fading, the outer layers go first so the beam collapses onto the database core.
        if (fading && index !== 1 && blink(age, 2 / 60, 2 / 60)) return;
        const y = area.y + index * (LAYER_HEIGHT + LAYER_GAP);
        gfx.fillRect(left, y, length, LAYER_HEIGHT, colors.rim);
        gfx.fillRect(left, y + 1, length, LAYER_HEIGHT - 2, colors.core);
        // Pulses racing along each layer read as data in flight.
        const travel = Math.floor(age * 600 + index * 11) % 22;
        for (let offset = travel; offset < length; offset += 22) {
          const x = beam.facing > 0 ? left + offset : left + length - offset - 6;
          gfx.fillRect(x, y + 1, 8, LAYER_HEIGHT - 2, '#ffffff');
        }
      });
      // Muzzle flare at the hand.
      const flare = blink(age, 2 / 60, 2 / 60) ? 6 : 5;
      gfx.circle(startX, area.y + area.h / 2, flare, '#ffffff');
      gfx.circle(startX, area.y + area.h / 2, flare - 2, '#6fe8ff');
    },
    effect: (gfx, fx) => {
      if (fx.role === 'hit' || fx.role === 'struck') drawBurst(gfx, fx.burst);
    },
  }),
});
