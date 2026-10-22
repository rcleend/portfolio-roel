import type { Gfx } from '@/engine/gfx/Gfx';
import { intersects, type Rect } from '@/engine/math/Rect';
import { BURSTS, Burst } from '../entities/effects/Burst';
import { SkillEffect } from '../entities/effects/SkillEffect';
import { HAND } from '../entities/player/size';
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
import type { CasterSnapshot, FullStackState } from './SkillVisual';

const DURATION = 0.6;
const DAMAGE = 3;
/** Tall enough for classic's three 4 px layers (front-end, back-end, database) with 1 px between them. */
const BEAM_HEIGHT = 14;

/** FULL-STACK ATTACK: a three-layer beam to the edge of the screen that hits every customer in its path once. */
export const fullStackAttack: Skill = {
  id: 'full-stack-attack',
  sfx: 'skill-full-stack',
  cast(world) {
    world.shake(2, 0.25);
    return new FullStackBeam(world.caster.facing);
  },
};

class FullStackBeam implements ActiveSkill, FullStackState {
  readonly modifiers = NO_MODIFIERS;
  readonly duration = DURATION;
  readonly facing: -1 | 1;
  readonly #struck = new Set<SkillTarget>();
  #age = 0;
  #area: Rect | null = null;

  constructor(facing: -1 | 1) {
    this.facing = facing;
  }

  get age(): number {
    return this.#age;
  }

  get area(): Rect | null {
    return this.#area;
  }

  get done(): boolean {
    return this.#age >= DURATION;
  }

  update(world: SkillWorld, dt: number): void {
    this.#age += dt;
    const area = beamArea(world.caster, this.facing, world.view);
    this.#area = area;
    for (const target of world.targets()) {
      if (this.#struck.has(target) || !intersects(target.rect, area)) continue;
      this.#struck.add(target);
      world.hit(target, DAMAGE, this.facing);
      const center = rectCenter(target.rect);
      const burst = new Burst(center.x, center.y, BURSTS.hitSpark, world.rng);
      world.effect(new SkillEffect('full-stack-attack', { role: 'struck', burst }, burst));
    }
    world.popBubbles(area);
  }

  render(gfx: Gfx, kit: RenderKit, caster: CasterSnapshot, layer: SkillLayer): void {
    kit.looks.skills['full-stack-attack'].visual.active?.(gfx, this, caster, layer, kit);
  }
}

/** From the caster's hand to the edge of the view, at chest height. */
function beamArea(caster: SkillCaster, facing: -1 | 1, view: Rect): Rect {
  const handX = caster.x + facing * HAND.reach;
  const y = caster.feet - HAND.height - Math.floor(BEAM_HEIGHT / 2);
  const reach = facing > 0 ? view.x + view.w - handX : handX - view.x;
  const w = Math.max(0, reach);
  return { x: facing > 0 ? handX : handX - w, y, w, h: BEAM_HEIGHT };
}
