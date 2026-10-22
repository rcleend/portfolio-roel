import type { Gfx } from '@/engine/gfx/Gfx';
import { BLOOM, BLOOM_SOFT } from './colors';
import { STAGE } from './layout';

/** Each ring's share of the bloom's radius, outermost first: thin hot rims round a blinding core. */
const SHARES = [1, 0.92, 0.83, 0.72] as const;
const SOFT_SHARES = [1, 0.7, 0.45] as const;
/** A blast at ground level spreads sideways: the bloom is this much wider than tall. */
const SPREAD = 1.4;
/** The flare streak's bands from its core outwards, as shares of its half-width. */
const FLARE: readonly (readonly [color: string, share: number, rows: number])[] = [
  [BLOOM[0], 1, 1],
  [BLOOM[1], 0.7, 1],
  [BLOOM[2], 0.45, 3],
  [BLOOM[3], 0.25, 1],
];

/**
 * The ignition bloom on the pad, the backdrop's opening hit: a dome of flat
 * rings spreading along the ground, from a rose rim to a white-hot core,
 * with the rocket and its tower standing black against it. Under reduced
 * motion it is a small warm glow with no white in it.
 */
export function drawBloom(gfx: Gfx, radius: number, reducedMotion: boolean): void {
  const colors = reducedMotion ? BLOOM_SOFT : BLOOM;
  const shares = reducedMotion ? SOFT_SHARES : SHARES;
  for (let i = 0; i < colors.length; i++) {
    const ry = Math.round(radius * (shares[i] ?? 1));
    if (ry > 0) filledEllipse(gfx, STAGE.pad.x, STAGE.pad.y + 1, Math.round(ry * SPREAD), ry, colors[i] ?? BLOOM[0]);
  }
}

/** The anamorphic streak through the bloom on the first frames: the lens catching the ignition. */
export function drawFlare(gfx: Gfx, halfWidth: number): void {
  const y = STAGE.pad.y - 3;
  for (const [color, share, rows] of FLARE) {
    const half = Math.round(halfWidth * share);
    const top = y - Math.floor(rows / 2);
    if (half > 0) gfx.fillRect(STAGE.pad.x - half, top, half * 2 + 1, rows, color);
  }
}

function filledEllipse(gfx: Gfx, cx: number, cy: number, rx: number, ry: number, color: string): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
    gfx.fillRect(cx - half, cy + dy, half * 2 + 1, 1, color);
  }
}
