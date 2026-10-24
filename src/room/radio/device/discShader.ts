import { DISC_RADIUS } from '../discLayout';

/**
 * The compact disc's one shader program (docs/ROOM.md › The CD player). No three.js lights: the room's light is
 * baked, so the disc carries the three sources that matter by name — the lilac ambient, the lava lamp beside it and
 * the moonlight from the window — tuned against the baked cabinet and wall next to the radio.
 *
 * - Label face: the print over silver foil (ink alpha 0 shows bare foil), lit, with a varnish highlight from the
 *   lamp that travels as the disc drifts and brightens under attention; at play speed a still spoke of the lamp
 *   across the varnish says it spins.
 * - Foil (bare print, mirror band, rim): silver with thin-film iridescence weighted by the lamp's highlight.
 * - Data face: a silver mirror that brightens towards grazing, with the lamp's spoke and the room's sheen across its
 *   tracks and diffraction from the lamp and the moon off a 1.6 µm track pitch (the rainbow spoke stays fixed in
 *   space while the disc turns), softly shouldered so a disc near the lamp never burns out; a polished rim catches
 *   the room and the lamp, so overlapping discs keep their outlines.
 * - Spin blur: 6 taps along the arc swept in 1/60 s, blended to the label's radial average from 0.8 to 2 rev/s,
 *   so a disc at play speed is the same image every frame and costs no frames of its own.
 *
 * `mediump`-safe; the JS mirrors of `spectral` and `grating` below are what the tests check.
 */

/** Zones by radius (m), centre out: clamping hub, mirror band, label, rim. */
export const DISC_ZONES = { hub: 0.0215, mirror: 0.023, label: 0.0585, rim: DISC_RADIUS, stackingRing: 0.017 } as const;
/** Rows of the radial-average texture (one per disc, up to twelve). */
export const AVERAGE_ROWS = 16;
/** Radial bins of a label's average. */
export const AVERAGE_BINS = 64;
/** Track pitch of a compact disc (nm). */
export const TRACK_PITCH_NM = 1600;
/** Spin blur fades into the radial average between these speeds (rad/s). */
export const BLUR_FROM = 2 * Math.PI * 0.8;
export const BLUR_TO = 2 * Math.PI * 2;

/** Light the disc shows, *tunable* ±30 % (recorded here): lilac ambient, the lava lamp, the window's moonlight. */
export const DISC_LIGHT = {
  ambient: [0.16 * 0.6, 0.14 * 0.6, 0.22 * 0.6],
  lampPosition: [0.49, 1.2, -1.97],
  lampColor: [1.0 * 1.6, 0.42 * 1.6, 0.12 * 1.6],
  lampFalloff: 0.3,
  moonDirection: normalize([-0.96, 0.24, -0.16]),
  moonColor: [0.3 * 0.35, 0.38 * 0.35, 0.62 * 0.35],
  /** The room in the foil's mirror, below and above the horizon (the ambient's lilac, darker and lighter). */
  roomLow: [0.16 * 0.15, 0.14 * 0.15, 0.22 * 0.15],
  roomHigh: [0.16 * 0.9, 0.14 * 0.9, 0.22 * 0.9],
  /** The lamp's spoke across the foil's tracks, and their rainbow; the room's broad sheen on the tracks. */
  spoke: 14,
  rainbow: 1.8,
  roomSheen: 0.9,
  /** Smooth mirror (the band by the hub, the foil past the programme) against the tracks' haze. */
  smoothMirror: 1.35,
  /** How far the lamp wraps round matte ink, and the ink's gain under the night's dim light. */
  inkWrap: 0.5,
  inkGain: 2.2,
  /** The varnish over the ink reflects the room faintly, and the lamp broadly (it travels as the disc drifts). */
  varnishSheen: 0.12,
  varnishBroad: 0.35,
  /** The smoky hub under the room's light. */
  hubGain: 4,
  /**
   * The data side: a mirror that brightens towards grazing (Fresnel), the lamp's spoke and the room's broad sheen
   * across its tracks, so every disc shows its own lit structure rather than a flat grey; and a polished rim that
   * catches the room and the lamp, so overlapping discs keep their outlines.
   */
  dataFresnel: 2.2,
  dataSpoke: 9,
  dataSheen: 1.6,
  rimRoom: 1.1,
  rimLamp: 0.45,
  /** A label at play speed keeps a still spoke from the lamp across its varnish: the sign that it spins. */
  spinSpoke: 2.4,
} as const;

function normalize(v: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
}

