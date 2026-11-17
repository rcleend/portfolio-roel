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
   * Stained softwood furniture (the dresser): `params.rgb` the stain; the fraction of `params.a` under 0.5 runs the
   * grain along the chart, from 0.5 up it, and seeds the board; its whole part is the chart's drawn joints (`joint`).
   */
  stained: 7,
  /** A sheet of printed paper: `params.rgb`, with faint lines of text across it. */
  paper: 8,
  /** The blind as one sheet with its slats drawn (`SLATS`): `params.rgb` a slat's enamel. */
  slats: 9,
} as const;

/**
 * A line of geometry thinner than a pixel breaks into dashes where the scene is drawn without multisampling, so the
 * tier that is built for that draws such lines into its charts instead (docs/ROOM.md › Detail by tier): each texel
 * takes the share of it the line covers, and the page's filter keeps the line whole at any distance.
 *
 * A stained chart's joints, two bits an edge in `params.a`'s whole part: none, the 3 mm gap round a drawer or a door,
 * or the 7 mm bead round a panel. The line lies a texel inside the edge, so the chart beside it, in the same plane,
 * need know nothing of it.
 */
export const JOINT = { gap: 1, bead: 2 } as const;
export const joints = (u0: number, v0: number, u1: number, v1: number): number => u0 + 4 * v0 + 16 * u1 + 64 * v1;

/**
 * The drawn blind's measures (shell.ts builds the sheet to them, and gen.test.ts holds them to the slats' own): a
 * slat's pitch at the sheet's left end, how much less it is at the right, where the cords draw the blind up, and how
 * far above the sheet's lower edge the lowest slat's middle is.
 */
export const SLATS = { pitch: 0.03616, closes: 0.00247, foot: 0.03, count: 20 } as const;

/**
 * `vec3 surface(float material, vec2 metres, vec2 st, vec4 params, out float cavity)`; needs `uArt`.
 *
 * The drawn lines (their comments are here: a shader's are shipped). `covered` is the share of a texel, given its
 * middle and its size, that the band from `a` to `b` covers; `grain` a texel's size in the chart's metres and `size`
 * the chart's. The slats: the sheet's u runs up it and its v from its right end; a slat's band is, from its foot, the
 * lip the desk lamp catches, the face, darker towards the slat above that shades it, and the gap under that slat; over
 * the top slat is the casing in the head rail's shade, and down the sheet the two ladder cords. The joints: `from` is
 * how far in from each edge a texel is (u = 0, v = 0, u = 1, v = 1) less the line's middle, which lies a texel in, or
 * half a texel clear of the edge where the line is the wider.
 */
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
  vec3 base = mix(vec3(0.36, 0.185, 0.11), vec3(0.6, 0.35, 0.205), tone);
  base = mix(base, vec3(0.46, 0.255, 0.15), hash2(id + ivec2(91, 7)) * 0.5);
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

float covered(float at, float wide, float a, float b) {
  return clamp((min(at + 0.5 * wide, b) - max(at - 0.5 * wide, a)) / wide, 0.0, 1.0);
}

