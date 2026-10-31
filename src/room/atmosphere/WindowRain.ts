/** Water lenses on the actual glass plane. The existing exterior texture supplies refraction at every camera angle. */
export const WINDOW_RAIN = /* glsl */ `
uniform float uRainTime;
uniform float uLightning;
uniform sampler2D uExterior;

float rainHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.x + q.y) * q.z);
}

// Rounded, asymmetric water lenses: xy is surface normal, z coverage and w the meniscus.
vec4 beadLens(vec2 p, vec2 radius) {
  vec2 q = p / radius;
  q.x *= 1.0 + q.y * 0.12;
  float r = length(q);
  float aa = max(fwidth(r), 0.045);
  float cover = 1.0 - smoothstep(0.90 - aa, 1.0 + aa, r);
  float rim = smoothstep(0.62, 0.94, r) * cover;
  return vec4(q * cover, cover, rim);
}

vec4 stillBeads(vec2 p, float scale) {
  p *= scale;
  vec2 id = floor(p);
  float seed = rainHash(id);
  vec2 offset = vec2(seed, rainHash(id + 7.1));
  vec2 local = fract(p) - 0.24 - offset * 0.52;
  float size = mix(0.055, 0.22, seed * seed);
  // Empty cells, clustered sizes and jitter prevent a dotted grid. Larger beads have a slightly heavier lower edge.
  return beadLens(local, vec2(size, size * (1.0 + seed * 0.5))) * step(0.26, rainHash(id + 23.8));
}

vec4 runningDrops(vec2 p, float scale, float offset) {
  vec2 cellSize = vec2(0.145, 0.48) / scale;
  float column = floor(p.x / cellSize.x);
  float seed = rainHash(vec2(column, offset));
  float clock = uRainTime * (0.14 + seed * 0.12) + seed * 17.0;
  // Pauses and little accelerations, instead of a sheet of uniformly scrolling lines.
  float travel = clock + sin(clock * 2.2 + seed * 6.0) * 0.22;
  p.y += travel / scale;
  vec2 id = floor(p / cellSize);
  float random = rainHash(id + offset);
  vec2 local = (fract(p / cellSize) - 0.5) * cellSize;
  float bend = (sin(p.y * 25.0 + seed * 19.0) + sin(p.y * 61.0 + seed * 7.0) * 0.3) * 0.003 / scale;
  local.x -= (random - 0.5) * cellSize.x * 0.55 + bend;
  vec2 radius = vec2(0.008, 0.012) / scale * (0.8 + random * 0.7);
  vec4 head = beadLens(local, radius);
  float length = (0.09 + random * 0.13) / scale;
  float tail = smoothstep(0.004, 0.022, local.y) * (1.0 - smoothstep(length * 0.35, length, local.y));
  float width = (0.0012 + 0.0018 * tail) / scale;
  float trail = (1.0 - smoothstep(width, width + fwidth(local.x), abs(local.x))) * tail;
  // The thread behind a drop is a narrow cylindrical lens, tapering into scattered residual beads.
  vec2 normal = vec2(clamp(local.x / width, -1.0, 1.0), 0.0) * trail * 0.5;
  return head + vec4(normal, trail * 0.38, trail * 0.2);
}

vec3 wetWindow(vec3 original, vec3 eye, vec3 ray, float reach) {
  if (ray.z >= -0.001) return original;
  float distance = (-2.43 - eye.z) / ray.z;
  if (distance <= 0.0 || distance >= reach - 0.015) return original;
  vec3 hit = eye + ray * distance;
  if (hit.x < -2.10 || hit.x > -0.50 || hit.y < 1.13 || hit.y > 2.50) return original;
  vec2 p = hit.xy;
  vec4 water = runningDrops(p, 1.0, 5.7) + runningDrops(p + vec2(0.31, 0.17), 1.65, 19.3) * 0.6;
  vec4 beads = stillBeads(p + vec2(9.1, 3.7), 29.0) + stillBeads(p + 21.7, 57.0) * 0.4;
  // Running drops sweep the finest condensation away along their wet trail.
  water += beads * (1.0 - clamp(water.z, 0.0, 0.85));
  float coverage = clamp(water.z, 0.0, 1.0);
  vec2 normal = water.xy;
  float backdropDistance = (-4.5 - eye.z) / ray.z;
  vec2 backdrop = (eye + ray * backdropDistance).xy;
  vec2 uv = (backdrop - vec2(-3.7, 0.1)) / vec2(4.8, 3.6);
  uv.y = 1.0 - uv.y;
  vec2 warped = uv + normal * vec2(0.038, -0.05);
  // Reuse the already-loaded tree plate's mip chain. Fine moisture softens the view; the beads focus it again.
  // Sampling the exterior directly cannot ever pull a frame, blind or screen into a droplet during camera flights.
  vec3 softened = textureLod(uExterior, uv, 3.2).rgb;
  vec3 focused = textureLod(uExterior, warped, 1.0).rgb;
  vec3 color = mix(softened, focused, coverage * 0.92);
  vec3 n = normalize(vec3(normal * 0.95, 1.0));
  vec3 view = -ray;
  vec3 lamp = normalize(vec3(-2.05, 1.0, -1.65) - hit);
  vec3 moon = normalize(vec3(-0.3, 1.2, 1.0));
  float warmGlint = pow(max(dot(n, normalize(lamp + view)), 0.0), 48.0);
  float coolGlint = pow(max(dot(n, normalize(moon + view)), 0.0), 72.0);
  // A dark lower rim and small reflected highlights give each clear bead volume, rather than opaque white dots.
  color *= 1.0 - clamp(water.w * 0.32, 0.0, 0.28);
  color += (vec3(1.0, 0.55, 0.30) * warmGlint * 0.16 + vec3(0.57, 0.68, 0.88) * coolGlint * 0.22) * coverage;
  color += vec3(0.035, 0.045, 0.065) * coverage * max(0.0, -normal.y);
  // Distant lightning lights the exterior and its reflections, never the screen or a full-screen overlay.
  color += vec3(0.48, 0.59, 0.82) * uLightning * (0.9 + coverage * 0.4 + color * 0.9);
  return color;
}
`;

/** An uneven double flicker every 45–91 seconds, with a gentler first storm after 12–35 seconds. */
export function lightningAt(time: number): number {
  const cycle = Math.floor(time / 68);
  const random = Math.sin(cycle * 127.1 + 37.8) * 43758.5453;
  const delay = 12 + (random - Math.floor(random)) * 23;
  const t = time - cycle * 68 - delay;
  return Math.exp(-((t / 0.18) ** 2)) * 0.28 + Math.exp(-(((t - 0.46) / 0.34) ** 2)) * 0.72;
}
