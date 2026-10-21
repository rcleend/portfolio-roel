import type { Gfx } from '@/engine/gfx/Gfx';
import { intersects } from '@/engine/math/Rect';
import { blink } from '@/engine/motion/oscillators';
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

class Drone implements ActiveSkill {
  readonly modifiers = NO_MODIFIERS;
  #age = 0;
  #nextShot = 0.35;

  get done(): boolean {
    return this.#age >= DURATION;
  }

  update(world: SkillWorld, dt: number): void {
    this.#age += dt;
    if (this.#age < this.#nextShot) return;
    const from = this.#position(world.caster);
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

  render(gfx: Gfx, kit: RenderKit, caster: SkillCaster, layer: SkillLayer): void {
    if (this.done) return;
    // The drone passes behind the player on the far half of its orbit.
    const behind = Math.sin(this.#angle()) < 0;
    if (behind !== (layer === 'behind')) return;
    if (DURATION - this.#age < 1 && !blink(this.#age, 3 / 60, 3 / 60)) return;
    const { x, y } = this.#position(caster);
    gfx.sprite(kit.fx.drone, 'hover', this.#age, x, y, { flipX: caster.facing < 0 });
  }

  #angle(): number {
    return (this.#age / ORBIT_SECONDS) * Math.PI * 2;
  }

  #position(caster: SkillCaster): { x: number; y: number } {
    const angle = this.#angle();
    return { x: caster.x + Math.cos(angle) * ORBIT.x, y: caster.y - ORBIT.lift + Math.sin(angle) * ORBIT.y };
  }
}
