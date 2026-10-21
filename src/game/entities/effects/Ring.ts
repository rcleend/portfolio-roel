import type { Gfx } from '@/engine/gfx/Gfx';
import { easeOutCubic } from '@/engine/motion/easing';
import { segment } from '@/engine/motion/progress';
import type { Effect } from './Effect';

/** An expanding pixel circle with a white leading edge — a shockwave. Thins as it grows. */
export class Ring implements Effect {
  readonly #x: number;
  readonly #y: number;
  readonly #radius: number;
  readonly #life: number;
  readonly #color: string;
  #age = 0;

  constructor(x: number, y: number, radius: number, life: number, color: string) {
    this.#x = x;
    this.#y = y;
    this.#radius = radius;
    this.#life = life;
    this.#color = color;
  }

  get done(): boolean {
    return this.#age >= this.#life;
  }

  update(dt: number): void {
    this.#age += dt;
  }

  render(gfx: Gfx): void {
    if (this.done) return;
    const progress = segment(this.#age, 0, this.#life, easeOutCubic);
    const radius = Math.max(1, Math.round(this.#radius * progress));
    // Three pixels thick while fresh, thinning to one as the wave spends itself.
    const thickness = progress < 0.4 ? 3 : progress < 0.75 ? 2 : 1;
    for (let i = 0; i < thickness; i++)
      gfx.circle(this.#x, this.#y, radius - i, i === 0 ? '#ffffff' : this.#color, false);
  }
}
