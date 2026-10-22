import type { Gfx } from '@/engine/gfx/Gfx';
import { INK } from './palette';

/**
 * A spike of light, frame by frame: a white-hot core inside flat rings of
 * glow (the classic's fireball, in phosphor), and rays: a horizontal pair,
 * a vertical pair and four diagonals, each reaching its own length.
 */
export interface Spike {
  readonly core: number;
  /** Outer radius of the banded glow around the core; at most `core` for none. */
  readonly glow: number;
  readonly across: number;
  readonly up: number;
  readonly diagonal: number;
}

/** Where a long ray changes ink and thickness, as fractions of its reach: white-hot and thick, hot, then lit to the tip. */
const RAY_STEPS = [
  { until: 0.3, ink: INK[5], width: 3 },
  { until: 0.6, ink: INK[4], width: 1 },
  { until: 1, ink: INK[3], width: 1 },
] as const;
/**
 * The glow's flat rings, outermost first, as fractions of the way from the
 * core out to the glow's edge: white → mint → green, the classic
 * fireball's banding in phosphor, and never darker than the glass behind.
 */
const GLOW_RINGS = [
  { at: 1, ink: INK[2] },
  { at: 0.66, ink: INK[3] },
  { at: 0.33, ink: INK[4] },
] as const;

/** Draws `spike` centred on (x, y): rays first, then the glow's rings and the core on top. */
export function drawSpike(gfx: Gfx, x: number, y: number, spike: Spike): void {
  drawRay(gfx, x, y, spike.core, spike.across, 1, 0);
  drawRay(gfx, x, y, spike.core, spike.across, -1, 0);
  drawRay(gfx, x, y, spike.core, spike.up, 0, 1);
  drawRay(gfx, x, y, spike.core, spike.up, 0, -1);
  drawDiagonals(gfx, x, y, spike.core, spike.diagonal);
  const span = spike.glow - spike.core;
  if (span > 0) {
    for (const ring of GLOW_RINGS) gfx.circle(x, y, spike.core + Math.round(span * ring.at), ring.ink);
  }
  if (spike.core > 0) gfx.circle(x, y, spike.core, INK[5]);
}

/** One long ray from the core's edge outwards along (dx, dy), cooling and thinning in flat steps. */
function drawRay(gfx: Gfx, x: number, y: number, core: number, reach: number, dx: number, dy: number): void {
  let from = core + 1;
  for (const step of RAY_STEPS) {
    const to = Math.round(reach * step.until);
    if (to > from) {
      const half = (step.width - 1) / 2;
      const length = to - from;
      // A ray along x is `length` wide and `width` tall; along y the other way round.
      const left = dx > 0 ? x + from : dx < 0 ? x - to + 1 : x - half;
      const top = dy > 0 ? y + from : dy < 0 ? y - to + 1 : y - half;
      gfx.fillRect(left, top, dx === 0 ? step.width : length, dy === 0 ? step.width : length, step.ink);
    }
    from = Math.max(from, to);
  }
}

const DIAGONALS = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

/** The four diagonal rays, a pixel wide, hot for their inner half and lit beyond. */
function drawDiagonals(gfx: Gfx, x: number, y: number, core: number, reach: number): void {
  const from = core + 1;
  if (reach < from) return;
  const middle = Math.max(from, Math.round(reach / 2));
  for (const [dx, dy] of DIAGONALS) {
    gfx.line(x + dx * from, y + dy * from, x + dx * middle, y + dy * middle, INK[4]);
    if (reach > middle) gfx.line(x + dx * (middle + 1), y + dy * (middle + 1), x + dx * reach, y + dy * reach, INK[3]);
  }
}
