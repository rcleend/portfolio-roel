import type { Rect } from '@/engine/math/Rect';
import { TILE, type TileGrid } from './grid';

/** A moving axis-aligned box; `x`/`y` is the top-left corner, velocities are in px/s. */
export interface Body {
  x: number;
  y: number;
  readonly w: number;
  readonly h: number;
  vx: number;
  vy: number;
}

/**
 * A walkable top edge that is not part of the tile grid: the roof of a cable
 * car, a U-Bahn carriage or a construction barrier. Surfaces are one-way
 * (land from above, pass through from below) and report how far they moved
 * this step so riders can be carried along.
 */
export interface Surface {
  /** Position after this step's movement; the top edge is the walkable line. */
  readonly rect: Rect;
  readonly dx: number;
  readonly dy: number;
}

/** Everything bodies collide with. */
export interface CollisionWorld {
  readonly grid: TileGrid;
  readonly surfaces: readonly Surface[];
  /** Extra boxes that block from every side, e.g. a closed rate-limit gate. */
  readonly walls: readonly Rect[];
}

export interface Contacts {
  /** Landed on a tile or surface this step. */
  readonly grounded: boolean;
  /** The surface stood on, to be passed back as `riding` next step. */
  readonly surface: Surface | null;
  /** -1 or 1 when a wall stopped horizontal movement, else 0. */
  readonly wall: -1 | 0 | 1;
  /** Solid grid cells the body's head bumped this step ("?" blocks react to these). */
  readonly ceilingCells: readonly { readonly col: number; readonly row: number }[];
}

/** Tolerance for "was exactly touching" comparisons; positions are fractional. */
const EPSILON = 0.01;

/**
 * Moves `body` by its velocity over `dt` and resolves collisions, one axis at
 * a time (x first, then y) — the classic, predictable platformer approach.
 * Speeds stay far below a tile per step, but every crossed row and column is
 * checked anyway so nothing can tunnel.
 *
 * A body `riding` a surface is first carried by that surface's displacement,
 * which keeps it glued to moving platforms without any special casing in
 * the entity.
 */
export function moveBody(body: Body, dt: number, world: CollisionWorld, riding: Surface | null = null): Contacts {
  if (riding) {
    body.x += riding.dx;
    body.y += riding.dy;
  }
  const wall = moveX(body, body.vx * dt, world);
  const vertical = moveY(body, body.vy * dt, world);
  return { wall, ...vertical };
}

function moveX(body: Body, dx: number, world: CollisionWorld): -1 | 0 | 1 {
  if (dx === 0) return 0;
  const { grid } = world;
  const firstRow = grid.rowAt(body.y + EPSILON);
  const lastRow = grid.rowAt(body.y + body.h - EPSILON);
  const blockedAt = (col: number): boolean => {
    for (let row = firstRow; row <= lastRow; row++) if (grid.kindAt(col, row) === 'solid') return true;
    return false;
  };

  let target = body.x + dx;
  let wall: -1 | 0 | 1 = 0;
  if (dx > 0) {
    const oldRight = body.x + body.w;
    for (let col = Math.ceil((oldRight - EPSILON) / TILE); col * TILE < target + body.w; col++) {
      if (blockedAt(col)) {
        target = col * TILE - body.w;
        wall = 1;
        break;
      }
    }
  } else {
    for (let col = Math.floor((body.x + EPSILON) / TILE) - 1; (col + 1) * TILE > target; col--) {
      if (blockedAt(col)) {
        target = (col + 1) * TILE;
        wall = -1;
        break;
      }
    }
  }

  for (const box of world.walls) {
    if (body.y + body.h <= box.y + EPSILON || body.y >= box.y + box.h - EPSILON) continue;
    if (dx > 0 && body.x + body.w <= box.x + EPSILON && target + body.w > box.x) {
      target = box.x - body.w;
      wall = 1;
    } else if (dx < 0 && body.x >= box.x + box.w - EPSILON && target < box.x + box.w) {
      target = box.x + box.w;
      wall = -1;
    }
  }

  body.x = target;
  if (wall !== 0) body.vx = 0;
  return wall;
}

function moveY(body: Body, dy: number, world: CollisionWorld): Omit<Contacts, 'wall'> {
  if (dy > 0) return fall(body, dy, world);
  if (dy < 0) return rise(body, dy, world);
  return { grounded: false, surface: null, ceilingCells: [] };
}

function fall(body: Body, dy: number, world: CollisionWorld): Omit<Contacts, 'wall'> {
  const { grid } = world;
  const oldBottom = body.y + body.h;
  let newBottom = oldBottom + dy;
  let grounded = false;
  let surface: Surface | null = null;

  const firstCol = grid.colAt(body.x + EPSILON);
  const lastCol = grid.colAt(body.x + body.w - EPSILON);
  // One-way tiles only catch bodies whose feet were at or above their top before this step.
  rows: for (let row = Math.ceil((oldBottom - EPSILON - grid.originY) / TILE); grid.rowTop(row) < newBottom; row++) {
    for (let col = firstCol; col <= lastCol; col++) {
      if (grid.kindAt(col, row) !== 'empty') {
        newBottom = grid.rowTop(row);
        grounded = true;
        break rows;
      }
    }
  }

  for (const candidate of world.surfaces) {
    const { rect } = candidate;
    const topBefore = rect.y - candidate.dy;
    const overlapsX = body.x < rect.x + rect.w && rect.x < body.x + body.w;
    // `rect.y <= newBottom` also prefers the highest catch when a tile or another surface is in reach.
    if (overlapsX && oldBottom <= topBefore + EPSILON && rect.y <= newBottom) {
      newBottom = rect.y;
      grounded = true;
      surface = candidate;
    }
  }

  for (const box of world.walls) {
    const overlapsX = body.x < box.x + box.w - EPSILON && box.x < body.x + body.w - EPSILON;
    if (overlapsX && oldBottom <= box.y + EPSILON && newBottom > box.y) {
      newBottom = box.y;
      grounded = true;
      surface = null;
    }
  }

  body.y = newBottom - body.h;
  if (grounded) body.vy = 0;
  return { grounded, surface, ceilingCells: [] };
}

function rise(body: Body, dy: number, world: CollisionWorld): Omit<Contacts, 'wall'> {
  const { grid } = world;
  const oldTop = body.y;
  let newTop = oldTop + dy;
  const ceilingCells: { col: number; row: number }[] = [];

  const firstCol = grid.colAt(body.x + EPSILON);
  const lastCol = grid.colAt(body.x + body.w - EPSILON);
  for (let row = grid.rowAt(oldTop + EPSILON) - 1; grid.rowTop(row) + TILE > newTop; row--) {
    for (let col = firstCol; col <= lastCol; col++) {
      if (grid.kindAt(col, row) === 'solid') ceilingCells.push({ col, row });
    }
    if (ceilingCells.length > 0) {
      newTop = grid.rowTop(row) + TILE;
      break;
    }
  }

  for (const box of world.walls) {
    const overlapsX = body.x < box.x + box.w - EPSILON && box.x < body.x + body.w - EPSILON;
    if (overlapsX && oldTop >= box.y + box.h - EPSILON && newTop < box.y + box.h) newTop = box.y + box.h;
  }

  if (newTop !== oldTop + dy) body.vy = 0;
  body.y = newTop;
  return { grounded: false, surface: null, ceilingCells };
}