const vec3 = (v: readonly number[]): string => `vec3(${v.map((x) => x.toFixed(6)).join(', ')})`;

export const DISC_VERTEX = /* glsl */ `
attribute float face;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vCentre;
varying vec3 vAxisX;
varying float vFace;
void main() {
  vUv = uv;
  vFace = face;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vCentre = modelMatrix[3].xyz;
  vAxisX = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/** Uniforms, varyings and the lighting and zone constants. */
const FRAGMENT_HEADER = /* glsl */ `
uniform sampler2D uLabel;
uniform sampler2D uAverages;
uniform float uRow;
uniform float uOmega;
uniform float uAttention;
uniform float uFlipLabel;
uniform float uPrint;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vCentre;
varying vec3 vAxisX;
varying float vFace;

const vec3 AMBIENT = ${vec3(DISC_LIGHT.ambient)};
const vec3 LAMP_POSITION = ${vec3(DISC_LIGHT.lampPosition)};
const vec3 LAMP_COLOR = ${vec3(DISC_LIGHT.lampColor)};
const float LAMP_FALLOFF = ${DISC_LIGHT.lampFalloff.toFixed(4)};
const vec3 MOON_DIRECTION = ${vec3(DISC_LIGHT.moonDirection)};
const vec3 MOON_COLOR = ${vec3(DISC_LIGHT.moonColor)};
const vec3 HUB = vec3(0.0242, 0.0262, 0.0331);
const float SILVER = 0.62;
const vec3 ROOM_LOW = ${vec3(DISC_LIGHT.roomLow)};
const vec3 ROOM_HIGH = ${vec3(DISC_LIGHT.roomHigh)};
const float SPOKE = ${DISC_LIGHT.spoke.toFixed(4)};
const float SMOOTH_MIRROR = ${DISC_LIGHT.smoothMirror.toFixed(4)};
const float ROOM_SHEEN = ${DISC_LIGHT.roomSheen.toFixed(4)};
const float RAINBOW = ${DISC_LIGHT.rainbow.toFixed(4)};
const float INK_WRAP = ${DISC_LIGHT.inkWrap.toFixed(4)};
const float INK_GAIN = ${DISC_LIGHT.inkGain.toFixed(4)};
const float VARNISH_SHEEN = ${DISC_LIGHT.varnishSheen.toFixed(4)};
const float VARNISH_BROAD = ${DISC_LIGHT.varnishBroad.toFixed(4)};
const float DATA_FRESNEL = ${DISC_LIGHT.dataFresnel.toFixed(4)};
const float DATA_SPOKE = ${DISC_LIGHT.dataSpoke.toFixed(4)};
const float DATA_SHEEN = ${DISC_LIGHT.dataSheen.toFixed(4)};
const float RIM_ROOM = ${DISC_LIGHT.rimRoom.toFixed(4)};
const float RIM_LAMP = ${DISC_LIGHT.rimLamp.toFixed(4)};
const float SPIN_SPOKE = ${DISC_LIGHT.spinSpoke.toFixed(4)};
const float HUB_GAIN = ${DISC_LIGHT.hubGain.toFixed(4)};
const float STACKING_RING = ${(DISC_ZONES.stackingRing / DISC_RADIUS).toFixed(5)};
const float ZONE_HUB = ${(DISC_ZONES.hub / DISC_RADIUS).toFixed(5)};
const float ZONE_MIRROR = ${(DISC_ZONES.mirror / DISC_RADIUS).toFixed(5)};
const float ZONE_LABEL = ${(DISC_ZONES.label / DISC_RADIUS).toFixed(5)};
const float BLUR_FROM = ${BLUR_FROM.toFixed(5)};
const float BLUR_TO = ${BLUR_TO.toFixed(5)};

`;

/** The visible spectrum (nm) as RGB, 0 outside 400–700 nm (after Zucconi's six-bump fit). */
const SPECTRAL = /* glsl */ `
vec3 bump3(vec3 x, vec3 offset) {
  return clamp(1.0 - x * x - offset, 0.0, 1.0);
}

vec3 spectral(float nm) {
  if (nm < 400.0 || nm > 700.0) return vec3(0.0);
  float x = (nm - 400.0) / 300.0;
  vec3 a = bump3(vec3(3.54585104, 2.93225262, 2.41593945) * (x - vec3(0.69549072, 0.49228336, 0.27699880)),
    vec3(0.02312639, 0.15225084, 0.52607955));
  vec3 b = bump3(vec3(3.90307140, 3.21182957, 3.96587128) * (x - vec3(0.11748627, 0.86755042, 0.66077860)),
    vec3(0.84897130, 0.88445281, 0.73949448));
  return a + b;
}

