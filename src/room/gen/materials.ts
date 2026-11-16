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
  /** Oak boards, 0.29 m wide, staggered, each its own tone and grain. */
  oak: 3,
  /** A print from the art page: `params` is its rectangle there. */
  print: 4,
} as const;

/** `vec3 surface(float material, vec2 metres, vec2 st, vec4 params, out float cavity)`; needs `uArt`. */
export const SURFACE_GLSL = /* glsl */ `
${HASH_GLSL}
uniform sampler2D uArt;

vec4 oakBoards(vec2 p) {
  const float W = 0.29;
  float row = floor(p.y / W);
  float len = mix(1.3, 2.6, hash2(ivec2(int(row), 37)));
  float shifted = p.x + hash2(ivec2(int(row), 11)) * 5.0;
  float col = floor(shifted / len);
  ivec2 id = ivec2(int(col), int(row));
  vec2 f = vec2(shifted - col * len, p.y - row * W);
  float tone = hash2(id);
  vec3 base = mix(vec3(0.2, 0.115, 0.1), vec3(0.44, 0.3, 0.27), tone * tone);
  base = mix(base, vec3(0.3, 0.17, 0.135), hash2(id + ivec2(91, 7)) * 0.5);
  // Long grain: streaks stretched 40:1 along the board, bent by a slow warp; latewood lines; fine pores.
  vec2 g = vec2(p.x * 0.9 + hash2(id + ivec2(2, 0)) * 20.0, p.y * 38.0 + tone * 50.0);
  g.y += fbm(vec2(p.x * 1.3, p.y * 2.0) + vec2(id)) * 5.0;
  float streak = fbm(g);
  float rings = smoothstep(0.35, 0.65, fract(g.y * 0.35 + streak * 2.2));
  float pores = vnoise(vec2(p.x * 160.0, p.y * 900.0));
  base *= 0.78 + 0.34 * streak;
  base *= 1.0 - 0.13 * rings;
  base *= 0.94 + 0.09 * pores;
  // The seam between boards: a bevel a few millimetres wide that falls into shadow.
  float edge = min(min(f.x, len - f.x), min(f.y, W - f.y));
  return vec4(base, smoothstep(0.0005, 0.006, edge));
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
    cavity = mix(0.76, 1.0, groove);
    return params.rgb * (0.93 + 0.05 * stipple + 0.12 * slow) * (1.0 + 0.05 * smoothstep(0.022, 0.05, board) * (1.0 - smoothstep(0.05, 0.12, board)));
  }
  if (material < 3.5) {
    vec4 wood = oakBoards(metres);
    cavity = mix(0.3, 1.0, wood.a);
    return wood.rgb;
  }
  // The art page's rows run downwards; a print's own t runs up.
  vec2 at = clamp(st, 0.0, 1.0);
  vec4 ink = texture(uArt, params.xy + vec2(at.x, 1.0 - at.y) * params.zw);
  return ink.rgb;
}
`;
