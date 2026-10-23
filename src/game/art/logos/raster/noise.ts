/**
 * Deterministic noise for procedural textures. Everything is a pure function
 * of integer coordinates and a seed, so generated art is identical on every
 * visit and in every screenshot.
 */

/** Integer hash of (x, y, seed) to [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(Math.floor(x), 0x27d4eb2d) ^ Math.imul(Math.floor(y), 0x165667b1) ^ Math.imul(seed, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Smooth lattice noise in [0, 1): random values on a grid of `cellW` × `cellH`
 * pixels, blended with a smoothstep. Unequal cell sizes stretch the grain —
 * long horizontal cells give the streaks of an old printed card.
 */
export function valueNoise(x: number, y: number, cellW: number, cellH: number, seed: number): number {
  const gx = x / cellW;
  const gy = y / cellH;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = smoothstep(gx - x0);
  const ty = smoothstep(gy - y0);
  const top = mixNumber(hash2(x0, y0, seed), hash2(x0 + 1, y0, seed), tx);
  const bottom = mixNumber(hash2(x0, y0 + 1, seed), hash2(x0 + 1, y0 + 1, seed), tx);
  return mixNumber(top, bottom, ty);
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function mixNumber(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
