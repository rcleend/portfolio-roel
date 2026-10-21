import type { Gfx } from '@/engine/gfx/Gfx';
import { easeOutBack } from '@/engine/motion/easing';
import { segment } from '@/engine/motion/progress';
import { Burst } from '../entities/effects/Burst';
import { rectCenter } from './geometry';
import type { ActiveSkill, Skill, SkillCaster, SkillLayer, SkillModifiers, SkillWorld } from './Skill';

const DURATION = 6;
const FLASK_SECONDS = 0.7;
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

class Elixir implements ActiveSkill {
  readonly modifiers = MODIFIERS;
  #age = 0;
  #nextSparkle = 0;

  get done(): boolean {
    return this.#age >= DURATION;
  }

  update(world: SkillWorld, dt: number): void {
    this.#age += dt;
    if (this.#age < this.#nextSparkle) return;
    this.#nextSparkle = this.#age + SPARKLE_EVERY;
    // Understanding spreads: soft pink sparkles drift up from every customer under the spell.
    for (const target of world.targets()) {
      const center = rectCenter(target.rect);
      world.effect(new Burst(center.x, target.rect.y + 4, SPARKLE, world.rng));
    }
  }

  render(gfx: Gfx, _kit: unknown, caster: SkillCaster, layer: SkillLayer): void {
    if (layer !== 'front' || this.#age > FLASK_SECONDS) return;
    // The potion pops up above the hero's head, tips, and is gone.
    const rise = segment(this.#age, 0, 0.25, easeOutBack);
    const x = Math.round(caster.x - 3);
    const y = Math.round(caster.feet - 34 - rise * 10);
    drawFlask(gfx, x, y, this.#age > 0.45);
  }
}

function drawFlask(gfx: Gfx, x: number, y: number, empty: boolean): void {
  gfx.fillRect(x + 2, y, 3, 1, '#2a1830');
  gfx.fillRect(x + 2, y + 1, 3, 2, '#b48e74');
  gfx.fillRect(x, y + 3, 7, 7, '#2a1830');
  gfx.fillRect(x + 1, y + 4, 5, 5, empty ? '#d6d0dc' : '#ff4fa3');
  if (!empty) gfx.fillRect(x + 1, y + 4, 5, 1, '#ff9ad8');
  gfx.pixel(x + 2, y + 5, '#ffffff');
}
