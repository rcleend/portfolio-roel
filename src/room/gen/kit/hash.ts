/**
 * Integer hashes, the same in JavaScript and in GLSL ES 3.0. A float hash built on `sin` gives every GPU its own grain
 * (precision differs); these are exact 32-bit integer arithmetic, so every device draws the same boards, the same paint
 * and the same leaves.
 */

/** A 32-bit mix (lowbias32). */
export function hash32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** 0 ≤ value < 1 for an integer lattice point. */
export function hash2(x: number, y: number): number {
  return hash32(Math.imul(x | 0, 0x9e3779b1) ^ hash32(y | 0)) / 4294967296;
}

/** A small seeded generator for the builders (leaf angles, board lengths): the same room on every visit. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    return hash32(state) / 4294967296;
  };
}

/** The same functions for the bake's shaders, plus value noise and fbm on the integer lattice. */
export const HASH_GLSL = /* glsl */ `
uint hash32(uint x) {
  x ^= x >> 16; x *= 0x7feb352dU; x ^= x >> 15; x *= 0x846ca68bU; x ^= x >> 16;
  return x;
}
float hash2(ivec2 p) {
  return float(hash32((uint(p.x) * 0x9e3779b1U) ^ hash32(uint(p.y)))) * (1.0 / 4294967296.0);
}
float vnoise(vec2 p) {
  vec2 cell = floor(p);
  ivec2 i = ivec2(cell);
  vec2 f = p - cell;
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + ivec2(1, 0)), f.x), mix(hash2(i + ivec2(0, 1)), hash2(i + ivec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float sum = 0.0;
  float gain = 0.5;
  for (int octave = 0; octave < 5; octave++) {
    sum += gain * vnoise(p);
    p = p * 2.03 + 17.0;
    gain *= 0.5;
  }
  return sum;
}
`;
