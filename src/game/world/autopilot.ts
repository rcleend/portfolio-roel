import { IDLE_INTENT, type PlayerIntent } from '../entities/player/Player';
import { TILE } from './grid';
import type { World } from './World';

/** How far ahead of the feet a pit triggers a jump, px. */
const PIT_LOOKAHEAD = 14;

/**
 * A simple, deterministic player for tests and tooling: runs right while
 * attacking, jumps pits, waits at closed gates, rides vehicles across wide
 * gaps, head-butts highlight blocks it can reach from where it runs, and
 * stands its ground against the escalated customer, jumping its charges and
 * low complaints. It plays like a decent
 * first-timer, so its completion time approximates a casual run.
 *
 * Lives next to the world (not in a test file) so both unit tests and
 * scripts can use it; the game itself never does.
 */
export class Autopilot {
  #jumpFrames = 0;

  intent(world: World): PlayerIntent {
    if (this.#jumpFrames > 0) {
      this.#jumpFrames--;
      return { ...this.#cruise(world), jumpPressed: false, jumpHeld: true };
    }
    if (world.boss?.active) return this.#fightBoss(world);
    const mover = this.#moverAhead(world);
    if (mover) return mover;
    if (this.#gateClosedAhead(world)) return { ...IDLE_INTENT, attackHeld: true };
    if (world.player.grounded && (this.#pitAhead(world) || this.#blockOverhead(world))) return this.#jump(world);
    return this.#cruise(world);
  }

  #cruise(world: World): PlayerIntent {
    const onMover = world.movers.some((mover) => world.player.standingOn === mover);
    return { ...IDLE_INTENT, x: onMover ? 0 : 1, attackHeld: true };
  }

  #jump(world: World, frames = 18): PlayerIntent {
    this.#jumpFrames = frames;
    return { ...this.#cruise(world), jumpPressed: true, jumpHeld: true };
  }

  #pitAhead(world: World): boolean {
    const probe = world.player.body.x + world.player.body.w + PIT_LOOKAHEAD;
    const coveredByMover = world.movers.some((mover) => probe >= mover.track.from && probe <= mover.track.to);
    return !coveredByMover && this.#pitAt(world, PIT_LOOKAHEAD);
  }

  #pitAt(world: World, ahead: number): boolean {
    const { player, grid } = world;
    const probe = player.body.x + player.body.w + ahead;
    return grid.kindAt(grid.colAt(probe), grid.rowAt(player.feet + 1)) === 'empty';
  }

  #blockOverhead(world: World): boolean {
    const { player } = world;
    return world.blocks.some((block) => {
      const { x, y, h } = block.rect;
      const reachable = player.feet - (y + h) < 80;
      return !block.used && reachable && Math.abs(x + TILE / 2 - player.centerX) < 4;
    });
  }

  #gateClosedAhead(world: World): boolean {
    const { player } = world;
    const right = player.body.x + player.body.w;
    return world.gates.some((gate) => {
      const wall = gate.wall;
      return wall !== null && wall.x - right >= -1 && wall.x - right < 12;
    });
  }

  /** Board the vehicle that crosses the gap ahead, ride it, and step off on the far side. */
  #moverAhead(world: World): PlayerIntent | null {
    const { player } = world;
    for (const mover of world.movers) {
      const { from, to } = mover.track;
      if (player.centerX < from - 40 || player.centerX > to) continue;
      if (player.standingOn === mover) {
        const arrived = mover.dx === 0 && mover.x > from;
        return { ...IDLE_INTENT, x: arrived ? 1 : 0, attackHeld: true };
      }
      if (player.centerX > to - 48 && player.grounded) return null;
      const roof = mover.rect;
      const under = player.centerX > roof.x + 8 && player.centerX < roof.x + roof.w - 8;
      if (under && player.grounded) return this.#jump(world, 24);
      // Walk up to the vehicle, but wait at the edge while it is still on its way back.
      const toward = player.centerX < roof.x + roof.w / 2;
      return { ...IDLE_INTENT, x: toward && !this.#pitAt(world, 6) ? 1 : 0, attackHeld: true };
    }
    return null;
  }

  #fightBoss(world: World): PlayerIntent {
    const { player } = world;
    const boss = world.boss;
    if (!boss) return IDLE_INTENT;
    const dx = boss.centerX - player.centerX;
    const toward = dx > 0 ? 1 : -1;
    const lowBubble = world.bubbles.some(
      (bubble) => Math.abs(bubble.center.x - player.centerX) < 40 && bubble.rect.y + bubble.rect.h > player.feet - 20,
    );
    if (player.grounded && (boss.charging || lowBubble)) return this.#jump(world, 20);
    // Stand your ground facing the customer and keep firing, like a first-timer would.
    return { ...IDLE_INTENT, x: player.facing !== toward ? toward : 0, attackHeld: true };
  }
}
