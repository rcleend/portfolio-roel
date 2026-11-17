/**
 * What the startup still draws (docs/ROOM.md › Startup): the TV view's layers, back to front, each a part of the
 * generated room picked out of its triangles and the way its baked light is painted. The outlines come from the
 * generators and the colours from the live room (build.ts); this table only says which part is which.
 */
import { BULB_SPEC, TV_LAMP_SPEC, TV_SPEC } from '../../src/room/gen/roomSpec';
import type { Vec3 } from './raster';
import type { Triangle } from './world';

/** How a layer's light is painted: every colour is sampled, only where the paint is anchored is said here. */
export type PaintSpec =
  | { readonly kind: 'flat'; readonly bright?: boolean }
  /** `stops` colours evenly from one point of the room to another, or one at each of the places `at` (0–1). */
  | {
      readonly kind: 'linear';
      readonly from: Vec3;
      readonly to: Vec3;
      readonly stops: number;
      readonly at?: readonly number[];
    }
  /**
   * `stops` colours evenly out from a point to `radius` metres, on the plane across `axis` (0 x, 1 y, 2 z) or
   * facing the viewer (3). `glow`: one colour whose strength falls outwards, over the paints before it; its radius
   * is then the most it may reach.
   */
  | {
      readonly kind: 'radial';
      readonly centre: Vec3;
      readonly radius: number;
      readonly axis: 0 | 1 | 2 | 3;
      readonly stops: number;
      readonly glow?: boolean;
    };

interface Common {
  readonly name: string;
  readonly paints: readonly PaintSpec[];
}

export type LayerSpec =
  /** The charts' rectangles of a group that any framing shows, each its own shape, the furthest first. */
  /** `wide`: the paints of a rectangle that faces the viewer and is this long (metres) or longer, from its left end to its right. */
  | (Common & {
      readonly kind: 'charts';
      readonly pick: (triangle: Triangle) => boolean;
      readonly wide?: { readonly from: number; readonly stops: number };
    })
  /**
   * The outline of the picked triangles as the nominal camera sees them alone. `grow` widens a part too fine to
   * trace (CSS px); `tolerance` is how far the kept outline may leave the true one (CSS px at 1440 × 900).
   */
  | (Common & {
      readonly kind: 'outline';
      readonly pick: (triangle: Triangle) => boolean;
      readonly grow?: number;
      readonly tolerance?: number;
      /** What hides part of it from every camera alike (the lip round the glass): only what is nearer than that is drawn. */
      readonly behind?: (triangle: Triangle) => boolean;
      /** The outline's points are kept two or four times coarser than the half millimetre (a soft or a small thing). */
      readonly coarse?: 2 | 4;
      /** Only its largest outline: what is inside it is too small to tell. */
      readonly whole?: boolean;
      /** The part is round as the viewer sees it: a disc of its outline's size, and one of its hole's (`<name>-hole`). */
      readonly round?: boolean;
    })
  /**
   * A lamp's pool on a flat surface: the part of the picked chart within `reach` metres of `centre` that `light`
   * reaches past the `casters` (their shadow is cut out of it). Its paints go over those of the layer `over`.
   */
  | (Common & {
      readonly kind: 'pool';
      readonly over: string;
      readonly pick: (triangle: Triangle) => boolean;
      readonly casters: (triangle: Triangle) => boolean;
      readonly light: Vec3;
      readonly centre: Vec3;
      readonly reach: number;
      readonly tolerance?: number;
    })
  /** A disc facing the viewer. `lit`: a light of the set, there only when the set is on. */
  | (Common & { readonly kind: 'disc'; readonly centre: Vec3; readonly radius: number; readonly lit?: boolean })
  /**
   * A row of the set's print (gen/artPaint.ts › legends), in the print's own face: each word and where along the
   * face it is centred, `height` metres tall about `centre` (whose z is not used).
   */
  | (Common & {
      readonly kind: 'text';
      readonly words: readonly (readonly [string, number])[];
      readonly centre: Vec3;
      readonly size: number;
    })
  /** The game's picture's light along another layer's outline, on the half of `width` metres that is inside it: there with the set on. */
  | (Common & { readonly kind: 'rim'; readonly of: string; readonly width: number });

const CABINET_TOP = 0.486;
const WALL = 2.8;
const lamp = TV_LAMP_SPEC.center;
const bulb = BULB_SPEC.filament;
const base = BULB_SPEC.origin;
const luminance = (albedo: Vec3): number => (albedo[0] + albedo[1] + albedo[2]) / 3;
const near = (albedo: Vec3, colour: Vec3): boolean =>
  albedo.every((value, i) => Math.abs(value - (colour[i] as number)) < 0.02);
