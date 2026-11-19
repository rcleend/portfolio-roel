import type { Vec3 } from '../kit/builder';
import type { MeshName } from './types';

/**
 * The CD player's measurements (docs/ROOM.md › The CD player): the constants props/radio.ts builds the machine from,
 * and `RADIO_SPEC`, what the deck needs of them (hinge, rocker, key travel, turntable, slot, well, display, lamp,
 * bounds). One module for both, so the geometry and the mechanism cannot drift; it is plain numbers, so the room's
 * main thread can read the spec without the generators (GeneratedRadio.ts).
 */

export type Pt = readonly [number, number];

export const X0 = 1.015;
export const HINGE: Vec3 = [1.1115, 1.044, -2.161];
/** The top deck rises towards the front: metres a metre. The lid lies in it. */
export const DECK_SLOPE = 0.1718;
export const DECK_TILT = Math.atan(DECK_SLOPE);
export const LID = { minX: 1.0105, maxX: 1.2125, frontZ: -1.9386, thickness: 0.003 };
/** The well floor's plane: y = a·x + b·z + c. It rises 5.7° towards the front. */
export const FLOOR: Vec3 = [-0.00188, 0.100566, 1.248019];
export const SEAT: Vec3 = [1.11151, 1.04476, -2.0404];
export const LCD = {
  min: [0.9862, 1.0529],
  max: [1.0436, 1.0692],
  z: -1.89019,
  normal: [0.00005, 0.22824, 0.97361],
} as const;
/** The transport keys' face plane: z = frontZ − 0.0002 − slope · (y − minY) (deckLayout.ts › keyFaceZ). */
export const KEY_FACE = { frontZ: -1.883, slope: 0.228, minY: 1.035 };
export const CLUSTER = {
  centre: [1.10115, 1.0558] as Pt,
  /** The rocker's and the side keys' outer radius, the side arcs' centre offset and radius, and the gap between keys. */
  rockerRadius: 0.0213,
  sideRadius: 0.02105,
  arcOffset: 0.02242,
  arcRadius: 0.01907,
  gap: 0.0005,
};
export const keyFaceZ = (y: number): number => KEY_FACE.frontZ - 0.0002 - KEY_FACE.slope * (y - KEY_FACE.minY);
export const KEY_TILT = Math.atan(KEY_FACE.slope);

/** Where two circles of the cluster meet: the outer one about the centre, a side arc's about (−offset, 0). */
export function meeting(outer: number, arc: number): Pt {
  const a = CLUSTER.arcOffset;
  const x = -(outer * outer - arc * arc + a * a) / (2 * a);
  return [x, Math.sqrt(outer * outer - x * x)];
}

export const ROCKER_CORNER = meeting(CLUSTER.rockerRadius, CLUSTER.arcRadius + CLUSTER.gap);
export const SIDE_CORNER = meeting(CLUSTER.sideRadius, CLUSTER.arcRadius);
export const KEY_COS = Math.cos(KEY_TILT);

export interface RadioSpec {
  /** The whole radio, shut: what the camera frames and a click on the body hits. */
  readonly bodyBounds: { readonly min: Vec3; readonly max: Vec3 };
  /** The front panel's centre: the room's anchor for the radio. */
  readonly anchor: Vec3;
  readonly hinge: { readonly point: Vec3; readonly axis: Vec3; readonly openDegrees: number };
  /** The shut lid: its footprint across x and its far (front, top) edge. */
  readonly lid: { readonly minX: number; readonly maxX: number; readonly frontY: number; readonly frontZ: number };
  readonly rocker: { readonly pivot: Vec3; readonly axis: Vec3; readonly tiltDegrees: number };
  readonly keyTravel: { readonly axis: Vec3; readonly metres: number };
  /** The keys' faces: the rocker's box (split at `pivotY`) and the side keys', and the faces' plane. */
  readonly keys: {
    readonly rocker: KeyBox;
    readonly pivotY: number;
    readonly previous: KeyBox;
    readonly next: KeyBox;
    readonly frontZ: number;
    readonly slope: number;
  };
  readonly turntable: { readonly centre: Vec3; readonly seatY: number; readonly normal: Vec3 };
  readonly slot: { readonly z: number; readonly minX: number; readonly maxX: number; readonly floorY: number };
  readonly well: {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
    readonly floor: Vec3;
  };
  readonly lcd: {
    readonly min: readonly [number, number];
    readonly max: readonly [number, number];
    readonly z: number;
    readonly normal: Vec3;
  };
  readonly led: { readonly point: Vec3; readonly normal: Vec3; readonly radius: number };
}

