import type { World } from '../World';
import type { NavKit } from './kit';

/** A horizontal stretch of walkable top edge: where a body's feet can rest. */
export interface Ledge {
  readonly kind: 'ground' | 'platform' | 'barrier' | 'block';
  /** Left edge, px. */
  readonly x0: number;
  /** Right edge, px, exclusive. */
  readonly x1: number;
  /** The walkable line the feet rest on. */
  readonly top: number;
}

/**
 * Every ledge of the world's stage that stays put: the ground between pits, the one-way platforms, the barriers'
 * tops and the "?" blocks' tops (stood on only after a stray jump).
 */
export function collectLedges(world: World, kit: NavKit): Ledge[] {
  const { TILE, GROUND_Y, GRID_ORIGIN_Y } = kit;
  const { layout } = world.stage;
  const ledges: Ledge[] = [];
  let start = -1;
  layout.ground.forEach((present, col) => {
    if (present && start < 0) start = col;
    if (start >= 0 && (!present || col === layout.columns - 1)) {
      ledges.push({ kind: 'ground', x0: start * TILE, x1: (present ? col + 1 : col) * TILE, top: GROUND_Y });
      start = -1;
    }
  });
  for (const run of layout.platforms) {
    ledges.push({
      kind: 'platform',
      x0: run.from * TILE,
      x1: (run.to + 1) * TILE,
      top: GRID_ORIGIN_Y + run.row * TILE,
    });
  }
  for (const barrier of world.barriers) {
    const { x, y, w } = barrier.rect;
    ledges.push({ kind: 'barrier', x0: x, x1: x + w, top: y });
  }
  for (const block of world.blocks) {
    const { x, y, w } = block.rect;
    ledges.push({ kind: 'block', x0: x, x1: x + w, top: y });
  }
  return ledges;
}

/**
 * The ledge a body `halfBody` px either side of its centre `x`, its feet at `feet`, stands on, or, `airborne`, the
 * highest one below it that it would come down on.
 */
export function ledgeUnder(
  ledges: readonly Ledge[],
  x: number,
  feet: number,
  halfBody: number,
  airborne = false,
): Ledge | null {
  let best: Ledge | null = null;
  for (const ledge of ledges) {
    if (x <= ledge.x0 - halfBody || x >= ledge.x1 + halfBody) continue;
    const fits = airborne ? ledge.top >= feet - 1 : Math.abs(ledge.top - feet) < 1;
    if (fits && (!best || ledge.top < best.top)) best = ledge;
  }
  return best;
}
