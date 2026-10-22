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

/** A clock as a look sees it: seconds since it started, and how long it runs. */
export interface TimerView {
  readonly age: number;
  readonly seconds: number;
}

/** A lifetime that is nothing but a clock, for effects that are not a burst or a ring (a stun, a skill's end). */
export class Countdown implements Lifetime, TimerView {
  readonly seconds: number;
  #age = 0;

  constructor(seconds: number) {
    this.seconds = seconds;
  }

  get age(): number {
    return this.#age;
  }

  get done(): boolean {
    return this.#age >= this.seconds;
  }

  update(dt: number): void {
    this.#age += dt;
  }
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
