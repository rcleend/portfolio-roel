import type { Rect } from '@/engine/math/Rect';
import { Rng } from '@/engine/math/Rng';
import type { Effect } from '../entities/effects/Effect';
import type { Shot } from '../entities/shots/Shot';
import type { SkillCaster, SkillTarget, SkillWorld } from './Skill';

/**
 * A recording `SkillWorld` for skill tests. Lives next to the skills (not in
 * a test file) so every skill's test can share it; production code never
 * imports it.
 */
export class FakeSkillWorld implements SkillWorld {
  time = 0;
  caster: SkillCaster = { x: 100, y: 186, feet: 200, facing: 1 };
  view: Rect = { x: 0, y: 0, w: 320, h: 240 };
  readonly rng = new Rng(1);
  readonly customers: FakeTarget[] = [];
  readonly hits: { target: SkillTarget; damage: number; direction: -1 | 1 }[] = [];
  readonly stuns: { target: SkillTarget; seconds: number }[] = [];
  readonly popped: Rect[] = [];
  readonly shots: Shot[] = [];
  readonly effects: Effect[] = [];
  shakes = 0;
  flashes = 0;

  addCustomer(x: number, feet = 200, frustration = 3, escalated = false): FakeTarget {
    const target = new FakeTarget({ x: x - 7, y: feet - 28, w: 14, h: 28 }, frustration, escalated);
    this.customers.push(target);
    return target;
  }

  targets(): readonly SkillTarget[] {
    return this.customers.filter((customer) => customer.frustration > 0);
  }

  hit(target: SkillTarget, damage: number, direction: -1 | 1): void {
    this.hits.push({ target, damage, direction });
    if (target instanceof FakeTarget) target.frustration = Math.max(0, target.frustration - damage);
  }

  stun(target: SkillTarget, seconds: number): void {
    this.stuns.push({ target, seconds });
  }

  popBubbles(area: Rect): number {
    this.popped.push(area);
    return 0;
  }

  fire(shot: Shot): void {
    this.shots.push(shot);
  }

  effect(effect: Effect): void {
    this.effects.push(effect);
  }

  shake(): void {
    this.shakes++;
  }

  flash(): void {
    this.flashes++;
  }

  /** Steps a running skill for `seconds` at 60 Hz. */
  run(skill: { update(world: SkillWorld, dt: number): void; readonly done: boolean }, seconds: number): void {
    for (let i = 0; i < Math.round(seconds * 60) && !skill.done; i++) {
      this.time += 1 / 60;
      skill.update(this, 1 / 60);
    }
  }
}

export class FakeTarget implements SkillTarget {
  readonly rect: Rect;
  frustration: number;
  readonly escalated: boolean;

  constructor(rect: Rect, frustration: number, escalated: boolean) {
    this.rect = rect;
    this.frustration = frustration;
    this.escalated = escalated;
  }
}
