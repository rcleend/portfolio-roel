import type { Lifetime } from './Effect';

/** A spreading ring as a look sees it. */
export interface RingView {
  readonly x: number;
  readonly y: number;
  /** How far it spreads over its life, px. */
  readonly radius: number;
  readonly life: number;
  readonly age: number;
  /** Which of a volley this is, counting from 0, so a look can vary them. */
  readonly index: number;
}

/** A shockwave ring spreading from a point; a skill's look decides how it is drawn. */
export class Ring implements Lifetime, RingView {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly life: number;
  readonly index: number;
  #age = 0;

  constructor(x: number, y: number, radius: number, life: number, index: number) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.life = life;
    this.index = index;
  }

  get age(): number {
    return this.#age;
  }

  get done(): boolean {
    return this.#age >= this.life;
  }

  update(dt: number): void {
    this.#age += dt;
  }
}
