import { Box3, MathUtils, type Mesh, type Object3D, Vector3 } from 'three';

/**
 * Facts about the CD player on the cabinet (radio-base.glb, room.glb's `04_Drawer`, room revision 6) that the room
 * needs before the radio's close-up has loaded: the camera must frame the open lid on the flight's first frame.
 * Bounds are found at runtime; the lid is the close-up build's measurement (tools/room/radio_closeup.py).
 */

/** `userData.interaction_id` of the radio's meshes. */
export const RADIO_INTERACTION_ID = 'radio-controls';
const CABINET_NAME = '04_Drawer_surfaces';

/** World-space measurements of the radio (glTF metres); see tools/room/radio-closeup.json. */
export const RADIO_GEOMETRY = {
  /** The lid swings about an x-parallel axis along its lower back edge. */
  hinge: { y: 1.044, z: -2.161 },
  openDegrees: 84,
  /** The closed lid: its footprint across x and its far (front, top) edge. */
  lid: { minX: 1.01, maxX: 1.213, frontY: 1.0822, frontZ: -1.9386 },
  /** Where the hotspot and the edge chip point: the front panel's centre. */
  anchor: new Vector3(1.015, 1.0, -1.865),
} as const;

/** Points of the open lid's far edge make the camera keep it in frame; this is the closed lid's, rotated. */
export function openLidCorners(degrees: number = RADIO_GEOMETRY.openDegrees): Vector3[] {
  const { hinge, lid } = RADIO_GEOMETRY;
  const angle = MathUtils.degToRad(degrees);
  const dy = lid.frontY - hinge.y;
  const dz = lid.frontZ - hinge.z;
  const far = new Vector3(
    0,
    hinge.y + dy * Math.cos(angle) + dz * Math.sin(angle),
    hinge.z - dy * Math.sin(angle) + dz * Math.cos(angle),
  );
  return [lid.minX, lid.maxX].flatMap((x) => [new Vector3(x, hinge.y, hinge.z), far.clone().setX(x)]);
}

export interface RadioModel {
  /** The radio-base.glb scene: the seven baked meshes. */
  readonly root: Object3D;
  readonly meshes: readonly Mesh[];
  /** The radio's outline; the camera frames it and a proxy box over it takes clicks. */
  readonly bodyBounds: Box3;
  /** World-space unit vector the radio's front faces. */
  readonly facing: Vector3;
  /** The lava lamp beside it, which must stay out of the radio view so that view can rest at zero frames. */
  readonly lampBounds: Box3;
  /** The cabinet the radio and the lamp stand on (merged with the floor books and the radio's mains cable). */
  readonly cabinet: Mesh | null;
}

/** Finds the radio and its surroundings in the loaded assets; null when the radio is missing. */
export function locateRadio(radioRoot: Object3D | undefined, roomRoot: Object3D): RadioModel | null {
  if (!radioRoot) return null;
  radioRoot.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  radioRoot.traverse((object) => {
    if ((object as Mesh).isMesh && object.userData.interaction_id === RADIO_INTERACTION_ID) meshes.push(object as Mesh);
  });
  if (meshes.length === 0) return null;
  const bodyBounds = new Box3();
  for (const mesh of meshes) bodyBounds.expandByObject(mesh);
  const lampBounds = new Box3();
  roomRoot.updateMatrixWorld(true);
  // Exactly what LavaLamp ticks for: a lamp whose bounds are out of the frustum costs nothing.
  roomRoot.traverse((object) => {
    if (object.userData.supplied_asset === 'lava') lampBounds.expandByObject(object);
  });
  const cabinet = roomRoot.getObjectByName(CABINET_NAME);
  return {
    root: radioRoot,
    meshes,
    bodyBounds,
    facing: new Vector3(0, 0, 1),
    lampBounds,
    cabinet: cabinet && (cabinet as Mesh).isMesh ? (cabinet as Mesh) : null,
  };
}