/** How far a triangle is from the bulb lamp's axis. */
const fromBase = (t: Triangle): number =>
  Math.hypot((t.min[0] + t.max[0]) / 2 - base[0], (t.min[2] + t.max[2]) / 2 - base[2]);
const of =
  (name: string, mesh?: string) =>
  (t: Triangle): boolean =>
    t.of === name && (mesh === undefined || t.mesh === mesh);
const isWall = (t: Triangle): boolean =>
  t.of === 'chart' && t.mesh === 'wall' && t.normal[0] < -0.9 && Math.abs(t.min[0] - WALL) < 1e-4;
const isTop = (t: Triangle): boolean =>
  t.of === 'chart' &&
  t.mesh === 'cabinet' &&
  t.normal[1] > 0.9 &&
  t.max[1] === t.min[1] &&
  Math.abs(t.min[1] - CABINET_TOP) < 1e-4;
/** The front shell and what is on it: the rear cover closes the lip's opening, and no framing sees it. */
const SEAM = 2.375;
const PLINTH_TOP = 0.5415;
const isShell = (t: Triangle): boolean => t.of === 'tv-set' && t.max[1] >= PLINTH_TOP && t.max[0] < SEAM;
/** The set's jacks, by their plastics (gen/props/tvSet.ts). */
const JACKS: readonly Vec3[] = [
  [0.62, 0.42, 0.03],
  [0.55, 0.55, 0.55],
  [0.55, 0.035, 0.035],
];
/** The power lamp's lens and its halo (tv/PowerLed.ts › LED_RADIUS, HALO_RADIUS). */
const LED = { lens: 0.0024, halo: 0.016 };
/** The print: 0.30 m of the chin from z = −0.48 and 0.0375 m high under y = 0.6097, a 128 px tall page (gen/artPaint.ts). */
const printY = (row: number): number => 0.6097 - (row / 128) * 0.0375;
const printSize = (px: number): number => (px / 128) * 0.0375;
const FACE = 2.154;
/** The legends under the keys and over the jacks, and where each is centred (gen/artPaint.ts › legends). */
const LEGENDS: readonly (readonly [string, number])[] = [
  ['POWER', -0.468],
  ['▾ VOLUME ▴', -0.437],
  ['▾ CHANNEL ▴', -0.405],
  ['ACTION  TV/VIDEO', -0.366],
  ['VIDEO IN', -0.2506],
  ['L', -0.228],
  ['– AUDIO –', -0.2167],
  ['R', -0.2054],
];

/** Where a lamp's reflection in a polished surface at height `y` is, for an eye: on the line to the lamp's mirror image. */
function sheen(light: Vec3, eye: Vec3, y: number): Vec3 {
  const t = (light[1] - y) / (eye[1] - y + light[1] - y);
  return [light[0] + (eye[0] - light[0]) * t, y, light[2] + (eye[2] - light[2]) * t];
}

