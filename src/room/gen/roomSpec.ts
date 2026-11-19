/**
 * The room's measurements as the room's own code needs them (docs/ROOM.md › The generated room): where the TV set, the
 * computer, the lamps and the view outside are, in world metres. Plain numbers and nothing else, like
 * `props/radioSpec.ts`, so the room's main thread reads them without the generators, and tests build their fixtures
 * from them. `gen.test.ts` holds the generators (props/tvSet.ts, deskCorner.ts, cabinetLamps.ts, rig.ts) to these.
 */
type Vec3 = readonly [number, number, number];
interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

/**
 * The CRT television on the white cabinet, facing −x (docs/ROOM.md › TV geometry contract). Its glass is a display
 * mesh made on the main thread (tv/tvGlass.ts): a grid whose 0–1 UV square is a planar projection across the tube,
 * v = 0 at the top, bulging towards the viewer by `bulge` at its middle (a parabola each way).
 */
export const TV_SPEC = {
  /** The whole set, plinth and rear shell included. */
  bounds: { min: [2.153, 0.486, -0.625], max: [2.657, 1.076, -0.015] } as Box,
  facing: [-1, 0, 0] as Vec3,
  glass: {
    /** The UV square: u runs along +z (left to right for the viewer), v down from `top`. */
    left: -0.61143,
    right: -0.02857,
    top: 1.0578,
    bottom: 0.61377,
    /** x at the middle of the glass, and how much further back its side and its top edges' middles are. */
    front: 2.1593,
    bulge: [0.0162, 0.0088] as readonly [number, number],
    columns: 16,
    rows: 12,
  },
  /** The power LED's lens, proud of the front panel beside the POWER button. */
  led: [2.152, 0.5535, -0.499] as Vec3,
} as const;

/**
 * The beige desktop set on the desk, facing +z. The monitor's glass is a display mesh made on the main thread
 * (pc/pcGlass.ts): planar UVs with v = 0 at the top, its rim on the plane `rimZ` and its middle `bulge` nearer.
 */
export const PC_SPEC = {
  glass: { minX: -1.518, maxX: -1.162, minY: 0.929, maxY: 1.213, rimZ: -1.679, bulge: 0.011, columns: 12, rows: 10 },
  /** The monitor's case and foot: the computer's outline, and where its bezel's face is (max z). */
  shell: { min: [-1.57, 0.785, -2.085], max: [-1.11, 1.268, -1.662] } as Box,
  keyboard: { min: [-1.59, 0.785, -1.605], max: [-1.1, 0.825, -1.405] } as Box,
  /** The desk top the set stands on. */
  deskTopY: 0.785,
} as const;

/** The opal lamp beside the TV: its globe, its colour and how far past white the globe itself is drawn. */
export const TV_LAMP_SPEC = {
  center: [2.33, 0.6014, 0.46] as Vec3,
  radius: 0.08,
  color: [1, 0.72, 0.46] as Vec3,
  glow: 2.8,
} as const;

/**
 * The bare-bulb lamp on the cabinet's other end, dimmed: where its base stands, the middle of its filament, and the
 * colour and glow the filament itself is drawn in (a dimmed lamp burns more orange than the opal globe).
 */
export const BULB_SPEC = {
  origin: [2.31, 0.486, -0.84] as Vec3,
  filament: [2.31, 0.666, -0.84] as Vec3,
  color: [1, 0.5, 0.2] as Vec3,
  glow: 1.5,
} as const;

/** The lava lamp on the dresser, foot to cap: what its wax ticks for and the radio view keeps out of frame. */
export const LAVA_BOUNDS: Box = { min: [0.42, 0.887, -2.04], max: [0.56, 1.39, -1.9] };

/** The view outside: a plate behind the window, which the rain's refraction samples. */
export const EXTERIOR_PLATE = { minX: -3.7, maxX: 1.1, minY: 0.1, maxY: 3.7, z: -4.5 } as const;

/**
 * The props a click acts on, by the generators' names (scene.ts › PROPS): the room picks them by their own triangles
 * (GeneratedRoom › pick meshes), never by a box.
 */
export const PICK_PROPS = {
  /** The keyboard and the mouse; the monitor is a mesh of its own. */
  pc: ['desktop'],
  desk: ['desk', 'chair', 'basket', 'tower-and-desk-lamp'],
  dresser: ['dresser'],
} as const;
