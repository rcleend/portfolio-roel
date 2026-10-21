import type { Gfx } from '@/engine/gfx/Gfx';
import { easeOutCubic } from '@/engine/motion/easing';
import { segment } from '@/engine/motion/progress';
import type { Effect } from './Effect';

/** An expanding pixel circle — a shockwave or a pop outline. Thins from two pixels to one as it grows. */
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
    gfx.circle(this.#x, this.#y, radius, this.#color, false);
    if (progress < 0.6) gfx.circle(this.#x, this.#y, radius - 1, this.#color, false);
  }
}