/** The layers, back to front, for the nominal view's eye. */
export const layersFor = (eye: Vec3): readonly LayerSpec[] => [
  {
    name: 'wall',
    kind: 'charts',
    pick: isWall,
    paints: [
      { kind: 'linear', from: [WALL, 1, -1.9], to: [WALL, 1, 1.1], stops: 7 },
      { kind: 'radial', centre: [WALL, lamp[1], lamp[2]], radius: 0.9, axis: 0, stops: 5, glow: true },
    ],
  },
  {
    name: 'wall-pool',
    kind: 'pool',
    over: 'wall',
    pick: isWall,
    casters: of('tv-set'),
    light: bulb,
    centre: [WALL, bulb[1], bulb[2]],
    reach: 0.9,
    tolerance: 2.5,
    paints: [{ kind: 'radial', centre: [WALL, bulb[1], bulb[2]], radius: 0.9, axis: 0, stops: 5, glow: true }],
  },
  {
    name: 'cabinet',
    kind: 'charts',
    pick: (t) => t.of === 'chart' && t.mesh === 'cabinet' && !isTop(t),
    // The lamps light the top's long edge unevenly from end to end.
    wide: { from: 1.5, stops: 3 },
    paints: [{ kind: 'flat' }],
  },
  {
    name: 'top',
    kind: 'charts',
    pick: isTop,
    paints: [
      { kind: 'linear', from: [2.4, CABINET_TOP, -1.125], to: [2.4, CABINET_TOP, 0.675], stops: 7 },
      // The opal lamp's pool.
      { kind: 'radial', centre: [lamp[0], CABINET_TOP, lamp[2]], radius: 0.7, axis: 1, stops: 5, glow: true },
    ],
  },
  {
    name: 'top-pool',
    kind: 'pool',
    over: 'top',
    pick: isTop,
    casters: of('tv-set'),
    light: bulb,
    centre: [base[0], CABINET_TOP, base[2]],
    reach: 0.7,
    tolerance: 2.5,
    paints: [
      { kind: 'radial', centre: [base[0], CABINET_TOP, base[2]], radius: 0.7, axis: 1, stops: 5, glow: true },
      // The top is varnished: the bulb's reflection lies towards the viewer, most of it past the front edge.
      { kind: 'radial', centre: sheen(bulb, eye, CABINET_TOP), radius: 0.6, axis: 1, stops: 6, glow: true },
    ],
  },
  {
    name: 'lamp-halo',
    kind: 'disc',
    centre: lamp,
    // The finish's bloom is of the page, not of the room: it is there in the windows wide enough to show the globe,
    // and the still draws a disc only where its middle is on the page.
    radius: 0.35,
    paints: [{ kind: 'radial', centre: lamp, radius: 0.35, axis: 3, stops: 5, glow: true }],
  },
  {
    name: 'lamp-foot',
    kind: 'outline',
    pick: of('opal-lamp', 'props'),
    tolerance: 1,
    coarse: 2,
    paints: [{ kind: 'flat' }],
  },
  {
    name: 'globe',
    kind: 'outline',
    pick: of('opal-lamp', 'globe'),
    // A ball off to the side is an oval on the page, so its outline and not a disc.
    tolerance: 0.7,
    coarse: 2,
    paints: [{ kind: 'radial', centre: lamp, radius: TV_LAMP_SPEC.radius * 1.02, axis: 3, stops: 4 }],
  },
  {
    name: 'halo',
    kind: 'disc',
    centre: bulb,
    radius: 0.16,
    paints: [{ kind: 'radial', centre: bulb, radius: 0.16, axis: 3, stops: 6, glow: true }],
  },
  {
    name: 'cord',
    kind: 'outline',
    pick: (t) =>
      t.of === 'bulb-lamp' &&
      t.mesh === 'props' &&
      fromBase(t) > 0.046 &&
      t.min[1] > CABINET_TOP - 0.001 &&
      t.max[0] < 2.69 &&
      luminance(t.albedo) < 0.15,
    tolerance: 1,
    coarse: 4,
    paints: [{ kind: 'flat' }],
  },
  {
    name: 'switch',
    kind: 'outline',
    pick: (t) =>
      t.of === 'bulb-lamp' &&
      t.mesh === 'props' &&
      fromBase(t) > 0.046 &&
      t.min[1] > CABINET_TOP - 0.001 &&
      luminance(t.albedo) >= 0.15,
    tolerance: 0.7,
    coarse: 2,
    whole: true,
    paints: [{ kind: 'flat', bright: true }],
  },
  {
    name: 'base',
    kind: 'outline',
    pick: (t) =>
      t.of === 'bulb-lamp' &&
      t.mesh === 'props' &&
      fromBase(t) <= 0.046 &&
      luminance(t.albedo) > 0.12 &&
      t.max[1] < 0.56,
    tolerance: 0.7,
    coarse: 2,
    // Across its near side, where the viewer sees it, from the end the wall's corner is at to the set's.
    paints: [
      {
        kind: 'linear',
        from: [base[0] - 0.042, 0.51, base[2] - 0.042],
        to: [base[0] - 0.042, 0.51, base[2] + 0.042],
        stops: 6,
      },
    ],
  },
  {
    name: 'base-top',
    kind: 'outline',
    pick: (t) =>
      t.of === 'bulb-lamp' &&
      t.mesh === 'props' &&
      fromBase(t) <= 0.046 &&
      luminance(t.albedo) > 0.12 &&
      t.max[1] < 0.56 &&
      t.normal[1] > 0.7,
    tolerance: 0.7,
    coarse: 2,
    whole: true,
    paints: [{ kind: 'flat' }],
  },
  {
    name: 'socket',
    kind: 'outline',
    pick: (t) =>
      t.of === 'bulb-lamp' &&
      t.mesh === 'props' &&
      fromBase(t) <= 0.046 &&
      luminance(t.albedo) <= 0.12 &&
      t.max[1] < 0.61,
    tolerance: 0.9,
    coarse: 2,
    whole: true,
    paints: [{ kind: 'flat' }],
  },
  {
    name: 'bulb',
    kind: 'outline',
    pick: of('bulb-lamp', 'bulb'),
    tolerance: 0.7,
    coarse: 2,
    paints: [{ kind: 'radial', centre: bulb, radius: 0.076, axis: 3, stops: 6 }],
  },
  {
    name: 'filament',
    kind: 'outline',
    pick: of('bulb-lamp', 'filament'),
    grow: 0.5,
    tolerance: 0.6,
    coarse: 2,
    paints: [{ kind: 'flat', bright: true }],
  },
  {
    name: 'pot',
    kind: 'outline',
    pick: (t) => t.of === 'desk-plant' && luminance(t.albedo) > 0.2,
    tolerance: 0.7,
    coarse: 2,
    // Across its near side.
    paints: [
      {
        kind: 'linear',
        from: [2.268 - 0.049, 0.53, 0.121 - 0.049],
        to: [2.268 - 0.049, 0.53, 0.121 + 0.049],
        stops: 6,
      },
    ],
  },
  {
    name: 'leaves',
    kind: 'outline',
    pick: (t) => t.of === 'desk-plant' && luminance(t.albedo) <= 0.2,
    tolerance: 1.6,
    coarse: 4,
    paints: [{ kind: 'flat' }],
  },
  {
    name: 'plinth',
    kind: 'outline',
    pick: (t) => t.of === 'tv-set' && t.max[1] < PLINTH_TOP,
    // Nearly all of it is behind the shell.
    tolerance: 0.5,
    coarse: 2,
    paints: [{ kind: 'flat' }],
  },
  {
    name: 'shell',
    kind: 'outline',
    pick: isShell,
    tolerance: 0.35,
    // Across the face.
    paints: [
      {
        kind: 'linear',
        from: [FACE, 0.8, TV_SPEC.bounds.min[2]],
        to: [FACE, 0.8, TV_SPEC.bounds.max[2]],
        stops: 7,
      },
      // The bare bulb lights the face's near corner, low on the side it stands on.
      {
        kind: 'radial',
        centre: [FACE, CABINET_TOP, TV_SPEC.bounds.min[2]],
        radius: 0.4,
        axis: 0,
        stops: 6,
        glow: true,
      },
    ],
  },
  // The lip round the glass, as far out as it turns onto the face: the shell's own colour until the set is on,
  // then the edge the picture's light runs along (screen-light).
  {
    name: 'lip',
    kind: 'outline',
    // The shell's triangles round the glass that face inwards rather than the viewer.
    pick: (t) =>
      isShell(t) &&
      Math.abs(t.normal[0]) < 0.8 &&
      t.max[0] < FACE + 0.035 &&
      Math.abs((t.min[2] + t.max[2]) / 2 + 0.32) < 0.275 &&
      t.min[1] > 0.62 &&
      t.max[1] < 1.05,
    whole: true,
    tolerance: 0.5,
    coarse: 2,
    paints: [{ kind: 'flat' }],
  },
  {
    name: 'glass',
    kind: 'outline',
    pick: of('glass'),
    behind: isShell,
    tolerance: 0.4,
    // The dark tube's sheen is brightest a third of the way down it.
    paints: [
      {
        kind: 'radial',
        centre: [TV_SPEC.glass.front, TV_SPEC.glass.top - (TV_SPEC.glass.top - TV_SPEC.glass.bottom) / 3, -0.32],
        radius: 0.36,
        axis: 0,
        stops: 4,
      },
    ],
  },
  ...JACKS.map(
    (colour, i): LayerSpec => ({
      name: `jack-${i}`,
      kind: 'outline',
      pick: (t) => t.of === 'tv-set' && near(t.albedo, colour),
      round: true,
      paints: [{ kind: 'flat', bright: true }],
    }),
  ),
  {
    name: 'legends',
    kind: 'text',
    words: LEGENDS,
    centre: [FACE, printY(104), 0],
    size: printSize(10.5),
    paints: [{ kind: 'flat', bright: true }],
  },
  {
    name: 'wordmark',
    kind: 'text',
    words: [['reo·leo', -0.32]],
    centre: [FACE, printY(42), 0],
    size: printSize(40),
    paints: [{ kind: 'flat', bright: true }],
  },
  // What the set shows only when it is on, last: the page shows these with the game's picture.
  {
    name: 'led-halo',
    kind: 'disc',
    centre: TV_SPEC.led,
    radius: 2 * LED.halo,
    lit: true,
    paints: [{ kind: 'radial', centre: TV_SPEC.led, radius: 2 * LED.halo, axis: 3, stops: 5, glow: true }],
  },
  { name: 'led', kind: 'disc', centre: TV_SPEC.led, radius: LED.lens, lit: true, paints: [{ kind: 'flat' }] },
  // The picture's light on the lip round the glass: a band along the lip's outer edge, where it turns onto the face.
  { name: 'screen-light', kind: 'rim', of: 'lip', width: 0.01, paints: [{ kind: 'flat' }] },
];
