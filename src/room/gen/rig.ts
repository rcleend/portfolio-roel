import type { Rgb, Vec3 } from './kit/builder';

/**
 * The night's light, as a table. The colours are the Blender rig's (tools/room/restyle.py › lighting); the places are
 * read off the room. Every light is static, so each is rendered once, at load, from several points of its emitter
 * (soft shadows by accumulation), into the room's light maps and vertex colours (bake/Baker.ts).
 *
 * `scene` lights are the room's own, in scene-linear light under the bake's display curve. `finish` lights are the two
 * small practicals the room's finish used to add to every pixel of every frame (atmosphere/tvLamp.ts, toyRobot.ts): the
 * opal lamp and the toy robot's eyes. They never move, so here they are baked, with real shadows, in the finish's own
 * terms, and leave the per-frame shader.
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
}

/** The opal lamp's globe and the robot's eyes, as the shipped room places them (room.glb › userData.light). */
export const TV_LAMP = { center: [2.33, 0.6014, 0.46] as Vec3, radius: 0.08 };
export const ROBOT = {
  eyes: [
    [2.549, 0.7517, -0.877],
    [2.5543, 0.7517, -0.8506],
  ] as readonly [Vec3, Vec3],
  facing: [-0.9067, 0, 0.4218] as Vec3,
  aim: [-0.7427, -0.5736, 0.3455] as Vec3,
  origin: [2.58, 0.486, -0.87] as Vec3,
  yaw: 0.5236,
};

/** The colour of the room's ambient light from above and from below (bounce off the oak). */
export const AMBIENT = { sky: [0.03, 0.034, 0.05] as Rgb, ground: [0.07, 0.06, 0.07] as Rgb };

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
    position: [0.4, 3.0, -0.5],
    target: [1.1, 0, -0.1],
    color: [5.6, 4.3, 6.0],
    size: 0.9,
    samples: [12, 6],
    cone: [0.3, 0.66],
    soften: 1.5,
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
    color: [0.75, 0.72, 0.8],
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
    color: [0.28, 0.17, 0.2],
    size: 1.0,
    samples: [8, 4],
    cone: [1.2, 1.5],
    soften: 1.5,
    wrap: 0,
    casters: 'local',
  },
  // The night through the window ("Blue hour window fill"): a small emitter outside and above it, so what it sends in
  // fans out, down onto the desk, past the desk's end onto the floor, and through the blind's slats across the rug.
  {
    name: 'moon',
    kind: 'spot',
    space: 'scene',
    position: [-1.25, 2.65, -3.4],
    target: [-0.6, 0.2, -0.9],
    color: [8, 8.4, 9.7],
    size: 0.3,
    samples: [12, 6],
    cone: [0.45, 0.62],
    soften: 0,
    reach: [5.4, 6.4],
    wrap: 0,
    casters: 'local',
    portal: { center: [-1.3, 1.82, -2.405], u: [0.8, 0, 0], v: [0, 0.7, 0] },
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
    color: [0.19, 0.028, 0.009],
    size: 0.04,
    samples: [3, 2],
    soften: 0.03,
    reach: [0.35, 0.78],
    clear: 0.3,
    wrap: 0.1,
    casters: 'local',
  },
  // The desk lamp ("Task light tungsten"): under its shade, down onto the desk and out onto the wall beside it.
  {
    name: 'desk',
    kind: 'omni',
    space: 'scene',
    position: [-1.94, 1.03, -2.12],
    target: [-1.94, 1.03, -2.12],
    color: [0.5, 0.17, 0.04],
    size: 0.03,
    samples: [3, 2],
    soften: 0.03,
    reach: [0.35, 1.2],
    wrap: 0,
    casters: 'local',
  },
  // The night sky on the blind ("Blue hour window fill"): the slats glow, the rest of the wall does not.
  {
    name: 'blind',
    kind: 'sun',
    space: 'scene',
    position: [-1.3, 2.1, 0.4],
    target: [-1.3, 2.12, -2.4],
    color: [0.62, 0.6, 0.63],
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
    samples: [4, 2],
    soften: 0.04,
    reach: [1.4, 2.0],
    wrap: 0.1,
    casters: 'local',
  },
  // The toy robot's eyes: two torch bulbs behind lenses, as atmosphere/toyRobot.ts drew them every frame.
  ...ROBOT.eyes.map(
    (eye, index): RigLight => ({
      name: `eye-${index}`,
      kind: 'spot',
      space: 'finish',
      position: eye,
      target: [eye[0] + ROBOT.aim[0], eye[1] + ROBOT.aim[1], eye[2] + ROBOT.aim[2]],
      // An eye's intensity against the lamp's (TOY_ROBOT_EYE_INTENSITY / TV_LAMP_INTENSITY): they share its colour.
      color: [0.25, 0.25, 0.25],
      size: 0.004,
      samples: [3, 2],
      cone: [1.2, 1.35],
      soften: 0.0001,
      reach: [0.9, 1.5],
      wrap: 0,
      beam: { aim: ROBOT.aim, cos: [0.55, 0.97], floor: 0.1, facing: ROBOT.facing },
      casters: 'local',
    }),
  ),
];
