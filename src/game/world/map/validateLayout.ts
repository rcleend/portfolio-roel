import { TILE } from '../grid';
import { GRID_ORIGIN_Y, GROUND_Y } from './buildGrid';
import { type Cell, GROUND_ROW, type LevelLayout } from './layout';

/** What the player can jump, as a pure function of the movement tuning. */
export interface JumpEnvelope {
  /** Highest the feet can rise above the take-off surface, in px. */
  readonly maxRise: number;
  /** Longest horizontal distance in px that lands `rise` px above (negative: below) the take-off height. */
  reach(rise: number): number;
  /** Player body height, which decides whether the head reaches a block. */
  readonly bodyHeight: number;
}

/** Heights of the stage's props, which the layout only marks by position. */
export interface LayoutValidationOptions {
  /** How far a moving platform's roof sits above the ground, in px. */
  readonly moverRoof: number;
  /** How far a barrier's walkable top sits above the ground, in px. */
  readonly barrierTop: number;
  /** Barrier width in tiles. */
  readonly barrierTiles: number;
}

/** A horizontal stretch the player can stand on. */
interface Ledge {
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly kind: 'ground' | 'platform' | 'mover' | 'barrier';
}

const STAND_ROW = GROUND_ROW - 1;
const rowTop = (row: number): number => GRID_ORIGIN_Y + row * TILE;

/**
 * Sanity checks a layout against the player's jump. Returns human-readable
 * issues (empty when the layout is sound): markers that stand on nothing,
 * a goal the player cannot reach, highlight blocks nobody can head-butt.
 *
 * Reachability is deliberately conservative: it ignores the extra distance a
 * body's width buys at a ledge and treats every jump as starting at full run
 * speed, so a layout that passes here is comfortably playable.
 */
export function validateLayout(
  layout: LevelLayout,
  envelope: JumpEnvelope,
  options: LayoutValidationOptions,
): string[] {
  const issues: string[] = [];
  const onGround = (cell: Cell, what: string): void => {
    if (cell.row !== STAND_ROW || !layout.ground[cell.col]) {
      issues.push(`${what} at column ${cell.col} must stand on the ground (row ${STAND_ROW})`);
    }
  };

  if (!layout.ground[0] || !layout.ground[layout.columns - 1]) issues.push('the level must start and end on ground');
  onGround(layout.start, 'the player start');
  onGround(layout.goal, 'the goal');
  onGround(layout.boss, 'the escalated customer');
  for (const cell of layout.checkpoints) onGround(cell, 'a checkpoint');
  for (const cell of layout.gates) onGround(cell, 'a gate');
  for (const run of layout.movers) {
    if (run.row !== STAND_ROW) issues.push(`the moving platform at column ${run.from} must run along row ${STAND_ROW}`);
    if (!layout.ground[run.from] || !layout.ground[run.to]) {
      issues.push(`the moving platform at column ${run.from} must start and end its track over ground`);
    }
  }
  for (const barrier of layout.barriers) {
    for (let col = barrier.col; col < barrier.col + options.barrierTiles; col++) {
      if (barrier.row !== STAND_ROW || !layout.ground[col]) {
        issues.push(`the barrier at column ${barrier.col} must stand on ground across all its tiles`);
        break;
      }
    }
  }
  if (
    !(layout.start.col < layout.arenaCol && layout.arenaCol < layout.boss.col && layout.boss.col <= layout.goal.col)
  ) {
    issues.push('expected start < arena < escalated customer <= goal, from left to right');
  }
  const checkpointsInOrder = layout.checkpoints.every(
    (cell, i, all) =>
      cell.col > layout.start.col && cell.col < layout.arenaCol && (i === 0 || cell.col > (all[i - 1]?.col ?? 0)),
  );
  if (!checkpointsInOrder) issues.push('checkpoints must sit between the start and the arena');

  const ledges = collectLedges(layout, options);
  for (const customer of layout.customers) {
    const feet = rowTop(customer.row + 1);
    const x = customer.col * TILE + TILE / 2;
    const standsOn = (ledge: Ledge) => ledge.kind !== 'mover' && ledge.top === feet && x >= ledge.x0 && x < ledge.x1;
    if (!ledges.some(standsOn)) {
      issues.push(`the customer at column ${customer.col} stands on nothing`);
    }
  }

  const reachable = reachableLedges(ledges, layout.start, envelope);
  const goalX = layout.goal.col * TILE + TILE / 2;
  if (![...reachable].some((ledge) => ledge.top === GROUND_Y && goalX >= ledge.x0 && goalX < ledge.x1)) {
    issues.push('the goal cannot be reached from the start');
  }
  for (const block of layout.blocks) {
    const bottom = rowTop(block.row) + TILE;
    const [x0, x1] = [block.col * TILE, block.col * TILE + TILE];
    const hittable = [...reachable].some(
      (ledge) =>
        ledge.x0 < x1 &&
        x0 < ledge.x1 &&
        ledge.top > bottom &&
        ledge.top - bottom <= envelope.bodyHeight + envelope.maxRise,
    );
    if (!hittable) issues.push(`the highlight block at column ${block.col} cannot be hit from below`);
  }
  return issues;
}

function collectLedges(layout: LevelLayout, options: LayoutValidationOptions): Ledge[] {
  const ledges: Ledge[] = [];
  let runStart = -1;
  layout.ground.forEach((present, col) => {
    if (present && runStart < 0) runStart = col;
    const endsRun = runStart >= 0 && (!present || col === layout.columns - 1);
    if (endsRun) {
      const end = present ? col + 1 : col;
      ledges.push({ x0: runStart * TILE, x1: end * TILE, top: GROUND_Y, kind: 'ground' });
      runStart = -1;
    }
  });
  for (const run of layout.platforms) {
    ledges.push({ x0: run.from * TILE, x1: (run.to + 1) * TILE, top: rowTop(run.row), kind: 'platform' });
  }
  for (const run of layout.movers) {
    ledges.push({ x0: run.from * TILE, x1: (run.to + 1) * TILE, top: GROUND_Y - options.moverRoof, kind: 'mover' });
  }
  for (const barrier of layout.barriers) {
    const x0 = barrier.col * TILE;
    ledges.push({ x0, x1: x0 + options.barrierTiles * TILE, top: GROUND_Y - options.barrierTop, kind: 'barrier' });
  }
  return ledges;
}

function reachableLedges(ledges: readonly Ledge[], start: Cell, envelope: JumpEnvelope): Set<Ledge> {
  const startX = start.col * TILE + TILE / 2;
  const first = ledges.find((ledge) => ledge.top === GROUND_Y && startX >= ledge.x0 && startX < ledge.x1);
  const reached = new Set<Ledge>();
  if (!first) return reached;
  const queue = [first];
  reached.add(first);
  while (queue.length > 0) {
    const from = queue.shift() as Ledge;
    for (const to of ledges) {
      if (reached.has(to) || !canJump(from, to, envelope)) continue;
      reached.add(to);
      queue.push(to);
    }
  }
  return reached;
}

function canJump(from: Ledge, to: Ledge, envelope: JumpEnvelope): boolean {
  const rise = from.top - to.top;
  if (rise > envelope.maxRise) return false;
  const gap = Math.max(0, to.x0 - from.x1, from.x0 - to.x1);
  return gap <= envelope.reach(rise);
}
