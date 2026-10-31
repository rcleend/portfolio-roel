import { type IUniform, Matrix3, type Texture, Vector3, Vector4 } from 'three';
import type { UvRect } from './screenMapping';

/**
 * The TV's picture as the area light it is (docs/ROOM.md › The TV's light): a Lambertian rectangle in the picture's own
 * colours, recessed behind the bezel's opening. The room's finish lights its baked surfaces (RoomGloss) and its haze
 * (RoomAtmosphere) with it, reading the picture texture's mip chain on the GPU: no readback, and the light follows
 * every game frame, as a phosphor's millisecond afterglow does.
 */
export interface ScreenLightUniforms {
  [name: string]: IUniform;
  /** The game picture, with mipmaps: its 1 × 1 level is the mean colour, finer levels the colour nearby. */
  uScreenPicture: IUniform<Texture | null>;
  /** World → picture frame: columns right, up and the normal towards the room. */
  uScreenBasis: IUniform<Matrix3>;
  /** The picture's centre on the plane it emits from. */
  uScreenCentre: IUniform<Vector3>;
  /** Half extents in metres: the picture (xy) and the bezel's opening (zw), which is centred on it. */
  uScreenSize: IUniform<Vector4>;
  /** x: the opening's distance in front of the picture (m); y: the LOD of a 1 m footprint; z: the tube's output. */
  uScreenOptics: IUniform<Vector3>;
}

/**
 * Half of a Lambertian surface's light from a large emitter comes from within about this many times its distance, so
 * the colour it receives is the picture blurred over that footprint: beside the glass the bezel takes the colour of
 * the picture's edge next to it, a metre away the floor takes the picture's mean.
 */
const FOOTPRINT = 2.5;

/** No picture and no output: what the finish draws until a set publishes its light. */
export function createScreenLightUniforms(): ScreenLightUniforms {
  return {
    uScreenPicture: { value: null },
    uScreenBasis: { value: new Matrix3() },
    uScreenCentre: { value: new Vector3() },
    uScreenSize: { value: new Vector4(1, 1, 1, 1) },
    uScreenOptics: { value: new Vector3() },
  };
}

/**
 * The light of a TV facing `facing` whose picture lies along `outline` on its curved glass (pictureOutline): the
 * outline's extent is the picture's, and its median depth the plane the light leaves from (the edges' crossings
 * outnumber the four deeper corners; the edges are what the bezel's lip beside them sees). The opening is the
 * bezel's aperture in the glass's UV square (`glass`, its bounds), at the front of the set (`front`, the largest
 * distance along `facing` its bounds reach). `texels`: the picture's native width.
 */
