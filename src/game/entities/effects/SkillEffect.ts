import type { SkillId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { SkillVisualTypes } from '../../skills/SkillVisual';
import type { RenderKit } from '../RenderKit';
import { type Effect, type Lifetime, LOOK_EFFECT_SECONDS } from './Effect';

/**
 * Something a skill leaves in the world — a spark, a ring, an impact — drawn
 * by that skill's look. `fx` is what the look sees; `body` is what plays it
 * out (usually the same burst or ring), so the effect lasts as long as the
 * behaviour says, and at least `LOOK_EFFECT_SECONDS` for the look.
 */
export class SkillEffect<K extends SkillId> implements Effect {
  readonly skillId: K;
  readonly fx: SkillVisualTypes[K]['fx'];
  readonly #body: Lifetime;
  #age = 0;

  constructor(skillId: K, fx: SkillVisualTypes[K]['fx'], body: Lifetime) {
    this.skillId = skillId;
    this.fx = fx;
    this.#body = body;
  }

  get done(): boolean {
    return this.#body.done && this.#age >= LOOK_EFFECT_SECONDS;
  }

  update(dt: number): void {
    this.#age += dt;
    this.#body.update(dt);
  }

  render(gfx: Gfx, kit: RenderKit): void {
    kit.looks.skills[this.skillId].visual.effect?.(gfx, this.fx, kit);
  }
}
