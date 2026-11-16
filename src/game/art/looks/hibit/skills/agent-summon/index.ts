import { defineSkillLook } from '@/game/art/looks/module';
import { drawDottedLine, drawFrame, drawSparks, frameAt, handOf, RAMPS } from '../draw';
import { art as droneArt } from './fx-drone.art';
import droneJson from './fx-drone.json';
import { art as impactArt } from './fx-drone-impact.art';
import impactJson from './fx-drone-impact.json';
import { art as shotArt } from './fx-drone-shot.art';
import shotJson from './fx-drone-shot.json';
import { art as iconArt } from './icon.art';
import iconJson from './icon.json';

const SUMMON_SECONDS = 13 / 30;
const FIRE_SECONDS = 6 / 30;
const DISSOLVE_SECONDS = 8 / 30;
/** The last second the status light turns red. */
const POWERDOWN_SECONDS = 1;
/** While the drone prints itself, a dotted line links it to the hand that called it. */
const TETHER_SECONDS = 0.4;
/** Afterimages where the packet was this many 60 Hz frames ago, newest first. */
const TRAIL_FRAMES = [2, 4, 6] as const;

/**
 * Hibit AGENT SUMMON: a pearl drone with a dark visor and two cyan eyes
 * prints itself into existence with a scanline, hovers in time with its
 * orbit (dimmer on the far side), recoils and blinks contentedly when it
 * fires, turns its light red in its last second and lifts away as cyan dust.
 */
export const look = defineSkillLook('agent-summon', {
  icon: { art: iconArt, json: iconJson },
  fx: {
    drone: { art: droneArt, json: droneJson },
    shot: { art: shotArt, json: shotJson },
    impact: { art: impactArt, json: impactJson },
  },
  visual: (fx) => ({
    active: (gfx, drone, caster, layer, kit) => {
      if (drone.age >= drone.duration) return;
      const at = drone.droneAt(caster);
      if (layer === 'front' && drone.age < TETHER_SECONDS) {
        drawDottedLine(gfx, handOf(caster), at, RAMPS.cyan[3], frameAt(drone.age, 15));
      }
      const behind = Math.sin(drone.angle) < 0;
      if (behind !== (layer === 'behind')) return;
      const facingLeft = caster.facing < 0;
      const sinceShot = drone.lastShot ? drone.age - drone.lastShot.age : Number.POSITIVE_INFINITY;
      if (drone.age < SUMMON_SECONDS) {
        drawFrame(gfx, fx.drone, 'summon', frameAt(drone.age, 30), at.x, at.y, facingLeft);
      } else if (drone.lastShot && sinceShot < FIRE_SECONDS) {
        // It turns to face what it fired at.
        const towardLeft = drone.lastShot.toward.x < at.x;
        drawFrame(gfx, fx.drone, 'fire', frameAt(sinceShot, 30), at.x, at.y, towardLeft);
      } else if (drone.duration - drone.age < POWERDOWN_SECONDS) {
        const index = kit.reducedMotion ? 0 : frameAt(drone.age, 8) % 4;
        drawFrame(gfx, fx.drone, 'powerdown', index, at.x, at.y, facingLeft);
      } else {
        drawFrame(gfx, fx.drone, behind ? 'hover-far' : 'hover', frameAt(drone.age, 15) % 24, at.x, at.y, facingLeft);
      }
    },
    shot: (gfx, shot) => {
      // The packet flies straight, so where it was a few frames ago is just behind it on its path.
      TRAIL_FRAMES.forEach((back, index) => {
        const seconds = back / 60;
        if (shot.age < seconds) return;
        drawFrame(gfx, fx.shot, 'trail', index, shot.x - shot.vx * seconds, shot.y - shot.vy * seconds);
      });
      drawFrame(gfx, fx.shot, 'fly', frameAt(shot.age, 20) % 4, shot.x, shot.y);
    },
    effect: (gfx, effect, kit) => {
      if (effect.role === 'ended') {
        // The last beat: the drone lifts away where it last hovered.
        if (effect.timer.age >= DISSOLVE_SECONDS) return;
        const at = effect.state.droneAt(effect.caster);
        drawFrame(gfx, fx.drone, 'dissolve', frameAt(effect.timer.age, 30), at.x, at.y, effect.caster.facing < 0);
      } else if (effect.role === 'impact') {
        const skip = kit.reducedMotion ? 1 : 0;
        drawFrame(gfx, fx.impact, 'impact', frameAt(effect.burst.age, 30) + skip, effect.burst.x, effect.burst.y);
      } else {
        drawSparks(gfx, effect.burst, RAMPS.cyan);
      }
    },
  }),
});
