import type { Gfx } from '@/engine/gfx/Gfx';
import { easeOutBack } from '@/engine/motion/easing';
import { segment } from '@/engine/motion/progress';

const POLE_HEIGHT = 44;
const FLAG_LOW = 12;
const RAISE_SECONDS = 0.45;

/**
 * A checkpoint flag. Passing it raises the flag and makes it the respawn
 * point for falls into pits.
 */
export class Checkpoint {
  readonly x: number;
  readonly groundY: number;
  #raisedAt: number | null = null;

  constructor(x: number, groundY: number) {
    this.x = x;
    this.groundY = groundY;
  }

  get reached(): boolean {
    return this.#raisedAt !== null;
  }

  /** Raises the flag once the player passes; returns true on the step it happens. */
  check(playerX: number, time: number): boolean {
    if (this.reached || playerX < this.x - 4) return false;
    this.#raisedAt = time;
    return true;
  }

  render(gfx: Gfx, time: number): void {
    const { x, groundY } = this;
    const top = groundY - POLE_HEIGHT;
    gfx.fillRect(x - 3, groundY - 3, 7, 3, '#2c1c38');
    gfx.fillRect(x - 2, groundY - 4, 5, 1, '#4c4662');
    gfx.fillRect(x, top, 2, POLE_HEIGHT - 3, '#d6d0dc');
    gfx.fillRect(x + 1, top, 1, POLE_HEIGHT - 3, '#8c8498');
    gfx.circle(x + 1, top - 1, 2, this.reached ? '#ffd84a' : '#8c8498');

    const raise = this.#raisedAt === null ? 0 : segment(time - this.#raisedAt, 0, RAISE_SECONDS, easeOutBack);
    const flagTop = Math.round(groundY - FLAG_LOW - raise * (POLE_HEIGHT - FLAG_LOW - 4) - 8);
    const color = this.reached ? '#3ddc84' : '#8a90a8';
    const shade = this.reached ? '#1e8a4a' : '#454a63';
    const wave = Math.floor(time * 5) % 2;
    // A pennant: each row one pixel shorter, the tip row flicking up and down to wave.
    for (let row = 0; row < 9; row++) {
      const length = 12 - Math.abs(row - 4) * 2 - (row === 4 ? wave : 0);
      gfx.fillRect(x + 2, flagTop + row, Math.max(1, length), 1, row > 4 ? shade : color);
    }
  }
}
