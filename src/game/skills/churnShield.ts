import type { Gfx } from '@/engine/gfx/Gfx';
import type { Vec2 } from '@/engine/math/Vec2';
import type { RenderKit } from '../entities/RenderKit';
import { circleBounds, circleIntersectsRect, rectCenter } from './geometry';
import type { ActiveSkill, Skill, SkillCaster, SkillLayer, SkillModifiers, SkillTarget, SkillWorld } from './Skill';
import type { CasterSnapshot, ChurnShieldState } from './SkillVisual';

const DURATION = 5;
const RADIUS = 20;
/** A customer bumping the shield calms down by this much, at most once per `BUMP_COOLDOWN`. */
const BUMP_CALM = 1.5;
const BUMP_COOLDOWN = 0.6;
const MODIFIERS: SkillModifiers = { playerShielded: true };

/** CHURN SHIELD: a retention bubble that blocks all damage for five seconds; customers who bump into it calm down. */
export const churnShield: Skill = {
  id: 'churn-shield',
  sfx: 'skill-shield',
  cast: () => new Shield(),
};

class Shield implements ActiveSkill, ChurnShieldState {
  readonly modifiers = MODIFIERS;
  readonly duration = DURATION;
  readonly radius = RADIUS;
  readonly #bumped = new Map<SkillTarget, number>();
  #age = 0;

  get age(): number {
    return this.#age;
  }

  get done(): boolean {
    return this.#age >= DURATION;
  }

  centerAt(caster: SkillCaster): Vec2 {
    return { x: caster.x, y: caster.feet - 15 };
  }

  update(world: SkillWorld, dt: number): void {
    this.#age += dt;
    const { x, y } = this.centerAt(world.caster);
    for (const target of world.targets()) {
      if (!circleIntersectsRect(x, y, RADIUS, target.rect)) continue;
      const last = this.#bumped.get(target) ?? Number.NEGATIVE_INFINITY;
      if (this.#age - last < BUMP_COOLDOWN) continue;
      this.#bumped.set(target, this.#age);
      world.hit(target, BUMP_CALM, rectCenter(target.rect).x < x ? -1 : 1);
    }
    world.popBubbles(circleBounds(x, y, RADIUS));
  }

  render(gfx: Gfx, kit: RenderKit, caster: CasterSnapshot, layer: SkillLayer): void {
    kit.looks.skills['churn-shield'].visual.active?.(gfx, this, caster, layer, kit);
  }
}
