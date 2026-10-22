import type { Gfx } from '@/engine/gfx/Gfx';
import { intersects } from '@/engine/math/Rect';
import type { Vec2 } from '@/engine/math/Vec2';
import type { RenderKit } from '../entities/RenderKit';
import { DroneShot } from '../entities/shots/DroneShot';
import { rectCenter } from './geometry';
import {
  type ActiveSkill,
  NO_MODIFIERS,
  type Skill,
  type SkillCaster,
  type SkillLayer,
  type SkillWorld,
} from './Skill';
import type { AgentSummonState, CasterSnapshot } from './SkillVisual';

const DURATION = 8;
const ORBIT_SECONDS = 1.6;
const ORBIT = { x: 22, y: 6, lift: 22 } as const;
const FIRE_EVERY = 0.55;
const RANGE = 280;

/** AGENT SUMMON: an AI drone orbits the player for eight seconds, firing at the nearest customer on screen. */
export const agentSummon: Skill = {
  id: 'agent-summon',
  sfx: 'skill-agent',
  cast: () => new Drone(),
};

class Drone implements ActiveSkill, AgentSummonState {
  readonly modifiers = NO_MODIFIERS;
  readonly duration = DURATION;
  #age = 0;
  #nextShot = 0.35;

  get age(): number {
    return this.#age;
  }

  get done(): boolean {
    return this.#age >= DURATION;
  }

  get angle(): number {
    return (this.#age / ORBIT_SECONDS) * Math.PI * 2;
  }

  droneAt(caster: SkillCaster): Vec2 {
    const { angle } = this;
    return { x: caster.x + Math.cos(angle) * ORBIT.x, y: caster.y - ORBIT.lift + Math.sin(angle) * ORBIT.y };
  }

  update(world: SkillWorld, dt: number): void {
    this.#age += dt;
    if (this.#age < this.#nextShot) return;
    const from = this.droneAt(world.caster);
    let nearest: { x: number; y: number } | null = null;
    let best = RANGE;
    for (const target of world.targets()) {
      if (!intersects(target.rect, world.view)) continue;
      const center = rectCenter(target.rect);
      const distance = Math.hypot(center.x - from.x, center.y - from.y);
      if (distance < best) {
        best = distance;
        nearest = center;
      }
    }
    if (!nearest) return;
    world.fire(new DroneShot(from.x, from.y, nearest.x, nearest.y));
    this.#nextShot = this.#age + FIRE_EVERY;
  }

  render(gfx: Gfx, kit: RenderKit, caster: CasterSnapshot, layer: SkillLayer): void {
    kit.looks.skills['agent-summon'].visual.active?.(gfx, this, caster, layer, kit);
  }
}
