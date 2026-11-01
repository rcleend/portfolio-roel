import type { World } from '../World';
import type { Nav } from './Nav';
import { type Goal, planRoute, type Route } from './route';

/** How far above a floor's line a point still counts as on it, px: pointing at the floor, not at the air over it. */
const ABOVE_FLOOR = 6;
/** How deep a raised ledge reads as floor below its line, px: the girders' and barriers' visible top bars. */
const LEDGE_DEPTH = 12;
/** A vehicle's roof is a target this far above and below its line, px. */
const ROOF_REACH = { above: 10, below: 12 } as const;

/** What a double click on a point of the world would set the hero off to, and the route there. */
export interface WalkTarget {
  readonly goal: Goal;
  readonly route: Route;
  /** Where the hero heads, for the cursor's direction: the block, the vehicle or the spot on the floor. */
  readonly x: number;
}

/**
 * The walk a double click at world point (x, y) asks for, if the hero can get there: an unopened "?" block to
 * head-butt, a vehicle's roof to board, or a spot on a floor (the ground, a girder, a barrier's top), on foot or
 * with jumps. Null for the air, the pits, the customers above the floor, and anywhere out of reach.
 */
export function walkTargetAt(nav: Nav, world: World, x: number, y: number): WalkTarget | null {
  const goal = goalAt(nav, world, x, y);
  if (!goal) return null;
  const route = planRoute(nav, world, goal);
  if (!route) return null;
  const at =
    goal.kind === 'stand'
      ? goal.x
      : goal.kind === 'board'
        ? goal.mover.rect.x + goal.mover.rect.w / 2
        : goal.block.rect.x + goal.block.rect.w / 2;
  return { goal, route, x: at };
}

function goalAt(nav: Nav, world: World, x: number, y: number): Goal | null {
  for (const block of world.blocks) {
    const r = block.rect;
    if (!block.used && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return { kind: 'bump', block };
  }
  for (const mover of world.movers) {
    const roof = mover.rect;
    const onRoof =
      x >= roof.x && x < roof.x + roof.w && y >= roof.y - ROOF_REACH.above && y < roof.y + ROOF_REACH.below;
    if (onRoof) return world.player.standingOn === mover ? null : { kind: 'board', mover };
  }
  let best: Goal | null = null;
  for (const ledge of nav.ledges(world)) {
    if (ledge.kind === 'block' || x < ledge.x0 || x >= ledge.x1) continue;
    const depth = ledge.kind === 'ground' ? Number.POSITIVE_INFINITY : LEDGE_DEPTH;
    if (y < ledge.top - ABOVE_FLOOR || y >= ledge.top + depth) continue;
    if (best?.kind === 'stand' && best.ledge.top <= ledge.top) continue;
    const at = Math.min(Math.max(x, ledge.x0 + nav.halfBody), ledge.x1 - nav.halfBody);
    best = { kind: 'stand', ledge, x: at };
  }
  return best;
}
