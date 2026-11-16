import { HASH_GLSL } from './kit/hash';

/**
 * Surface functions: what a chart is made of, as code. The bake evaluates one per texel, once, with the chart's own
 * coordinates in metres; a frame only ever reads the result.
 */
export const MATERIAL = {
  /** A flat colour: `params.rgb`. */
  plain: 0,
  /** Brushed enamel paint over wood: `params.rgb`, with a faint long brush grain and an orange-peel mottle. */
  enamel: 1,
  /** Matte paint over beadboard panelling: `params.rgb`, roller stipple, slow unevenness and the boards' grooves. */
  wallPaint: 2,
  /** Oak boards, 0.22 m wide and 1.4 m long, staggered by row, each its own tone and grain. */
  oak: 3,
  /** A print from the art page: `params` is its rectangle there. */
  print: 4,
  /** Matte paint over smooth plaster (the ceilings): `params.rgb`. */
  plaster: 5,
  /** The rug's pile: navy and ivory squares, `params.x` metres a square, with the pile's own soft mottle. */
  rug: 6,
  /**
   * Stained softwood furniture (the dresser): `params.rgb` the stain; `params.a` under 0.5 runs the grain along the
   * chart, from 0.5 up it, and its fraction seeds the board.
   */
  stained: 7,
  /** A sheet of printed paper: `params.rgb`, with faint lines of text across it. */
  paper: 8,
} as const;

/** `vec3 surface(float material, vec2 metres, vec2 st, vec4 params, out float cavity)`; needs `uArt`. */
export const SURFACE_GLSL = /* glsl */ `
${HASH_GLSL}
uniform sampler2D uArt;

vec4 oakBoards(vec2 p) {
  // Twenty-two rows across the room's depth, boards 1.4 m long, each row's first cut to one of three lengths.
  const float W = 4.8 / 22.0;
  const float len = 1.4;
  float row = floor(p.y / W);
  float third = mod(row, 3.0);
  float shifted = p.x + len - (third < 0.5 ? 0.45 : third < 1.5 ? 0.95 : 1.4);
  float col = floor(shifted / len);
  ivec2 id = ivec2(int(col), int(row));
  vec2 f = vec2(shifted - col * len, p.y - row * W);
  float tone = hash2(id);
  vec3 base = mix(vec3(0.36, 0.19, 0.13), vec3(0.6, 0.36, 0.25), tone);
  base = mix(base, vec3(0.46, 0.26, 0.17), hash2(id + ivec2(91, 7)) * 0.5);
  // Long grain: streaks stretched 40:1 along the board, bent by a slow warp; latewood lines; fine pores.
  vec2 g = vec2(p.x * 0.9 + hash2(id + ivec2(2, 0)) * 20.0, p.y * 38.0 + tone * 50.0);
  g.y += fbm(vec2(p.x * 1.3, p.y * 2.0) + vec2(id)) * 5.0;
  float streak = fbm(g);
  float rings = smoothstep(0.35, 0.65, fract(g.y * 0.35 + streak * 2.2));
  float pores = vnoise(vec2(p.x * 160.0, p.y * 900.0));
  base *= 0.86 + 0.2 * streak;
  base *= 1.0 - 0.13 * rings;
  base *= 0.94 + 0.09 * pores;
  // The seam between boards: a bevel a few millimetres wide that falls into shadow.
  float edge = min(min(f.x, len - f.x), min(f.y, W - f.y));
  return vec4(base, smoothstep(0.0008, 0.008, edge));
}

vec3 surface(float material, vec2 metres, vec2 st, vec4 params, out float cavity) {
  cavity = 1.0;
  if (material < 0.5) return params.rgb;
  if (material < 1.5) {
    float brush = fbm(vec2(metres.x * 420.0, metres.y * 9.0) + params.a * 31.0);
    float peel = vnoise(metres * 260.0 + params.a * 7.0);
    return params.rgb * (0.955 + 0.06 * brush + 0.025 * peel);
  }
  if (material < 2.5) {
    float stipple = vnoise(metres * 520.0);
    float slow = fbm(metres * 1.7 + 3.0);
    // Beadboard: a narrow groove every 9.5 cm, a soft dark line with a lit edge beside it.
    float board = fract(metres.x / 0.095);
    float groove = smoothstep(0.0, 0.022, board) * smoothstep(0.0, 0.022, 1.0 - board);
    cavity = mix(0.9, 1.0, groove);
    return params.rgb * (0.93 + 0.05 * stipple + 0.12 * slow) * (1.0 + 0.05 * smoothstep(0.022, 0.05, board) * (1.0 - smoothstep(0.05, 0.12, board)));
  }
  if (material < 3.5) {
    vec4 wood = oakBoards(metres);
    cavity = mix(0.18, 1.0, wood.a);
    return wood.rgb;
  }
  if (material < 4.5) {
    // The art page's rows run downwards; a print's own t runs up.
    vec2 at = clamp(st, 0.0, 1.0);
    return texture(uArt, params.xy + vec2(at.x, 1.0 - at.y) * params.zw).rgb;
  }
  if (material < 5.5) return params.rgb * (0.95 + 0.04 * vnoise(metres * 380.0) + 0.08 * fbm(metres * 1.3 + 9.0));
  if (material > 7.5) {
    vec2 inside = step(vec2(0.025), metres) * step(vec2(0.025), 1.0 - st) * step(vec2(0.0), st);
    float line = step(0.55, fract(metres.y / 0.011)) * inside.x * inside.y * step(0.25, hash2(ivec2(int(metres.y / 0.011), 3)));
    return params.rgb * (1.0 - 0.09 * line) * (0.97 + 0.05 * vnoise(metres * 300.0));
  }
  if (material > 6.5) {
    vec2 g = (params.a < 0.5 ? metres : metres.yx) + fract(params.a * 2.0) * 61.0;
    // Growth rings cut along the board: lines a few millimetres apart that wander and open into cathedrals.
    float wander = fbm(vec2(g.x * 1.4, g.y * 5.0)) * 11.0 + fbm(vec2(g.x * 0.5, g.y * 1.5) + 17.0) * 16.0;
    float ring = abs(fract(g.y * 70.0 + wander) - 0.5) * 2.0;
    float late = smoothstep(0.55, 0.95, ring);
    float streak = fbm(vec2(g.x * 2.5, g.y * 210.0));
    float pores = vnoise(vec2(g.x * 150.0, g.y * 1200.0));
    return params.rgb * (0.94 + 0.14 * streak - 0.09 * late) * (0.965 + 0.06 * pores);
  }
  vec2 square = floor(metres / params.x);
  float navy = 1.0 - mod(square.x + square.y, 2.0);
  float pile = 0.82 + 0.3 * vnoise(metres * 900.0) * vnoise(metres * 140.0 + 5.0) + 0.1 * fbm(metres * 22.0);
  return mix(vec3(0.6, 0.6, 0.63), vec3(0.012, 0.028, 0.1), navy) * pile;
}
`;