export interface KeyBox {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export const round4 = (value: number): number => Math.round(value * 1e4) / 1e4;
export const deckY = (z: number): number => HINGE[1] + DECK_SLOPE * (z - HINGE[2]);
export const floorY = (x: number, z: number): number => FLOOR[0] * x + FLOOR[1] * z + FLOOR[2];
export const FLOOR_NORMAL: Vec3 = [0.00187, 0.99498, -0.10006];

export const RADIO_SPEC: RadioSpec = {
  bodyBounds: { min: [0.735, 0.887, -2.205], max: [1.295, 1.087, -1.865] },
  anchor: [X0, 1.0, -1.865],
  hinge: { point: HINGE, axis: [1, 0, 0], openDegrees: 84 },
  lid: { minX: LID.minX, maxX: LID.maxX, frontY: round4(deckY(LID.frontZ)), frontZ: LID.frontZ },
  rocker: { pivot: [CLUSTER.centre[0], CLUSTER.centre[1], -1.89034], axis: [1, 0, 0], tiltDegrees: 4 },
  keyTravel: { axis: [0, -Math.sin(KEY_TILT), -Math.cos(KEY_TILT)], metres: 0.0015 },
  keys: {
    rocker: {
      minX: round4(CLUSTER.centre[0] + ROCKER_CORNER[0]),
      maxX: round4(CLUSTER.centre[0] - ROCKER_CORNER[0]),
      minY: round4(CLUSTER.centre[1] - CLUSTER.rockerRadius * KEY_COS),
      maxY: round4(CLUSTER.centre[1] + CLUSTER.rockerRadius * KEY_COS),
    },
    pivotY: CLUSTER.centre[1],
    previous: {
      minX: round4(CLUSTER.centre[0] - CLUSTER.sideRadius),
      maxX: round4(CLUSTER.centre[0] - CLUSTER.arcOffset + CLUSTER.arcRadius),
      minY: round4(CLUSTER.centre[1] - SIDE_CORNER[1] * KEY_COS),
      maxY: round4(CLUSTER.centre[1] + SIDE_CORNER[1] * KEY_COS),
    },
    next: {
      minX: round4(CLUSTER.centre[0] + CLUSTER.arcOffset - CLUSTER.arcRadius),
      maxX: round4(CLUSTER.centre[0] + CLUSTER.sideRadius),
      minY: round4(CLUSTER.centre[1] - SIDE_CORNER[1] * KEY_COS),
      maxY: round4(CLUSTER.centre[1] + SIDE_CORNER[1] * KEY_COS),
    },
    frontZ: KEY_FACE.frontZ,
    slope: KEY_FACE.slope,
  },
  turntable: { centre: SEAT, seatY: SEAT[1], normal: FLOOR_NORMAL },
  slot: { z: -2.115, minX: 1.04, maxX: 1.18, floorY: round4(floorY(1.11, -2.115)) },
  well: { minX: 1.014, maxX: 1.209, minZ: -2.157, maxZ: -1.943, floor: FLOOR },
  lcd: LCD,
  led: { point: [0.974, 0.988, -1.88435], normal: [0, -0.1267, 0.9919], radius: 0.0015 },
};

/** The radio's meshes, each one draw call: the body, and every part the deck moves or hides. */
export const RADIO_MESHES = [
  'radio',
  'radioLid',
  'radioLidInner',
  'radioRockerTop',
  'radioRockerBottom',
  'radioPrevious',
  'radioNext',
  'radioWell',
  'radioWellCover',
] as const satisfies readonly MeshName[];
