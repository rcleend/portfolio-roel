import { ditherOn } from '@/engine/gfx/dither';
import type { Gfx } from '@/engine/gfx/Gfx';
import { blink } from '@/engine/motion/oscillators';
import { circleBounds, circleIntersectsRect, rectCenter } from './geometry';
import type { ActiveSkill, Skill, SkillCaster, SkillLayer, SkillModifiers, SkillTarget, SkillWorld } from './Skill';

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

class Shield implements ActiveSkill {
  readonly modifiers = MODIFIERS;
  readonly #bumped = new Map<SkillTarget, number>();
  #age = 0;

  get done(): boolean {
    return this.#age >= DURATION;
  }

  update(world: SkillWorld, dt: number): void {
    this.#age += dt;
    const { x, y } = center(world.caster);
    for (const target of world.targets()) {
      if (!circleIntersectsRect(x, y, RADIUS, target.rect)) continue;
      const last = this.#bumped.get(target) ?? Number.NEGATIVE_INFINITY;
      if (this.#age - last < BUMP_COOLDOWN) continue;
      this.#bumped.set(target, this.#age);
      world.hit(target, BUMP_CALM, rectCenter(target.rect).x < x ? -1 : 1);
    }
    world.popBubbles(circleBounds(x, y, RADIUS));
  }

  render(gfx: Gfx, _kit: unknown, caster: SkillCaster, layer: SkillLayer): void {
    if (layer !== 'front' || this.done) return;
    if (DURATION - this.#age < 0.8 && !blink(this.#age, 3 / 60, 3 / 60)) return;
    const { x, y } = center(caster);
    const cx = Math.round(x);
    const cy = Math.round(y);
    // A sparse dither keeps the hero visible through the bubble without any alpha blending.
    for (let dy = -RADIUS + 1; dy < RADIUS; dy++) {
      const span = Math.floor(Math.sqrt(RADIUS * RADIUS - dy * dy));
      for (let dx = -span; dx <= span; dx++) {
        if (ditherOn('bayer4', cx + dx, cy + dy, 0.12)) gfx.pixel(cx + dx, cy + dy, '#bff6ff');
      }
    }
    gfx.circle(cx, cy, RADIUS, '#6fe8ff', false);
    gfx.circle(cx, cy, RADIUS - 1, '#1a6a8a', false);
    // A highlight glint slides around the rim.
    const angle = this.#age * 3;
    for (let i = 0; i < 4; i++) {
      const a = angle + i * 0.12;
      gfx.pixel(cx + Math.round(Math.cos(a) * (RADIUS - 3)), cy + Math.round(Math.sin(a) * (RADIUS - 3)), '#ffffff');
    }
  }
}

function center(caster: SkillCaster): { x: number; y: number } {
  return { x: caster.x, y: caster.feet - 15 };
}
