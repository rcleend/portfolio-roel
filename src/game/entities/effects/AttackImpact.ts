import type { CharacterId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { RenderKit } from '../RenderKit';
import type { AttackShot } from '../shots/AttackShot';
import type { AttackImpactView } from '../shots/AttackVisual';
import { drawLaunched } from '../shots/launch';
import type { Burst, ParticleView } from './Burst';
import type { Effect } from './Effect';
import { LOOK_EFFECT_SECONDS } from './Effect';

/** A burst the world rolled for a hero's basic attack — where a shot ended, or its hit on a customer — drawn by the hero's look. */
export class AttackImpact implements Effect, AttackImpactView {
  readonly owner: CharacterId;
  readonly direction: -1 | 1;
  readonly index: number;
  readonly #burst: Burst;
  readonly #part: 'impact' | 'hit';

  /** `shot` is the one the burst belongs to; `part` says which part of its look draws it. */
  constructor(shot: Pick<AttackShot, 'owner' | 'direction' | 'index'>, burst: Burst, part: 'impact' | 'hit') {
    this.owner = shot.owner;
    this.direction = shot.direction;
    this.index = shot.index;
    this.#burst = burst;
    this.#part = part;
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
    drawLaunched(gfx, hero.sheet, this.direction, () => hero.attack[this.#part](gfx, this, kit));
  }
}
