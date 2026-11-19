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
   * facing the viewer (3). `glow`: colours whose strength falls outwards, over the paints before it; its radius
   * is then the most it may reach.
   */
  | {
      readonly kind: 'radial';
      readonly centre: Vec3;
      readonly radius: number;
      readonly axis: 0 | 1 | 2 | 3;
      readonly stops: number;
      readonly glow?: boolean;
    }
  /**
   * The surface's light as a grid of `rows` lines of `columns` colours on its own plane, which the fit finds with
   * the part of it any shot shows (encode.ts › Paint).
   */
  | {
      readonly kind: 'field';
      readonly columns: number;
      readonly rows: number;
      /** No piece of the still's image: a surface whose light the grid alone has to a level (the wall, the dark glass), where an image's own rounding would be the larger error. */
      readonly plain?: boolean;
    };

interface Common {
  readonly name: string;
  /**
   * The layer whose rendered picture has this one in it (the bulb's has its filament, the shell's its jacks): this
   * one is then drawn only until that picture is in. The set's print is always in the shell's.
   */
  readonly on?: string;
  readonly paints: readonly PaintSpec[];
}

export type LayerSpec =
  /** The charts' rectangles of a group that any framing shows, each its own shape, the furthest first. */
  /** `wide`: the paints of a rectangle that faces the viewer and is this long (metres) or longer, from its left end to its right. */
  | (Common & {
      readonly kind: 'charts';
      readonly pick: (triangle: Triangle) => boolean;
      readonly wide?: { readonly from: number; readonly columns: number; readonly rows: number };
    })
  /**
   * The outline of the picked triangles as the nominal camera sees them alone. `grow` widens a part too fine to
   * trace (CSS px); `tolerance` is how far the kept outline may leave the true one (CSS px at 1440 × 900).
   */
  | (Common & {
      readonly kind: 'outline';
      readonly pick: (triangle: Triangle) => boolean;
      readonly grow?: number;
      /** Widened by `grow` and narrowed again by as much: its gaps and notches under that size closed, its edges where they were. */
      readonly close?: boolean;
      readonly tolerance?: number;
      /** What hides part of it from every camera alike (the lip round the glass): only what is nearer than that is drawn. */
      readonly behind?: (triangle: Triangle) => boolean;
      /** The outline's points are kept two or four times coarser than the half millimetre (a soft or a small thing). */
      readonly coarse?: 2 | 4;
      /**
       * A window whose eye stands much nearer than the nominal view's (its width and height): the outline is traced
       * from that eye as well, and drawn from there in the windows whose eye is nearer to it. A rounded body's
       * outline is another line on it from another eye.
       */
      readonly near?: readonly [number, number];
      /** Only its largest outline: what is inside it is too small to tell. */
      readonly whole?: boolean;
      /** The part is round as the viewer sees it: a disc of its outline's size, and one of its hole's (`<name>-hole`). */
      readonly round?: boolean;
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
  /** The finish's vignette over the whole page (finish.ts), but for the layer `except`, which the finish leaves as it is (a display). */
  | (Common & { readonly kind: 'vignette'; readonly except: string })
  /** The game's picture's light along another layer's outline, on the half of `width` metres that is inside it: there with the set on. */
  | (Common & {
      readonly kind: 'rim';
      /** The layer whose outline the light runs along, or the picture's own outline. */
      readonly of: string | 'picture';
      /** The layer it is cut to. */
      readonly within: string;
      /** How far from the edge it reaches (metres), and in how many steps it falls. */
      readonly width: number;
      readonly steps: number;
    });

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

/** The layers, back to front. */
export const LAYERS: readonly LayerSpec[] = [
  { name: 'wall', kind: 'charts', pick: isWall, paints: [{ kind: 'field', columns: 20, rows: 12, plain: true }] },
  {
    name: 'cabinet',
    kind: 'charts',
    pick: (t) => t.of === 'chart' && t.mesh === 'cabinet' && !isTop(t),
    // The lamps light the top's long edge and the fronts under it unevenly from end to end.
    wide: { from: 1.5, columns: 16, rows: 3 },
    paints: [{ kind: 'field', columns: 3, rows: 3 }],
  },
  { name: 'top', kind: 'charts', pick: isTop, paints: [{ kind: 'field', columns: 28, rows: 12 }] },
  {
    name: 'lamp-foot',
    kind: 'outline',
    pick: of('opal-lamp', 'props'),
    tolerance: 0.35,
    paints: [{ kind: 'field', columns: 3, rows: 4 }],
  },
  {
    name: 'halo',
    kind: 'disc',
    centre: bulb,
    radius: 0.16,
    paints: [{ kind: 'radial', centre: bulb, radius: 0.16, axis: 3, stops: 5, glow: true }],
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
    tolerance: 0.35,
    paints: [{ kind: 'field', columns: 4, rows: 2 }],
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
    tolerance: 0.35,
    whole: true,
    paints: [{ kind: 'field', columns: 3, rows: 2 }],
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
    tolerance: 0.35,
    // Across its near side, where the viewer sees it, from the end the wall's corner is at to the set's.
    paints: [{ kind: 'field', columns: 6, rows: 5 }],
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
    tolerance: 0.35,
    whole: true,
    paints: [{ kind: 'field', columns: 5, rows: 3 }],
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
    tolerance: 0.35,
    whole: true,
    paints: [{ kind: 'field', columns: 3, rows: 5 }],
  },
  {
    name: 'bulb',
    kind: 'outline',
    pick: of('bulb-lamp', 'bulb'),
    tolerance: 0.35,
    paints: [{ kind: 'field', columns: 6, rows: 8 }],
  },
  {
    name: 'filament',
    on: 'bulb',
    kind: 'outline',
    pick: of('bulb-lamp', 'filament'),
    grow: 0.25,
    tolerance: 0.35,
    paints: [{ kind: 'flat' }],
  },
  {
    name: 'pot',
    kind: 'outline',
    pick: (t) => t.of === 'desk-plant' && luminance(t.albedo) > 0.2,
    tolerance: 0.35,
    // Across its near side.
    paints: [{ kind: 'field', columns: 7, rows: 6 }],
  },
  {
    name: 'leaves',
    kind: 'outline',
    pick: (t) => t.of === 'desk-plant' && luminance(t.albedo) <= 0.2,
    tolerance: 0.35,
    paints: [{ kind: 'field', columns: 10, rows: 8 }],
  },
  {
    name: 'plinth',
    kind: 'outline',
    pick: (t) => t.of === 'tv-set' && t.max[1] < PLINTH_TOP,
    // Nearly all of it is behind the shell.
    tolerance: 0.35,
    // Its notches closed (a pixel's worth): the gaps under it between its feet are the cabinet's top in the dark,
    // which no shot shows.
    grow: 1,
    close: true,
    paints: [{ kind: 'field', columns: 8, rows: 3 }],
  },
  {
    name: 'shell',
    kind: 'outline',
    pick: isShell,
    // The short landscape windows frame the picture alone from close by, and see round the casing's sides.
    near: [1200, 500],
    tolerance: 0.35,
    paints: [{ kind: 'field', columns: 20, rows: 12 }],
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
    tolerance: 0.35,
    paints: [{ kind: 'flat' }],
  },
  {
    name: 'glass',
    kind: 'outline',
    pick: of('glass'),
    behind: isShell,
    tolerance: 0.35,
    paints: [{ kind: 'field', columns: 10, rows: 9, plain: true }],
  },
  ...JACKS.map(
    (colour, i): LayerSpec => ({
      name: `jack-${i}`,
      on: 'shell',
      kind: 'outline',
      pick: (t) => t.of === 'tv-set' && near(t.albedo, colour),
      round: true,
      paints: [{ kind: 'flat', bright: true }],
    }),
  ),
  {
    name: 'legends',
    on: 'shell',
    kind: 'text',
    words: LEGENDS,
    centre: [FACE, printY(104), 0],
    size: printSize(10.5),
    paints: [{ kind: 'flat', bright: true }],
  },
  {
    name: 'wordmark',
    on: 'shell',
    kind: 'text',
    words: [['reo·leo', -0.32]],
    centre: [FACE, printY(42), 0],
    size: printSize(40),
    paints: [{ kind: 'flat', bright: true }],
  },
  { name: 'vignette', kind: 'vignette', except: 'glass', paints: [] },
  // The opal lamp is bright enough at the page's edge that black laid over it would dull it: it and its bloom are
  // drawn over the vignette, in the colours the room shows them in.
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
    name: 'globe',
    kind: 'outline',
    pick: of('opal-lamp', 'globe'),
    // A ball off to the side is an oval on the page, so its outline and not a disc.
    tolerance: 0.35,
    paints: [{ kind: 'field', columns: 4, rows: 4 }],
  },
  // What the set shows only when it is on, last: the page shows these with the game's picture.
  {
    name: 'led-halo',
    kind: 'disc',
    centre: TV_SPEC.led,
    radius: 3 * LED.halo,
    lit: true,
    paints: [{ kind: 'radial', centre: TV_SPEC.led, radius: 3 * LED.halo, axis: 3, stops: 9, glow: true }],
  },
  { name: 'led', kind: 'disc', centre: TV_SPEC.led, radius: LED.lens, lit: true, paints: [{ kind: 'flat' }] },
  // What the picture lights, in the picture's colour (index.html › --tube): the lip round the glass, brightest along
  // its outer edge where it turns onto the face, and the tube's dark border round the picture, brightest beside it.
  { name: 'tube-lip', kind: 'rim', of: 'lip', within: 'lip', width: 0.012, steps: 6, paints: [] },
  { name: 'tube-border', kind: 'rim', of: 'picture', within: 'glass', width: 0.024, steps: 8, paints: [] },
];

/** The set's own layers and the room's flat surfaces: everything else is a prop beside the set. */
const SET = /^(wall|cabinet|top|plinth|shell|lip|glass|jack|legends|wordmark|vignette|led|tube)/;

/**
 * The layers made lighter, for pricing what each part of the still costs (build.ts › --variant):
 * `coarse-fields` gives every surface's grid six tenths of its lines, `flat-props` paints the lamps, the plant and
 * the cord each in one colour, `loose-props` traces them to 0.7 px and keeps their points to the millimetre, and
 * `no-props-detail` is the last two together.
 */
export function variantOf(names: readonly string[]): readonly LayerSpec[] {
  const has = (name: string): boolean =>
    names.includes(name) || (name !== 'coarse-fields' && names.includes('no-props-detail'));
  return LAYERS.map((layer): LayerSpec => {
    let made = layer;
    const prop = !SET.test(layer.name) && layer.kind === 'outline';
    if (prop && has('flat-props') && layer.paints[0]?.kind === 'field') made = { ...made, paints: [{ kind: 'flat' }] };
    if (prop && has('loose-props') && made.kind === 'outline') made = { ...made, tolerance: 0.7, coarse: 2 };
    if (has('coarse-fields')) {
      const fewer = (count: number): number => Math.max(2, Math.round(count * 0.6));
      made = {
        ...made,
        paints: made.paints.map((paint) =>
          paint.kind === 'field' ? { ...paint, columns: fewer(paint.columns), rows: fewer(paint.rows) } : paint,
        ),
        ...(made.kind === 'charts' && made.wide
          ? { wide: { ...made.wide, columns: fewer(made.wide.columns), rows: fewer(made.wide.rows) } }
          : {}),
      } as LayerSpec;
    }
    return made;
  });
}
