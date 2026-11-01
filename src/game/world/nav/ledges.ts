import { TILE } from '../grid';
import { GRID_ORIGIN_Y, GROUND_Y } from '../map/buildGrid';
import type { World } from '../World';

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

/** Half the hero's width: a centre this far inside a ledge stands on it whole. */
export const HALF_BODY = 6;

const cache = new WeakMap<World, { readonly all: readonly Ledge[]; readonly arena: readonly Ledge[] }>();

/**
 * Every ledge of the world's stage that stays put: the ground between pits, the one-way platforms, the barriers'
 * tops and the "?" blocks' tops (stood on only after a stray jump). Once the arena has closed behind the hero, only
 * what lies inside it.
 */
export function ledgesOf(world: World): readonly Ledge[] {
  let entry = cache.get(world);
  if (!entry) {
    const all = collect(world);
    const wall = world.arena.x;
    const arena = all
      .map((ledge) => ({ ...ledge, x0: Math.max(ledge.x0, wall) }))
      .filter((ledge) => ledge.x1 - ledge.x0 >= TILE);
    entry = { all, arena };
    cache.set(world, entry);
  }
  return world.arena.entered ? entry.arena : entry.all;
}

function collect(world: World): Ledge[] {
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
 * The ledge a body with its centre at `x` and its feet at `feet` stands on, or, `airborne`, the highest one below it
 * that it would come down on.
 */
export function ledgeUnder(ledges: readonly Ledge[], x: number, feet: number, airborne = false): Ledge | null {
  let best: Ledge | null = null;
  for (const ledge of ledges) {
    if (x <= ledge.x0 - HALF_BODY || x >= ledge.x1 + HALF_BODY) continue;
    const fits = airborne ? ledge.top >= feet - 1 : Math.abs(ledge.top - feet) < 1;
    if (fits && (!best || ledge.top < best.top)) best = ledge;
  }
  return best;
}
