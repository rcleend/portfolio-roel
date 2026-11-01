import { MOVEMENT, type MoveScale, NORMAL_SCALE, PlatformerMotor } from '../../entities/player/movement';
import type { Body } from '../collision';

/** Above the top of a ledge the feet must rise by this much before a jump counts on landing there, px. */
const CLEARANCE = 1.5;
/** Frames of flight simulated: long enough to fall well below the take-off. */
const FLIGHT_FRAMES = 90;
const DT = 1 / 60;

/** A full jump from a standing start, held all the way up and steering one way: its height and distance per frame. */
interface Arc {
  /** Height of the feet above the take-off, px. */
  readonly rise: Float32Array;
  /** Distance from the take-off, px. */
  readonly run: Float32Array;
  readonly apex: number;
}

const arcs = new Map<string, Arc>();

/**
 * The jump the real motor makes, from rest so that every jump the walker takes reaches at least as far: the
 * same `PlatformerMotor` the hero runs on, stepped on a free body. Cached per scale.
 */
function arcFor(scale: MoveScale): Arc {
  const key = `${scale.speed}:${scale.jump}`;
  const cached = arcs.get(key);
  if (cached) return cached;
  const motor = new PlatformerMotor();
  const body: Body = { x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0 };
  const rise = new Float32Array(FLIGHT_FRAMES);
  const run = new Float32Array(FLIGHT_FRAMES);
  motor.settle(true);
  let apex = 0;
  for (let frame = 0; frame < FLIGHT_FRAMES; frame++) {
    motor.step(body, { x: 1, jumpPressed: frame === 0, jumpHeld: body.vy <= 0 }, DT, scale);
    body.x += body.vx * DT;
    body.y += body.vy * DT;
    motor.settle(false);
    rise[frame] = -body.y;
    run[frame] = body.x;
    apex = Math.max(apex, -body.y);
  }
  const arc = { rise, run, apex };
  arcs.set(key, arc);
  return arc;
}

/** The highest ledge a full jump lands on, above its take-off, px. */
export function maxRise(scale: MoveScale = NORMAL_SCALE): number {
  return arcFor(scale).apex - CLEARANCE;
}

/** How high the head reaches above the take-off's feet line, with a body `height` px tall. */
export function headReach(height: number, scale: MoveScale = NORMAL_SCALE): number {
  return arcFor(scale).apex + height - CLEARANCE;
}

/**
 * How far a full jump carries the feet before they come down through a ledge `rise` px above the take-off (below it
 * when negative), or -Infinity when the jump never gets above it.
 */
export function reach(rise: number, scale: MoveScale = NORMAL_SCALE): number {
  const arc = arcFor(scale);
  if (rise > arc.apex - CLEARANCE) return Number.NEGATIVE_INFINITY;
  let best = 0;
  for (let frame = 0; frame < FLIGHT_FRAMES; frame++) {
    const height = arc.rise[frame] ?? 0;
    const falling = frame > 0 && height < (arc.rise[frame - 1] ?? 0);
    if (falling && height < rise) break;
    best = arc.run[frame] ?? best;
  }
  return best;
}

/** How far a body walking off a ledge at full speed travels while it drops `drop` px, never steering back. */
export function dropReach(drop: number, scale: MoveScale = NORMAL_SCALE): number {
  return MOVEMENT.runSpeed * scale.speed * Math.sqrt((2 * Math.max(0, drop)) / MOVEMENT.fallGravity);
}
