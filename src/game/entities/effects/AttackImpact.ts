import type { CharacterId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { RenderKit } from '../RenderKit';
import type { AttackImpactView } from '../shots/AttackVisual';
import { drawLaunched } from '../shots/launch';
import type { Burst, ParticleView } from './Burst';
import type { Effect } from './Effect';
import { LOOK_EFFECT_SECONDS } from './Effect';

/** Where a hero's basic attack struck: the world's spark burst, drawn by the hero's look. */
export class AttackImpact implements Effect, AttackImpactView {
  readonly owner: CharacterId;
  readonly direction: -1 | 1;
  readonly #burst: Burst;

  constructor(owner: CharacterId, direction: -1 | 1, burst: Burst) {
    this.owner = owner;
    this.direction = direction;
    this.#burst = burst;
  }

  get x(): number {
    return this.#burst.x;
  }

  get y(): number {
    return this.#burst.y;
  }

  get age(): number {
    return this.#burst.age;
  }

  get particles(): readonly ParticleView[] {
    return this.#burst.particles;
  }

  get size(): number {
    return this.#burst.size;
  }

  get done(): boolean {
    return this.#burst.done && this.#burst.age >= LOOK_EFFECT_SECONDS;
  }

  update(dt: number): void {
    this.#burst.update(dt);
  }

  render(gfx: Gfx, kit: RenderKit): void {
    const hero = kit.looks.characters[this.owner];
    drawLaunched(gfx, hero.sheet, this.direction, () => hero.attack.impact(gfx, this, kit));
  }
}