`;

/**
 * Diffraction off the tracks (radial direction r) in the first two orders, or three (where the lamp grazes the label
 * side's foil only the third lands in the visible), confined to the lobe where the half vector lies in the plane of
 * the normal and r.
 */
const GRATING = /* glsl */ `
vec3 grating(vec3 n, vec3 r, vec3 v, vec3 l, float orders) {
  vec3 h = normalize(v + l);
  float across = dot(h, cross(n, r)) / 0.08;
  float lobe = exp(-across * across);
  float u = abs(dot(r, v + l)) * ${TRACK_PITCH_NM.toFixed(1)};
  return (spectral(u) + spectral(u * 0.5) + step(2.5, orders) * spectral(u / 3.0)) * lobe;
}

`;

/**
 * Light: plain diffuse; matte ink, which scatters a little past the terminator (the lamp wraps round, so the print
 * warms towards it); and the dark room in a mirror (lilac walls, lighter towards the ceiling, the lamp's glow on the
 * wall around it).
 */
const LIGHT = /* glsl */ `
vec3 diffuse(vec3 n, vec3 toLamp, float lampFall) {
  return AMBIENT + LAMP_COLOR * lampFall * max(dot(n, toLamp), 0.0) + MOON_COLOR * max(dot(n, MOON_DIRECTION), 0.0);
}

vec3 inkLight(vec3 n, vec3 toLamp, float lampFall) {
  float wrap = max((dot(n, toLamp) + INK_WRAP) / (1.0 + INK_WRAP), 0.0);
  return AMBIENT + LAMP_COLOR * lampFall * wrap + MOON_COLOR * max(dot(n, MOON_DIRECTION), 0.0);
}

vec3 room(vec3 dir, vec3 toLamp, float lampFall) {
  float towardsLamp = max(dot(dir, toLamp), 0.0);
  return mix(ROOM_LOW, ROOM_HIGH, smoothstep(-0.2, 0.8, dir.y)) + LAMP_COLOR * lampFall * 0.5 * towardsLamp * towardsLamp;
}

`;

/**
 * Circular tracks scatter light along the radius and hardly across it (an anisotropic lobe after Ward): the highlight
 * is a spoke through the centre that points at the light, and it stays put while the disc turns. Then the label at a
 * disc-local uv, premultiplied (rgb × a, a).
 */
const TRACKS_AND_LABEL = /* glsl */ `
float tracks(vec3 n, vec3 r, vec3 h, float across, float along) {
  float hn = max(dot(h, n), 0.05);
  float ht = dot(h, cross(n, r)) / across;
  float hr = dot(h, r) / along;
  return exp(-(ht * ht + hr * hr) / (hn * hn));
}

vec4 label(vec2 uv) {
  vec4 ink = texture2D(uLabel, vec2(uv.x, mix(uv.y, 1.0 - uv.y, uFlipLabel)));
  // uPrint fades a print in over bare foil when it arrives after the disc is out.
  float a = ink.a * uPrint;
  return vec4(ink.rgb * a, a);
}