export function screenLight(
  outline: readonly Vector3[],
  facing: Vector3,
  glass: { readonly min: Vector3; readonly max: Vector3 },
  aperture: UvRect,
  front: number,
  texels: number,
  picture: Texture,
): ScreenLightUniforms {
  const normal = facing.clone().normalize();
  const up = new Vector3(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
  const right = new Vector3().crossVectors(up, normal);
  const along = (axis: Vector3) => outline.map((point) => point.dot(axis));
  const xs = along(right);
  const ys = along(up);
  const depths = along(normal).sort((a, b) => a - b);
  const depth = depths[depths.length >> 1] ?? 0;
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = new Vector3().subVectors(glass.max, glass.min);
  const uniforms = createScreenLightUniforms();
  uniforms.uScreenPicture.value = picture;
  uniforms.uScreenBasis.value.set(right.x, up.x, normal.x, right.y, up.y, normal.y, right.z, up.z, normal.z);
  uniforms.uScreenCentre.value
    .copy(right)
    .multiplyScalar((minX + maxX) / 2)
    .addScaledVector(up, (minY + maxY) / 2)
    .addScaledVector(normal, depth);
  uniforms.uScreenSize.value.set(
    (maxX - minX) / 2,
    (maxY - minY) / 2,
    ((aperture.maxU - aperture.minU) * Math.abs(span.dot(right))) / 2,
    ((aperture.maxV - aperture.minV) * Math.abs(span.dot(up))) / 2,
  );
  uniforms.uScreenOptics.value.set(Math.max(0, front - depth), Math.log2((FOOTPRINT * texels) / (maxX - minX)), 0);
  return uniforms;
}

/**
 * GLSL. `screenLight(position, normal, view, albedo, gloss)`: the radiance a surface sends back of the picture's light.
 * Diffuse, the form factor of the part of the picture the bezel lets it see (Lambert's polygon formula, with Heitz and
 * Hill's clipped-sphere horizon); specular, where its mirror ray meets the picture, blurred by a satin lobe.
 * `screenAir(eye, ray, reach)`: single scattering in the air in front of the picture, up to the first surface.
 * `uScreenGain` is the finish's: zero leaves the bake as it was baked.
 */
export const SCREEN_LIGHT = /* glsl */ `
uniform sampler2D uScreenPicture;
uniform mat3 uScreenBasis;
uniform vec3 uScreenCentre;
uniform vec4 uScreenSize;
uniform vec3 uScreenOptics;
uniform float uScreenGain;

// One edge's term of the vector form factor, with a rational fit to theta / sin(theta) / 2pi (three's LTC edge).
vec3 screenEdge(vec3 a, vec3 b) {
  float x = dot(a, b);
  float y = abs(x);
  float v = (0.8543985 + (0.4965155 + 0.0145206 * y) * y) / (3.417594 + (4.1616724 + y) * y);
  return cross(a, b) * (x > 0.0 ? v : 0.5 * inversesqrt(max(1.0 - x * x, 1e-7)) - v);
}

// The picture's colour around a point on it (picture frame, metres), blurred over a footprint as wide as reach.
vec3 screenColour(vec2 at, float reach) {
  vec2 uv = vec2(0.5) + vec2(at.x, -at.y) / (2.0 * uScreenSize.xy);
  return textureLod(uScreenPicture, uv, max(0.0, uScreenOptics.y + log2(max(reach, 1e-3)))).rgb;
}

vec3 screenLight(vec3 position, vec3 normal, vec3 view, vec3 albedo, float gloss) {
  vec3 q = (position - uScreenCentre) * uScreenBasis;
  vec3 n = normal * uScreenBasis;
  // One-sided; nothing for a surface whose horizon hides the whole picture (the flat front of the set around it), which
  // no mirror ray of it can reach either; fading out of reach across the room, where it is a fraction of an 8-bit step.
  float power = uScreenOptics.z * uScreenGain * smoothstep(3.5, 2.5, q.z);
  if (power <= 0.0 || q.z <= 0.0 || dot(abs(n.xy), uScreenSize.xy) <= dot(q, n)) return vec3(0.0);
  // Beside the set, the recess hides part of the picture: project the bezel's opening onto the picture's plane.
  vec2 lo = -uScreenSize.xy;
  vec2 hi = uScreenSize.xy;
  if (q.z > uScreenOptics.x) {
    float k = q.z / (q.z - uScreenOptics.x);
    lo = max(lo, q.xy - (uScreenSize.zw + q.xy) * k);
    hi = min(hi, q.xy + (uScreenSize.zw - q.xy) * k);
  }
  if (hi.x <= lo.x || hi.y <= lo.y) return vec3(0.0);
  vec3 a = normalize(vec3(lo, 0.0) - q);
  vec3 b = normalize(vec3(lo.x, hi.y, 0.0) - q);
  vec3 c = normalize(vec3(hi, 0.0) - q);
  vec3 d = normalize(vec3(hi.x, lo.y, 0.0) - q);
  vec3 f = screenEdge(a, b) + screenEdge(b, c) + screenEdge(c, d) + screenEdge(d, a);
  float l = length(f);
  vec3 light = albedo * screenColour(clamp(q.xy, lo, hi), q.z) * max((l * l + dot(f, n)) / (l + 1.0), 0.0);
  vec3 mirror = reflect(-view, normal) * uScreenBasis;
  if (gloss > 0.0 && mirror.z < 0.0) {
    float travel = -q.z / mirror.z;
    vec2 hit = q.xy + mirror.xy * travel;
    vec2 seen = clamp(hit, lo, hi);
    // A satin lobe about 25 degrees wide: its footprint on the picture, and how much of it the picture fills.
    float spread = 0.004 + 0.47 * travel;
    float miss = length(hit - seen) / spread;
    float covered = min(1.0, (hi.x - lo.x) * (hi.y - lo.y) / (3.14159 * spread * spread));
    float fresnel = 0.04 + 0.96 * pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 5.0);
    light += screenColour(seen, spread) * gloss * fresnel * covered * exp(-miss * miss);
  }
  return light * power;
}

// Haze lit by the picture: a Lambertian point set back behind the glass (keeping the near field soft), its
// cos / r^2 intensity integrated in closed form along the view ray. The lit air is the cone within 1.2 m in front of
// the glass, seen from 2 m away or more: across the room it hangs in front of the set, while from the TV view (at most
// 1.75 m back) the air between the eye and the set is too thin to see, so it never veils the set or the picture.
vec3 screenAir(vec3 eye, vec3 ray, float reach) {
  vec3 q = (eye - uScreenCentre) * uScreenBasis;
  vec3 d = ray * uScreenBasis;
  vec2 span = (vec2(0.0, 1.2) - q.z) / (abs(d.z) < 1e-5 ? 1e-5 : d.z);
  vec2 s = vec2(max(2.0, min(span.x, span.y)), min(reach, max(span.x, span.y)));
  if (s.y <= s.x) return vec3(0.0);
  vec3 w = q + vec3(0.0, 0.0, 0.25);
  float b = dot(w, d);
  float h2 = max(dot(w, w) - b * b, 1e-4);
  s += b;
  vec2 root = sqrt(s * s + h2);
  vec2 integral = (w.z - d.z * b) * s / (h2 * root) - d.z / root;
  return screenColour(vec2(0.0), 8.0) * (integral.y - integral.x) * uScreenOptics.z * uScreenGain;
}
`;
