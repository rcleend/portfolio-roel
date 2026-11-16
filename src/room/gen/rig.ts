import type { Rgb, Vec3 } from './kit/builder';

/**
 * The night's light, as a table. The colours are the Blender rig's (tools/room/restyle.py › lighting); the places are
 * read off the room. Every light is static, so each is rendered once, at load, from several points of its emitter
 * (soft shadows by accumulation), into the room's light maps and vertex colours (bake/Baker.ts).
 *
 * `scene` lights are the room's own, in scene-linear light under the bake's display curve. `finish` lights are the two
 * small practicals on the TV cabinet, in the finish's own terms (atmosphere/tvLamp.ts, bulbLamp.ts): the opal lamp and
 * the dimmed bare bulb. They never move, so they are baked, with real shadows, and cost a frame nothing.
 */
export interface RigLight {
  readonly name: string;
  readonly kind: 'spot' | 'sun' | 'omni' | 'dome';
  readonly space: 'scene' | 'finish';
  /** Where it stands (a dome's centre; a sun shines from here towards `target`). */
  readonly position: Vec3;
  readonly target: Vec3;
  /** Linear colour × intensity. For `finish` lights only the intensity counts (they share the lamp's colour). */
  readonly color: Rgb;
  /** The emitter's radius in metres (a dome: unused; a sun: at `position`, so a few centimetres is a soft edge). */
  readonly size: number;
  /** Points of the emitter it is rendered from, at full quality and on the lowest tier. */
  readonly samples: readonly [high: number, low: number];
  /** A spot's cone: where it starts to fall and where it ends, as half angles (radians). */
  readonly cone?: readonly [inner: number, outer: number];
  /** Inverse square, softened: 1 / (d² + soften). Zero: no fall with distance (a sun, a dome). */
  readonly soften: number;
  /** Fades out between these distances (metres). */
  readonly reach?: readonly [number, number];
  /** How far past the horizon the emitter still lights a surface (a sphere light's wrap), 0–1. */
  readonly wrap: number;
  /** A lens: full light along `aim`, `floor` of it off the beam, between the two cosines; nothing behind `facing`. */
  readonly beam?: {
    readonly aim: Vec3;
    readonly cos: readonly [number, number];
    readonly floor: number;
    readonly facing: Vec3;
  };
  /**
   * What shadows it: everything, only furniture and props (the shell cannot shadow a light inside it), or nothing (a
   * fill, which needs no shadow map).
   */
  readonly casters: 'all' | 'local' | 'none';
  /** An opening its light must pass through: the centre and the two half edges of a rectangle (the window's sashes). */
  readonly portal?: { readonly center: Vec3; readonly u: Vec3; readonly v: Vec3 };
  /** The half extent (metres) a sun's or a dome's shadow map covers around `target`. */
  readonly extent?: number;
  /** Nothing nearer the emitter than this (metres) shadows it: its own housing. */
  readonly clear?: number;
  /**
   * A light that comes through a thin sheet (the blind's slats, lit from outside): its shadow is looked up this far
   * (metres) towards the light, past the sheet itself, so the sheet takes the shadows of what stands behind it.
   */
  readonly through?: number;
}

/** The opal lamp's globe, as the shipped room places it (room.glb › userData.light). */
export const TV_LAMP = { center: [2.33, 0.6014, 0.46] as Vec3, radius: 0.08 };
/** The bare-bulb lamp on the cabinet's left-hand end: where its base stands, and the middle of its filament. */
export const BULB = { origin: [2.31, 0.486, -0.84] as Vec3, filament: [2.31, 0.666, -0.84] as Vec3 };

/** Where the night's light comes from: outside the window, above it and a little to its right. */
const MOON: Vec3 = [-1.25, 2.65, -3.4];

/** The colour of the room's ambient light from above and from below (bounce off the oak). */
export const AMBIENT = { sky: [0.043, 0.05, 0.072] as Rgb, ground: [0.1, 0.072, 0.083] as Rgb };

