import type { Gfx } from '@/engine/gfx/Gfx';
import type { RenderKit } from '../RenderKit';

/** Something that plays out over time and then is done. */
export interface Lifetime {
  readonly done: boolean;
  update(dt: number): void;
}

/** A short-lived, purely visual flourish: sparks, pops, floating text. Effects never affect play. */
export interface Effect extends Lifetime {
  render(gfx: Gfx, kit: RenderKit): void;
}

/**
 * Effects a look draws (impacts, a skill's sparks and rings) stay on stage
 * at least this long, so a look's own animation can play out after classic's
 * particles are gone. Effects never affect play, so this changes nothing else.
 */
export const LOOK_EFFECT_SECONDS = 0.5;

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
