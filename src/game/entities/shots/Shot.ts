import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import type { TileGrid } from '../../world/grid';
import type { Burst } from '../effects/Burst';
import type { Effect } from '../effects/Effect';
import type { RenderKit } from '../RenderKit';

/** Something a shot can home in on. */
export interface ShotTarget {
  readonly rect: Rect;
  readonly frustration: number;
}

export interface ShotEnvironment {
  readonly grid: TileGrid;
  /** Customers that can still be won over, for homing shots. */
  readonly targets: readonly ShotTarget[];
}

/** Which burst a shot leaves where it strikes; the world rolls it and the shot's owner look draws it. */
export type ShotImpact = 'spark' | 'paint' | 'note' | 'star';

/** A shot in flight as a look sees it: its centre, velocity, age and heading. */
export interface ShotView {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly age: number;
  readonly direction: -1 | 1;
}

export interface ShotSpec {
  readonly w: number;
  readonly h: number;
  readonly damage: number;
  /** Seconds before the shot fizzles out. */
  readonly life: number;
  /** Keeps flying through customers and bubbles instead of stopping at the first. */
  readonly pierces: boolean;
  readonly impact: ShotImpact;
}

/**
 * A projectile fired by the player or one of their skills. Positioned by its
 * centre. Shots stop in solid tiles and remember the cell, so a shot can
 * collect a "?" block just like a head-butt. A shot is drawn, and its impact
 * too, by the look of whoever fired it.
 */
export abstract class Shot implements ShotView {
  readonly spec: ShotSpec;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The solid grid cell this shot flew into, if any. */
  struckCell: { readonly col: number; readonly row: number } | null = null;
  #age = 0;
  #spent = false;

  constructor(spec: ShotSpec, x: number, y: number, vx: number, vy: number) {
    this.spec = spec;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
  }

  get alive(): boolean {
    return !this.#spent && this.#age < this.spec.life;
  }

  /** Seconds in flight. */
  get age(): number {
    return this.#age;
  }

  get damage(): number {
    return this.spec.damage;
  }

  /** The way the shot pushes whatever it hits. */
  get direction(): -1 | 1 {
    return this.vx < 0 ? -1 : 1;
  }

  get rect(): Rect {
    const { w, h } = this.spec;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }

  update(dt: number, env: ShotEnvironment): void {
    if (!this.alive) return;
    this.#age += dt;
    this.steer(dt, env);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const { grid } = env;
    const col = grid.colAt(this.x);
    const row = grid.rowAt(this.y);
    if (grid.kindAt(col, row) === 'solid') {
      this.struckCell = { col, row };
      this.#spent = true;
    }
  }

  /** The shot hit a customer or a bubble; a non-piercing shot ends here. */
  strike(): void {
    if (!this.spec.pierces) this.#spent = true;
  }

  /** Adjusts velocity before moving: gravity, homing. Straight shots do nothing. */
  protected steer(_dt: number, _env: ShotEnvironment): void {}

  abstract render(gfx: Gfx, kit: RenderKit): void;

  /** Hands the burst the world rolled where this shot ended (a customer, a wall) to the look that drew the shot. */
  abstract impactEffect(burst: Burst): Effect;

  /** Hands the spark the world rolled on the customer this shot hit to the look that drew the shot. */
  abstract hitEffect(burst: Burst): Effect;
}