export const RIG: readonly RigLight[] = [
  // What reaches a surface from all around: the dim blue world through the window and the room's own bounce, as a dome
  // of weak suns that only furniture shadows. This is what darkens a shelf's inside and the floor under the cabinet.
  {
    name: 'ambient',
    kind: 'dome',
    space: 'scene',
    position: [0, 1.2, 0],
    target: [0, 0, 0],
    color: [1, 1, 1],
    size: 0,
    samples: [32, 16],
    soften: 0,
    wrap: 0,
    casters: 'local',
    extent: 4.2,
  },
  // The broad overhead practical ("Warm attic practical"): a soft pool on the middle of the floor that ends short of
  // the walls and the TV cabinet.
  {
    name: 'pool',
    kind: 'spot',
    space: 'scene',
    position: [0.9, 2.9, -1.9],
    target: [1.3, 0, -0.5],
    color: [8.5, 7.0, 9.8],
    size: 0.6,
    samples: [12, 6],
    cone: [0.25, 0.5],
    soften: 6,
    wrap: 0,
    casters: 'all',
  },
  // What that pool sends back up: the lit oak as a wide, low emitter. It is the pink on the cabinet's drawer fronts and
  // inside its shelves, and most of the light the wall behind the set gets. (The Blender bake traced this bounce; here
  // it is one more light, as that rig's own fill lights were.)
  {
    name: 'bounce',
    kind: 'spot',
    space: 'scene',
    position: [-1.3, 0.85, -1.7],
    target: [-1.3, 2, -1.7],
    color: [0.85, 0.6, 0.68],
    size: 0.8,
    samples: [8, 4],
    cone: [1.1, 1.45],
    soften: 1.5,
    wrap: 0,
    casters: 'local',
  },
  // And what the lit boards send back up at the furniture standing round them: the pink on the drawer fronts, the
  // dresser's doors and the guitar.
  {
    name: 'floor',
    kind: 'spot',
    space: 'scene',
    position: [0.0, 0.05, -0.3],
    target: [0.0, 1, -0.3],
    color: [0.44, 0.31, 0.4],
    size: 1.2,
    samples: [12, 6],
    cone: [1.2, 1.5],
    soften: 1.5,
    reach: [2.1, 2.8],
    wrap: 0,
    casters: 'local',
  },
  // The set's own glow on the room ("TV screen reflected blue"): the bake's standing light on the tube's face, a disc
  // that shines one way. The boards before the cabinet are the brightest in the room, nothing behind the glass's plane
  // takes any (the knee wall, the boards past the cabinet's end), the cabinet's top edge shades the boards at its foot
  // and the console and the cases throw their shadows away from the set. (The picture's light of the moment is the
  // finish's, every frame.)
  {
    name: 'tv-glow',
    kind: 'spot',
    space: 'scene',
    position: [2.14, 0.84, -0.32],
    target: [1.14, 0.84, -0.32],
    color: [0.3, 0.31, 0.7],
    size: 0.2,
    samples: [4, 2],
    cone: [1.0, 1.3],
    soften: 0.3,
    reach: [3.5, 5.0],
    wrap: 0,
    casters: 'local',
  },
  // The night through the window ("Blue hour window fill"): a small emitter outside and above it, so what it sends in
  // fans out, down onto the desk and past the desk's end onto the floor. This is what comes under the blind, through
  // the lower sash: the bright patch with an edge.
  {
    name: 'moon',
    kind: 'spot',
    space: 'scene',
    position: MOON,
    target: [-0.6, 0.2, -0.9],
    color: [11.4, 12, 13.9],
    size: 0.1,
    samples: [8, 4],
    cone: [0.45, 0.62],
    soften: 6,
    reach: [5.4, 6.4],
    wrap: 0,
    casters: 'local',
    portal: { center: [-1.3, 1.431, -2.405], u: [0.8, 0, 0], v: [0, 0.304, 0] },
  },
  // And what comes through the blind: the same light, a third of it, spread by the slats over the rug and the far
  // floor. The slats themselves do not shadow it (`clear` ends past them): their stripes, a few centimetres apart,
  // cannot be told apart by a handful of emitter points, and the room shows none.
  {
    name: 'moon-through-blind',
    kind: 'spot',
    space: 'scene',
    position: MOON,
    target: [-0.6, 0.2, -0.9],
    color: [10, 10.6, 12.2],
    size: 0.3,
    samples: [8, 4],
    cone: [0.45, 0.62],
    soften: 6,
    reach: [5.4, 6.4],
    wrap: 0,
    casters: 'local',
    clear: 1.56,
    portal: { center: [-1.3, 2.185, -2.405], u: [0.8, 0, 0], v: [0, 0.335, 0] },
  },
  // The room's own blue bounce on the left wall, which faces the set and the lit floor ("TV screen reflected blue",
  // "Window reflected corner fill"): a fill, so nothing shadows it. The picture's light of the moment is the finish's,
  // every frame (docs/ROOM.md › The TV's light).
  {
    name: 'fill',
    kind: 'spot',
    space: 'scene',
    position: [-1.6, 0.1, 0.3],
    target: [-2.8, 0.9, 0.0],
    color: [1.1, 1.5, 1.8],
    size: 0,
    samples: [1, 1],
    cone: [0.9, 1.3],
    soften: 3,
    wrap: 0,
    casters: 'none',
  },
  // The lava lamp ("Lava lamp amber spill"): a small amber glow on the dresser's top and the wall behind it.
  {
    name: 'lava',
    kind: 'omni',
    space: 'scene',
    position: [0.49, 1.21, -1.97],
    target: [0.49, 1.21, -1.97],
    color: [0.3, 0.085, 0.015],
    size: 0.04,
    samples: [1, 1],
    soften: 0.2,
    reach: [0.35, 1.2],
    clear: 0.3,
    wrap: 0.1,
    casters: 'local',
  },
  // And what of it crosses the room to the cabinet's near end: the dim red on the cabinet's top and the knee wall
  // beside it. A fill (nothing shadows it), since a lamp this small would draw the dresser's edge hard on the
  // wall beside it, which the room does not show.
  {
    name: 'lava-spill',
    kind: 'spot',
    space: 'scene',
    position: [0.49, 1.21, -1.97],
    target: [2.6, 0.9, -0.9],
    color: [0.7, 0.2, 0.035],
    size: 0,
    samples: [1, 1],
    cone: [0.5, 0.9],
    soften: 0.6,
    reach: [1.5, 3.2],
    wrap: 0,
    casters: 'none',
  },
  // The desk lamp ("Task light tungsten"): under its shade, down onto the desk and out onto the wall beside it.
  {
    name: 'desk',
    kind: 'omni',
    space: 'scene',
    position: [-1.94, 1.03, -2.12],
    target: [-1.94, 1.03, -2.12],
    color: [0.38, 0.135, 0.035],
    size: 0.05,
    samples: [2, 1],
    soften: 0.03,
    reach: [0.5, 1.9],
    wrap: 0,
    casters: 'local',
    clear: 0.14,
  },
  // What the task light's pool on the white desk, the wall and the blind sends back down ("Task light tungsten", traced
  // by the Blender bake): a broad warm emitter over the desk's front, so the keyboard, the mouse and the mug are lit from
  // above and the monitor's moon shadow is filled. It ends within the desk's own length.
  {
    name: 'desk-fill',
    kind: 'spot',
    space: 'scene',
    position: [-1.4, 1.9, -1.35],
    target: [-1.38, 0.8, -1.37],
    color: [1.06, 0.92, 0.88],
    size: 0.25,
    samples: [3, 2],
    cone: [0.2, 0.42],
    soften: 0.2,
    reach: [1.3, 1.7],
    wrap: 0,
    casters: 'local',
  },
  // What the pale blind scatters down into the room ("Window reflected corner fill"): a soft cool emitter in front of
  // its slats, over the monitor's top onto the chair's seat and the boards before the desk, which the monitor and the
  // desk keep the window's own light from.
  {
    name: 'blind-scatter',
    kind: 'spot',
    space: 'scene',
    position: [-1.3, 2.3, -1.9],
    target: [-1.3, 0.3, -0.9],
    color: [1.2, 1.5, 1.9],
    size: 0.4,
    samples: [3, 2],
    cone: [0.2, 0.4],
    soften: 2,
    reach: [2.6, 3.4],
    wrap: 0,
    casters: 'local',
  },
  // The monitor's own glow ("Windows CRT screen bounce"): a small cool emitter just in front of the glass, down onto the
  // keyboard and out at the chair. The keys stand in the monitor's shadow from every other light.
  {
    name: 'crt',
    kind: 'spot',
    space: 'scene',
    position: [-1.34, 1.07, -1.6],
    target: [-1.34, 0.72, -1.1],
    color: [0.05, 0.085, 0.1],
    size: 0.12,
    samples: [3, 2],
    cone: [1.0, 1.4],
    soften: 0.05,
    reach: [0.6, 1.6],
    wrap: 0,
    casters: 'local',
    clear: 0.07,
  },
  // The night on the window itself ("Blue hour window fill"): the same emitter, on what stands within half a metre of
  // the glass. The slats are thin and pale, so they glow with what falls on their backs (`wrap`), and carry the shadows
  // of the sashes' bars behind them (`through`); the reveal and the jamb take it on their faces.
  {
    name: 'moon-on-blind',
    kind: 'spot',
    space: 'scene',
    position: MOON,
    target: [-1.3, 1.9, -2.36],
    color: [0.75, 0.84, 1.0],
    size: 0.25,
    samples: [4, 2],
    cone: [0.8, 1.1],
    soften: 0,
    reach: [1.6, 1.95],
    wrap: 1,
    casters: 'local',
    through: 0.05,
    portal: { center: [-1.3, 1.8235, -2.405], u: [0.8, 0, 0], v: [0, 0.6965, 0] },
  },
  // And the room's own light on the blind's face: the slats glow a little, the rest of the wall does not.
  {
    name: 'blind',
    kind: 'sun',
    space: 'scene',
    position: [-1.3, 2.1, 0.4],
    target: [-1.3, 2.12, -2.4],
    color: [0.22, 0.21, 0.23],
    size: 0.2,
    samples: [2, 2],
    soften: 0,
    wrap: 0.3,
    casters: 'local',
    extent: 1.6,
    portal: { center: [-1.3, 1.811, -2.17], u: [0.87, 0, 0], v: [0, 0.78, 0] },
  },
  // The opal lamp beside the TV: a sphere light, as atmosphere/tvLamp.ts drew it every frame.
  {
    name: 'opal',
    kind: 'omni',
    space: 'finish',
    position: TV_LAMP.center,
    target: TV_LAMP.center,
    color: [1, 1, 1],
    size: 0.075,
    samples: [3, 1],
    soften: 0.04,
    reach: [1.4, 2.0],
    wrap: 0.1,
    casters: 'local',
  },
  // The bare bulb on the cabinet's other end, dimmed (atmosphere/bulbLamp.ts): a point of light a hand above the
  // top, so the set's shadow is crisp. The lamp itself, its flex and its switch are inside `clear` and shade nothing
  // of it: what its holder would shade lies under its own base, and a base's edge drawn on the top's few texels
  // would be a ring of teeth around its foot.
  {
    name: 'bulb',
    kind: 'omni',
    space: 'finish',
    position: BULB.filament,
    target: BULB.filament,
    // Its intensity against the opal lamp's (BULB_LAMP_INTENSITY / TV_LAMP_INTENSITY): they share its colour.
    color: [0.6, 0.6, 0.6],
    size: 0.006,
    samples: [1, 1],
    soften: 0.06,
    reach: [1.0, 1.6],
    wrap: 0,
    casters: 'local',
    clear: 0.185,
  },
];
