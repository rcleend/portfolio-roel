import type { Gfx } from '@/engine/gfx/Gfx';
import type { RenderKit } from '../RenderKit';

/** A short-lived, purely visual flourish: sparks, pops, floating text. Effects never affect play. */
export interface Effect {
  readonly done: boolean;
  update(dt: number): void;
  render(gfx: Gfx, kit: RenderKit): void;
}

/** The world's effects, updated and drawn in insertion order. */
export class EffectsLayer {
  #effects: Effect[] = [];

  get count(): number {
    return this.#effects.length;
  }

  add(effect: Effect): void {
    this.#effects.push(effect);
  }

  update(dt: number): void {
    for (const effect of this.#effects) effect.update(dt);
    this.#effects = this.#effects.filter((effect) => !effect.done);
  }

  render(gfx: Gfx, kit: RenderKit): void {
    for (const effect of this.#effects) effect.render(gfx, kit);
  }
}
