import type { Rect } from '@/engine/math/Rect';
import { Customer } from '../entities/customer/Customer';
import { ESCALATED_CUSTOMER } from '../entities/customer/tuning';
import { TILE } from './grid';

/** How far past the arena wall the player must walk before it closes behind them. */
const ENTRY_DEPTH = 2 * TILE;
/** Seconds between the wall closing and the escalated customer dropping in. */
const DROP_DELAY = 1.1;
/** The escalated customer never lands closer than this to the player. */
const LANDING_CLEARANCE = 96;
/** Feet height the escalated customer falls from: above the top of the screen. */
const DROP_HEIGHT = -40;

/**
 * The boss arena at the end of a level: a one-screen space that closes
 * behind the player, then the escalated customer drops in — at its marker,
 * or mirrored across the arena if the player happens to be standing there.
 */
export class Arena {
  /** Left wall of the arena. */
  readonly x: number;
  readonly #width: number;
  readonly #bossX: number;
  #entered = false;
  #dropAt: number | null = null;
  #boss: Customer | null = null;

  constructor(arenaCol: number, bossCol: number, width: number) {
    this.x = arenaCol * TILE;
    this.#width = width;
    this.#bossX = bossCol * TILE + TILE / 2;
  }

  get entered(): boolean {
    return this.#entered;
  }

  get boss(): Customer | null {
    return this.#boss;
  }

  /** Where the player respawns once the arena has been entered. */
  get respawnX(): number {
    return this.x + ENTRY_DEPTH;
  }

  /** The closed wall behind the player, or null before entering. */
  get wall(): Rect | null {
    return this.#entered ? { x: this.x - TILE, y: -240, w: TILE, h: 480 } : null;
  }

  /** Closes the arena once the player is inside; returns true on the step that happens. */
  enter(playerX: number, time: number): boolean {
    if (this.#entered || playerX <= this.x + ENTRY_DEPTH) return false;
    this.#entered = true;
    this.#dropAt = time + DROP_DELAY;
    return true;
  }

  /** Spawns the escalated customer when its moment comes; returns it on that step only. */
  dropBoss(time: number, playerX: number): Customer | null {
    if (this.#dropAt === null || time < this.#dropAt) return null;
    this.#dropAt = null;
    const mirrored = 2 * this.x + this.#width - this.#bossX;
    const x = Math.abs(playerX - this.#bossX) < LANDING_CLEARANCE ? mirrored : this.#bossX;
    this.#boss = new Customer(ESCALATED_CUSTOMER, x, DROP_HEIGHT, { kind: 'entering' });
    return this.#boss;
  }
}
