import type { Gfx } from '@/engine/gfx/Gfx';
import { intersects, type Rect } from '@/engine/math/Rect';
import { blink } from '@/engine/motion/oscillators';
import { BURSTS, Burst } from '../entities/effects/Burst';
import type { RenderKit } from '../entities/RenderKit';
import { rectCenter } from './geometry';
import {
  type ActiveSkill,
  NO_MODIFIERS,
  type Skill,
  type SkillCaster,
  type SkillLayer,
  type SkillTarget,
  type SkillWorld,
} from './Skill';

const DURATION = 0.6;
const GROW_SECONDS = 0.08;
const SHRINK_SECONDS = 0.15;
const DAMAGE = 3;

/** Front-end, back-end, database: the three layers of the beam, top to bottom. */
const LAYERS = [
  { core: '#6fe8ff', rim: '#1a6a8a' },
  { core: '#c4b8f5', rim: '#3d2f8f' },
  { core: '#ffd84a', rim: '#9e5a10' },
] as const;
const LAYER_HEIGHT = 4;
const LAYER_GAP = 1;
const BEAM_HEIGHT = LAYERS.length * LAYER_HEIGHT + (LAYERS.length - 1) * LAYER_GAP;

/** FULL-STACK ATTACK: a three-layer beam to the edge of the screen that hits every customer in its path once. */
export const fullStackAttack: Skill = {
  id: 'full-stack-attack',
  sfx: 'skill-full-stack',
  cast(world) {
    world.shake(2, 0.25);
    return new FullStackBeam(world.caster.facing);
  },
};

class FullStackBeam implements ActiveSkill {
  readonly modifiers = NO_MODIFIERS;
  readonly #facing: -1 | 1;
  readonly #struck = new Set<SkillTarget>();
  #age = 0;
  #area: Rect | null = null;

  constructor(facing: -1 | 1) {
    this.#facing = facing;
  }

  get done(): boolean {
    return this.#age >= DURATION;
  }

  update(world: SkillWorld, dt: number): void {
    this.#age += dt;
    const area = beamArea(world.caster, this.#facing, world.view);
    this.#area = area;
    for (const target of world.targets()) {
      if (this.#struck.has(target) || !intersects(target.rect, area)) continue;
      this.#struck.add(target);
      world.hit(target, DAMAGE, this.#facing);
      const center = rectCenter(target.rect);
      world.effect(new Burst(center.x, center.y, BURSTS.hitSpark, world.rng));
    }
    world.popBubbles(area);
  }

  render(gfx: Gfx, _kit: RenderKit, _caster: SkillCaster, layer: SkillLayer): void {
    const area = this.#area;
    if (layer !== 'front' || !area || this.done) return;
    const grow = Math.min(1, this.#age / GROW_SECONDS);
    const fading = DURATION - this.#age < SHRINK_SECONDS;
    const length = Math.round(area.w * grow);
    const startX = this.#facing > 0 ? area.x : area.x + area.w;
    const left = this.#facing > 0 ? startX : startX - length;
    LAYERS.forEach((colors, index) => {
      // While fading, the outer layers go first so the beam collapses onto the database core.
      if (fading && index !== 1 && blink(this.#age, 2 / 60, 2 / 60)) return;
      const y = area.y + index * (LAYER_HEIGHT + LAYER_GAP);
      gfx.fillRect(left, y, length, LAYER_HEIGHT, colors.rim);
      gfx.fillRect(left, y + 1, length, LAYER_HEIGHT - 2, colors.core);
      // Pulses racing along each layer read as data in flight.
      const travel = Math.floor(this.#age * 600 + index * 11) % 22;
      for (let offset = travel; offset < length; offset += 22) {
        const x = this.#facing > 0 ? left + offset : left + length - offset - 6;
        gfx.fillRect(x, y + 1, 8, LAYER_HEIGHT - 2, '#ffffff');
      }
    });
    // Muzzle flare at the hand.
    const flare = blink(this.#age, 2 / 60, 2 / 60) ? 6 : 5;
    gfx.circle(startX, area.y + BEAM_HEIGHT / 2, flare, '#ffffff');
    gfx.circle(startX, area.y + BEAM_HEIGHT / 2, flare - 2, '#6fe8ff');
  }
}

/** From the caster's hand to the edge of the view, at chest height. */
function beamArea(caster: SkillCaster, facing: -1 | 1, view: Rect): Rect {
  const handX = caster.x + facing * 10;
  const y = caster.feet - 17 - Math.floor(BEAM_HEIGHT / 2);
  const reach = facing > 0 ? view.x + view.w - handX : handX - view.x;
  const w = Math.max(0, reach);
  return { x: facing > 0 ? handX : handX - w, y, w, h: BEAM_HEIGHT };
}
