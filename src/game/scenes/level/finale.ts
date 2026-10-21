import type { Gfx } from '@/engine/gfx/Gfx';
import { BURSTS, Burst } from '../../entities/effects/Burst';
import type { LevelTextStyles } from '../../ui/hud/styles';
import type { World } from '../../world/World';
import { drawSlamBanner } from './overlays/banners';

/** The finale's beats, in seconds after the player reaches the goal. */
export const FINALE = {
  /** Berlin's banner waits for the flag to reach the top. */
  flagSeconds: 1.4,
  /** Hold on the celebration before the iris closes. */
  hold: 3.4,
} as const;

/**
 * The goal moment after the escalated customer is retained: Luna is
 * ACQUIRED! in a burst of confetti; in Berlin the PRODUCT-MARKET FIT flag
 * runs up its pole first. Pure choreography over the world and the clock.
 */
export class Finale {
  readonly #world: World;
  readonly #kind: 'acquired' | 'product-market-fit';
  #arrivedAt: number | null = null;
  #celebratedAt: number | null = null;

  constructor(world: World) {
    this.#world = world;
    this.#kind = world.stage.theme.finale;
  }

  get arrived(): boolean {
    return this.#arrivedAt !== null;
  }

  /** Seconds since the player reached the goal, or null before that. */
  sinceArrival(time: number): number | null {
    return this.#arrivedAt === null ? null : time - this.#arrivedAt;
  }

  /** The player reached the goal: strike the pose and start the moment. */
  arrive(time: number): void {
    if (this.#arrivedAt !== null) return;
    this.#arrivedAt = time;
    const world = this.#world;
    world.player.strike('victory', world.time, 60);
    world.player.facing = 1;
    if (this.#kind === 'product-market-fit') world.goalFlag?.raise(world.time);
    else this.#celebrate(time);
  }

  /** Advances the moment; returns true once it is time to leave the level. */
  update(time: number): boolean {
    const since = this.sinceArrival(time);
    if (since === null) return false;
    if (this.#celebratedAt === null && since >= FINALE.flagSeconds) this.#celebrate(time);
    return since >= FINALE.hold + (this.#kind === 'product-market-fit' ? FINALE.flagSeconds : 0);
  }

  render(gfx: Gfx, styles: LevelTextStyles, time: number): void {
    if (this.#celebratedAt === null) return;
    const lines = this.#kind === 'acquired' ? ['ACQUIRED!'] : ['PRODUCT-MARKET', 'FIT!'];
    drawSlamBanner(gfx, lines, styles.banner, time - this.#celebratedAt, this.#kind === 'acquired' ? 74 : 62);
  }

  #celebrate(time: number): void {
    this.#celebratedAt = time;
    const world = this.#world;
    const view = world.view;
    for (const fraction of [0.2, 0.5, 0.8]) {
      world.effect(new Burst(view.x + view.w * fraction, view.y + 40, BURSTS.confetti, world.rng));
    }
    world.flash('#ffffff', 0.08);
    world.shake(3, 0.3);
  }
}
