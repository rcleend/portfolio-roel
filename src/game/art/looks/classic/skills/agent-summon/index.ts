import { blink } from '@/engine/motion/oscillators';
import { defineSkillLook } from '@/game/art/looks/module';
import { drawBurst } from '@/game/entities/effects/Burst';
import { DRONE_SHOT_SPEED } from '@/game/entities/shots/DroneShot';
import { droneSheet } from '../../projectiles';
import { skillIconSheets } from '../icons';

/** Classic AGENT SUMMON: a little white drone with a spinning rotor, firing cyan pulses. */
export const look = defineSkillLook('agent-summon', {
  icon: skillIconSheets['agent-summon'],
  fx: { drone: droneSheet },
  visual: (fx) => ({
    active: (gfx, drone, caster, layer) => {
      if (drone.age >= drone.duration) return;
      // The drone passes behind the player on the far half of its orbit.
      const behind = Math.sin(drone.angle) < 0;
      if (behind !== (layer === 'behind')) return;
      if (drone.duration - drone.age < 1 && !blink(drone.age, 3 / 60, 3 / 60)) return;
      const { x, y } = drone.droneAt(caster);
      gfx.sprite(fx.drone, 'hover', drone.age, x, y, { flipX: caster.facing < 0 });
    },
    shot: (gfx, shot) => {
      const tx = -shot.vx / DRONE_SHOT_SPEED;
      const ty = -shot.vy / DRONE_SHOT_SPEED;
      gfx.pixel(shot.x + tx * 4, shot.y + ty * 4, '#1a6a8a');
      gfx.pixel(shot.x + tx * 2, shot.y + ty * 2, '#3fb8e8');
      gfx.fillRect(shot.x - 1, shot.y - 1, 3, 3, '#6fe8ff');
      gfx.pixel(shot.x, shot.y, '#ffffff');
    },
    effect: (gfx, fx) => drawBurst(gfx, fx.burst),
  }),
});
