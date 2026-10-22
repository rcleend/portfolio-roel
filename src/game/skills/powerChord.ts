import type { Gfx } from '@/engine/gfx/Gfx';
import { intersects } from '@/engine/math/Rect';
import type { Vec2 } from '@/engine/math/Vec2';
import { Ring } from '../entities/effects/Ring';
import { SkillEffect } from '../entities/effects/SkillEffect';
import type { RenderKit } from '../entities/RenderKit';
import {
  type ActiveSkill,
  NO_MODIFIERS,
  type Skill,
  type SkillCaster,
  type SkillLayer,
  type SkillWorld,
} from './Skill';
import type { CasterSnapshot, PowerChordState } from './SkillVisual';

const STUN_SECONDS = 3;
const DURATION = 0.5;
const RING_DELAYS = [0, 0.07, 0.14] as const;
const RING_LIFE = 0.45;

/** POWER CHORD: one strum, a screen-wide shockwave that stuns every customer in sight for three seconds. */
export const powerChord: Skill = {
  id: 'power-chord',
  sfx: 'skill-power-chord',
  cast(world) {
    for (const target of world.targets()) {
      if (intersects(target.rect, world.view)) world.stun(target, STUN_SECONDS);
    }
    world.popBubbles(world.view);
    world.shake(4, 0.35);
    world.flash('#ffffff', 0.08);
    return new Shockwave(world.caster);
  },
};

class Shockwave implements ActiveSkill, PowerChordState {
  readonly modifiers = NO_MODIFIERS;
  readonly duration = DURATION;
  readonly origin: Vec2;
  #age = 0;
  #rings = 0;

  constructor(caster: SkillCaster) {
    this.origin = { x: caster.x, y: caster.y };
  }

  get age(): number {
    return this.#age;
  }

  get done(): boolean {
    return this.#age >= DURATION;
  }

  update(world: SkillWorld, dt: number): void {
    this.#age += dt;
    while (this.#rings < RING_DELAYS.length && this.#age >= (RING_DELAYS[this.#rings] ?? 0)) {
      // Each ring reaches a little less far than the one before it.
      const ring = new Ring(this.origin.x, this.origin.y, 300 - this.#rings * 40, RING_LIFE, this.#rings);
      world.effect(new SkillEffect('power-chord', { role: 'ring', ring }, ring));
      this.#rings++;
    }
  }

  render(gfx: Gfx, kit: RenderKit, caster: CasterSnapshot, layer: SkillLayer): void {
    kit.looks.skills['power-chord'].visual.active?.(gfx, this, caster, layer, kit);
  }
}
