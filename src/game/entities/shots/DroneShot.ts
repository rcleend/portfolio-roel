import type { Gfx } from '@/engine/gfx/Gfx';
import type { Burst } from '../effects/Burst';
import type { Effect } from '../effects/Effect';
import { SkillEffect } from '../effects/SkillEffect';
import type { RenderKit } from '../RenderKit';
import { Shot } from './Shot';

export const DRONE_SHOT_SPEED = 250;

/** AGENT SUMMON's drone fires these small pulses at the nearest customer. */
export class DroneShot extends Shot {
  constructor(x: number, y: number, towardX: number, towardY: number) {
    const dx = towardX - x;
    const dy = towardY - y;
    const length = Math.hypot(dx, dy) || 1;
    super(
      { w: 5, h: 5, damage: 1, life: 0.8, pierces: false, impact: 'spark' },
      x,
      y,
      (dx / length) * DRONE_SHOT_SPEED,
      (dy / length) * DRONE_SHOT_SPEED,
    );
  }

  render(gfx: Gfx, kit: RenderKit): void {
    kit.looks.skills['agent-summon'].visual.shot?.(gfx, this, kit);
  }

  impactEffect(burst: Burst): Effect {
    return new SkillEffect('agent-summon', { role: 'impact', burst }, burst);
  }
}