`;

/**
 * Per fragment, by face and zone:
 * - bare silver (`mirror`) reflects the dark room and the lamp's glint and, as thin film, a hue that shifts with the
 *   angle; where there are tracks (out to where the programme ends, a different radius on every disc) the lamp also
 *   draws its spoke across them and the tracks diffract it into a rainbow along it (`foil`); the smooth mirror (the
 *   band by the hub, the foil past the programme) is a little brighter than the tracks' haze, which also catches a
 *   broad, dim sheen from the room's upper half;
 * - the data face: silver and the rainbow spoke of the tracks;
 * - the label: the print over the foil, blurred along its spin and settling into its radial average at speed, lit as
 *   matte ink under a varnish that catches the lamp (more under attention) and faintly the room;
 * - the clamping hub: smoky polycarbonate, drawn opaque, with its moulded stacking ring, a sharp highlight and a
 *   little of the room on its surface;
 * - the mirror band (smooth: the room and the glints only), the rim and the edges.
 */
const FRAGMENT_MAIN = /* glsl */ `
void main() {
  vec2 local = (vUv - 0.5) * 2.0;
  float radius = length(local);
  vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 toLamp = LAMP_POSITION - vWorld;
  float lampDistance = length(toLamp) / LAMP_FALLOFF;
  toLamp = normalize(toLamp);
  float lampFall = 1.0 / (1.0 + lampDistance * lampDistance);
  vec3 lampLight = LAMP_COLOR * lampFall;
  vec3 radial = vWorld - vCentre;
  radial = length(radial) > 1e-5 ? normalize(radial - n * dot(radial, n)) : vAxisX;
  vec3 hLamp = normalize(v + toLamp);
  vec3 hMoon = normalize(v + MOON_DIRECTION);
  float lampLobe = pow(max(dot(n, hLamp), 0.0), 60.0) * lampFall;
  float moonLobe = pow(max(dot(n, hMoon), 0.0), 40.0);
  vec3 glints = LAMP_COLOR * lampLobe + MOON_COLOR * moonLobe * 3.0;
  vec3 env = room(reflect(-v, n), toLamp, lampFall);

  float film = fract(1.4 * (1.0 - max(dot(n, v), 0.0)) + 0.2 * dot(hLamp, radial));
  vec3 mirror = SILVER * env + SILVER * glints * (0.6 + 0.8 * spectral(450.0 + 250.0 * film));
  float programme = ZONE_MIRROR + (ZONE_LABEL - ZONE_MIRROR) * (0.62 + 0.36 * fract(uRow * 0.618 + 0.21));
  float tracked = step(ZONE_MIRROR + 0.008, radius) * (1.0 - smoothstep(programme - 0.004, programme + 0.004, radius));
  vec3 hUp = normalize(v + vec3(0.0, 1.0, 0.0));
  vec3 foil = mirror * mix(SMOOTH_MIRROR, 1.0, tracked) + tracked * (lampLight
    * (SILVER * SPOKE * tracks(n, radial, hLamp, 0.10, 0.55) + RAINBOW * grating(n, radial, v, toLamp, 3.0))
    + ROOM_HIGH * SILVER * ROOM_SHEEN * tracks(n, radial, hUp, 0.3, 0.9));

  float facing = max(dot(n, v), 0.0);
  // The rim catches the light where its edge faces it: the lamp's side, and the ceiling's (its top).
  float rim = smoothstep(0.962, 0.992, radius);
  vec3 lampInPlane = toLamp - n * dot(toLamp, n);
  vec3 upInPlane = vec3(0.0, 1.0, 0.0) - n * n.y;
  float lampSide = length(lampInPlane) > 1e-4 ? max(dot(radial, normalize(lampInPlane)), 0.0) : 0.0;
  float topSide = length(upInPlane) > 1e-4 ? 0.5 + 0.5 * dot(radial, normalize(upInPlane)) : 0.5;
  vec3 rimLight = ROOM_HIGH * RIM_ROOM * (0.35 + 0.65 * topSide) + LAMP_COLOR * lampFall * RIM_LAMP * lampSide * lampSide;
  vec3 colour;
  if (vFace < -0.5) {
    if (radius < ZONE_HUB) colour = HUB * diffuse(n, toLamp, lampFall) * 3.0 + glints * 0.5;
    else {
      float fresnel = pow(1.0 - facing, 3.0);
      colour = mirror * (1.0 + DATA_FRESNEL * fresnel)
        + lampLight * SILVER * DATA_SPOKE * tracks(n, radial, hLamp, 0.10, 0.55)
        + ROOM_HIGH * SILVER * DATA_SHEEN * tracks(n, radial, hUp, 0.3, 0.9)
        + grating(n, radial, v, toLamp, 2.0) * lampLight * 2.5
        + grating(n, radial, v, MOON_DIRECTION, 2.0) * MOON_COLOR * 1.5;
      colour = mix(colour, colour + rimLight, rim);
      // A soft shoulder: right by the lamp the turning mirror flashes, but stays a disc, never a white blank.
      colour = 1.2 * (1.0 - exp(-colour / 1.2));
    }
  } else if (vFace > -0.5 && vFace < 0.5 && radius > 0.9) {
    // The outer edge: a polished band of polycarbonate, lit by the room and the lamp.
    colour = rimLight * 1.4 + glints * 0.6;
  } else if (vFace > 0.5 && radius >= ZONE_MIRROR && radius < ZONE_LABEL) {
    float speed = abs(uOmega);
    vec4 print;
    if (speed < 0.01) {
      print = label(vUv);
    } else {
      float sweep = uOmega / 60.0;
      float angle = atan(local.y, local.x);
      print = vec4(0.0);
      for (int k = 0; k < 6; k++) {
        float a = angle + sweep * float(k) / 5.0;
        print += label(0.5 + 0.5 * radius * vec2(cos(a), sin(a)));
      }
      print /= 6.0;
      vec4 average = texture2D(uAverages, vec2(radius, uRow)) * uPrint;
      print = mix(print, average, smoothstep(BLUR_FROM, BLUR_TO, speed));
    }
    vec3 lit = print.rgb * inkLight(n, toLamp, lampFall) * INK_GAIN;
    float hl = max(dot(n, hLamp), 0.0);
    float varnish = pow(hl, 140.0) * lampFall * (0.35 + 0.65 * uAttention) + pow(hl, 16.0) * lampFall * VARNISH_BROAD;
    // At play speed the varnish's circular scratches draw the lamp as a spoke that stays put while the disc turns.
    float spinning = smoothstep(BLUR_FROM, BLUR_TO, abs(uOmega));
    vec3 spoke = lampLight * SPIN_SPOKE * spinning * tracks(n, radial, hLamp, 0.08, 0.6);
    colour = foil * (1.0 - print.a) + lit + (LAMP_COLOR * varnish + env * VARNISH_SHEEN + spoke) * print.a;
  } else if (radius < ZONE_HUB) {
    float ring = 1.0 - smoothstep(0.006, 0.012, abs(radius - STACKING_RING));
    colour = HUB * diffuse(n, toLamp, lampFall) * (HUB_GAIN + 2.0 * ring) + env * 0.08
      + LAMP_COLOR * pow(max(dot(n, hLamp), 0.0), 200.0) * lampFall;
  } else if (radius < ZONE_LABEL) {
    colour = mirror * SMOOTH_MIRROR;
  } else {
    colour = mix(foil, foil + rimLight, rim);
  }
  gl_FragColor = vec4(colour, 1.0);
  #include <colorspace_fragment>
}
`;

export const DISC_FRAGMENT = [FRAGMENT_HEADER, SPECTRAL, GRATING, LIGHT, TRACKS_AND_LABEL, FRAGMENT_MAIN].join('');

// The same functions in JS, so tests can hold the shader to its promises.

function bump3(x: readonly number[], offset: readonly number[]): number[] {
  return x.map((value, i) => Math.min(1, Math.max(0, 1 - value * value - (offset[i] ?? 0))));
}

/** The visible spectrum (nm) as RGB 0–1; zero outside 400–700 nm. */
export function spectral(nm: number): [number, number, number] {
  if (nm < 400 || nm > 700) return [0, 0, 0];
  const x = (nm - 400) / 300;
  const c1 = [3.54585104, 2.93225262, 2.41593945];
  const x1 = [0.69549072, 0.49228336, 0.2769988];
  const y1 = [0.02312639, 0.15225084, 0.52607955];
  const c2 = [3.9030714, 3.21182957, 3.96587128];
  const x2 = [0.11748627, 0.86755042, 0.6607786];
  const y2 = [0.8489713, 0.88445281, 0.73949448];
  const a = bump3(
    c1.map((c, i) => c * (x - (x1[i] ?? 0))),
    y1,
  );
  const b = bump3(
    c2.map((c, i) => c * (x - (x2[i] ?? 0))),
    y2,
  );
  return [(a[0] ?? 0) + (b[0] ?? 0), (a[1] ?? 0) + (b[1] ?? 0), (a[2] ?? 0) + (b[2] ?? 0)];
}

type V3 = readonly [number, number, number];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Diffraction colour off the tracks for normal n, radial direction r, view v and light l (unit vectors), in 2 or 3 orders. */
export function grating(n: V3, r: V3, v: V3, l: V3, orders: 2 | 3 = 2): [number, number, number] {
  const sum: V3 = [v[0] + l[0], v[1] + l[1], v[2] + l[2]];
  const length = Math.hypot(...sum);
  const h: V3 = [sum[0] / length, sum[1] / length, sum[2] / length];
  const across = dot(h, cross(n, r)) / 0.08;
  const lobe = Math.exp(-across * across);
  const u = Math.abs(dot(r, sum)) * TRACK_PITCH_NM;
  const first = spectral(u);
  const second = spectral(u / 2);
  const third = orders === 3 ? spectral(u / 3) : [0, 0, 0];
  return [
    (first[0] + second[0] + (third[0] ?? 0)) * lobe,
    (first[1] + second[1] + (third[1] ?? 0)) * lobe,
    (first[2] + second[2] + (third[2] ?? 0)) * lobe,
  ];
}