vec3 surface(float material, vec2 metres, vec2 st, vec4 params, out float cavity) {
  cavity = 1.0;
  if (material < 0.5) return params.rgb;
  vec2 grain = abs(vec2(dFdx(metres.x), dFdy(metres.y)));
  vec2 size = grain / abs(vec2(dFdx(st.x), dFdy(st.y)));
  if (material > 8.5) {
    float pitch = ${SLATS.pitch} - ${SLATS.closes} * (1.0 - st.y);
    float up = metres.x - ${SLATS.foot} + 0.5 * pitch;
    float slat = floor(up / pitch);
    float y = up - slat * pitch;
    float lip = covered(y, grain.x, 0.0, 0.007) + covered(y - pitch, grain.x, 0.0, 0.007);
    float gap = slat > ${SLATS.count - 0.5} ? 1.0 : covered(y, grain.x, pitch - 0.005, pitch) + covered(y + pitch, grain.x, pitch - 0.005, pitch);
    float face = (1.0 - 0.26 * smoothstep(0.35, 1.0, y / pitch)) * (0.97 + 0.06 * hash2(ivec2(int(slat), 5)));
    float cord = covered(abs(abs(metres.y - 0.795) - 0.57), grain.y, -0.0011, 0.0011);
    vec3 tone = mix(mix(vec3(face), vec3(1.8, 1.4, 1.1), lip), vec3(0.3, 0.34, 0.44), gap);
    return params.rgb * tone * (1.0 - 0.2 * cord);
  }
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
    float joined = floor(params.a);
    float seed = params.a - joined;
    if (joined > 0.5) {
      vec4 kind = mod(floor(joined / vec4(1.0, 4.0, 16.0, 64.0)), 4.0);
      vec4 reach = 0.0015 + 0.002 * step(1.5, kind);
      vec4 wide = grain.xyxy;
      vec4 middle = max(wide, 0.5 * wide + reach);
      vec4 from = vec4(metres, size - metres) - middle;
      vec4 line = clamp((min(from + 0.5 * wide, reach) - max(from - 0.5 * wide, -reach)) / wide, 0.0, 1.0);
      line *= step(0.5, kind) * (0.9 - 0.35 * step(1.5, kind));
      cavity = 1.0 - max(max(line.x, line.y), max(line.z, line.w));
    }
    vec2 g = (seed < 0.5 ? metres : metres.yx) + fract(seed * 2.0) * 61.0;
    // Growth rings cut along the board: lines a few millimetres apart that wander and open into cathedrals.
    float wander = fbm(vec2(g.x * 1.4, g.y * 5.0)) * 11.0 + fbm(vec2(g.x * 0.5, g.y * 1.5) + 17.0) * 16.0;
    float ring = abs(fract(g.y * 70.0 + wander) - 0.5) * 2.0;
    float late = smoothstep(0.55, 0.95, ring);
    float streak = fbm(vec2(g.x * 2.5, g.y * 210.0));
    float pores = vnoise(vec2(g.x * 150.0, g.y * 1200.0));
    return params.rgb * (0.94 + 0.14 * streak - 0.09 * late) * (0.965 + 0.06 * pores);
  }
  // The rug: wool pile. A square's edge follows the knots, so it wanders a little; the pile is tufts (a knot each
  // 3.4 mm), rows of weft where a texel can hold them, slow patches where it has been trodden, and the strokes a brush
  // and a vacuum cleaner left across it, two ways. Dark wool shows its nap far more than pale wool does: where the
  // pile lies towards the eye it is near black, where it lies away it catches the room.
  float texel = max(fwidth(metres.x), fwidth(metres.y));
  vec2 knot = floor(metres / 0.0034);
  // A square's edge wanders a few millimetres along its length, and is a texel or two of mixed yarn across.
  vec2 wander = (vec2(fbm(metres * 9.0), fbm(metres * 9.0 + 31.0)) - 0.5) * 0.012;
  vec2 wave = sin((metres + wander) * 3.14159265 / params.x);
  vec2 hard = clamp(wave / (4.5 * texel / params.x), -1.0, 1.0);
  float navy = 0.5 + 0.5 * hard.x * hard.y;
  float tuft = hash2(ivec2(knot));
  float weft = 0.5 + 0.5 * sin(metres.y * 6.2832 / 0.0068);
  float rows = 1.0 - smoothstep(0.0022, 0.0034, texel);
  float trodden = fbm(metres * 19.0);
  float stroke = fbm(vec2(metres.x * 2.6, metres.y * 21.0) + 40.0);
  vec2 slant = vec2(metres.x + metres.y, metres.y - metres.x) * 0.7071;
  float sweep = fbm(vec2(slant.x * 3.4, slant.y * 26.0) + 80.0);
  float clump = vnoise(metres * 150.0);
  float nap = 0.3 * (trodden - 0.5) * (1.0 + 1.5 * navy)
    + (0.14 * (stroke - 0.5) + 0.12 * (sweep - 0.5)) * (1.0 + 3.0 * navy);
  float pile = 0.87 + (0.12 * tuft + 0.07 * (clump - 0.5)) * (1.0 + 1.5 * navy)
    + 0.06 * rows * (weft - 0.5) * (1.0 + 2.0 * navy) + nap;
  vec3 yarn = mix(vec3(0.4, 0.37, 0.315) * (0.97 + 0.06 * hash2(ivec2(knot) + ivec2(7, 3))), vec3(0.03, 0.045, 0.092), navy);
  return yarn * max(pile, 0.3);
}
`;
