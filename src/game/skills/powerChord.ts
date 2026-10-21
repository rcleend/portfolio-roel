import type { Gfx } from '@/engine/gfx/Gfx';
import { intersects } from '@/engine/math/Rect';
import { Ring } from '../entities/effects/Ring';
import type { RenderKit } from '../entities/RenderKit';
import {
  type ActiveSkill,
  NO_MODIFIERS,
  type Skill,
  type SkillCaster,
  type SkillLayer,
  type SkillWorld,
} from './Skill';

const STUN_SECONDS = 3;
const DURATION = 0.5;
const RING_DELAYS = [0, 0.07, 0.14] as const;
const WAVE_SPEED = 520;

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

class Shockwave implements ActiveSkill {
  readonly modifiers = NO_MODIFIERS;
  readonly #origin: { readonly x: number; readonly y: number };
  #age = 0;
  #rings = 0;

  constructor(caster: SkillCaster) {
    this.#origin = { x: caster.x, y: caster.y };
  }

  get done(): boolean {
    return this.#age >= DURATION;
  }

  update(world: SkillWorld, dt: number): void {
    this.#age += dt;
    while (this.#rings < RING_DELAYS.length && this.#age >= (RING_DELAYS[this.#rings] ?? 0)) {
      const color = this.#rings === 1 ? '#a99cf0' : '#ffffff';
      world.effect(new Ring(this.#origin.x, this.#origin.y, 300 - this.#rings * 40, 0.45, color));
      this.#rings++;
    }
  }

  render(gfx: Gfx, _kit: RenderKit, _caster: SkillCaster, layer: SkillLayer): void {
    if (layer !== 'front' || this.done) return;
    // Two sound-wave fronts race outwards along the ground: zig-zag columns of light.
    const distance = this.#age * WAVE_SPEED;
    for (const direction of [-1, 1] as const) {
      const x = Math.round(this.#origin.x + direction * distance);
      for (let i = 0; i < 4; i++) {
        const column = x - direction * i * 5;
        const height = 26 - i * 6;
        for (let y = 0; y < height; y += 2) {
          gfx.pixel(column + ((y / 2) % 2), this.#origin.y + 14 - y, i === 0 ? '#ffffff' : '#a99cf0');
        }
      }
    }
  }
}
