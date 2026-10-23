import type { Gfx } from '@/engine/gfx/Gfx';
import { Burst } from '../entities/effects/Burst';
import { Countdown } from '../entities/effects/Effect';
import { SkillEffect } from '../entities/effects/SkillEffect';
import type { RenderKit } from '../entities/RenderKit';
import { rectCenter } from './geometry';
import type { ActiveSkill, Skill, SkillLayer, SkillModifiers, SkillWorld } from './Skill';
import type { CasterSnapshot, UxElixirState } from './SkillVisual';

const DURATION = 6;
const SPARKLE_EVERY = 0.18;
const MODIFIERS: SkillModifiers = { customerSpeed: 0.35, customersCalm: true, decisiveHits: true };
const SPARKLE = {
  count: 2,
  colors: ['#ff9ad8', '#ffd0ef', '#ffffff'],
  speed: [8, 20],
  angle: [-Math.PI * 0.9, -Math.PI * 0.1],
  gravity: -20,
  life: [0.3, 0.5],
  size: 1,
} as const;

/** UX ELIXIR: for six seconds customers calm down, slow down and are won over in one hit. */
export const uxElixir: Skill = {
  id: 'ux-elixir',
  sfx: 'skill-elixir',
  cast: () => new Elixir(),
};

class Elixir implements ActiveSkill, UxElixirState {
  readonly modifiers = MODIFIERS;
  readonly duration = DURATION;
  #age = 0;
  #nextSparkle = 0;

  get age(): number {
    return this.#age;
  }

  get done(): boolean {
    return this.#age >= DURATION;
  }

  update(world: SkillWorld, dt: number): void {
    this.#age += dt;
    if (this.done) {
      const timer = new Countdown(0);
      world.effect(new SkillEffect('ux-elixir', { role: 'ended', state: this, caster: world.caster, timer }, timer));
    }
    if (this.#age < this.#nextSparkle) return;
    this.#nextSparkle = this.#age + SPARKLE_EVERY;
    // Understanding spreads: sparkles drift up from every customer under the spell.
    for (const target of world.targets()) {
      const center = rectCenter(target.rect);
      const burst = new Burst(center.x, target.rect.y + 4, SPARKLE, world.rng);
      world.effect(new SkillEffect('ux-elixir', { role: 'sparkle', burst }, burst));
    }
  }

  render(gfx: Gfx, kit: RenderKit, caster: CasterSnapshot, layer: SkillLayer): void {
    kit.looks.skills['ux-elixir'].visual.active?.(gfx, this, caster, layer, kit);
  }
}

/** The elixir running among `skills`, if any: its look draws over every customer while it calms them. */
export function runningElixir(skills: readonly ActiveSkill[]): UxElixirState | null {
  return skills.find((skill): skill is Elixir => skill instanceof Elixir) ?? null;
}
