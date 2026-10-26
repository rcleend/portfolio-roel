import { Box3, type Mesh, type Object3D, Vector3 } from 'three';

/**
 * Facts about the CD player on the cabinet (radio-base.glb, room.glb's `04_Drawer`, room revision 6) that the room
 * needs on its first load: where to click and where the hotspot points. Bounds are found at runtime. What frames the
 * open lid loads with the radio's deck (radioFraming.ts › LID_FRAMING).
 */

/** `userData.interaction_id` of the radio's meshes. */
export const RADIO_INTERACTION_ID = 'radio-controls';
const CABINET_NAME = '04_Drawer_surfaces';

/** Where the hotspot and the edge chip point: the radio's front panel centre (world space, glTF metres). */
export const RADIO_ANCHOR = new Vector3(1.015, 1.0, -1.865);

export interface RadioModel {
  /** The radio-base.glb scene: the seven baked meshes. */
  readonly root: Object3D;
  readonly meshes: readonly Mesh[];
  /** The radio's outline; the camera frames it and a proxy box over it takes clicks. */
  readonly bodyBounds: Box3;
  /** World-space unit vector the radio's front faces. */
  readonly facing: Vector3;
  /** The lava lamp beside it (LavaLamp's bounds), which must stay out of the radio view so that view can rest at zero frames. */
  readonly lampBounds: Box3;
  /** The cabinet the radio and the lamp stand on (merged with the floor books and the radio's mains cable). */
  readonly cabinet: Mesh | null;
}

/** Finds the radio and its surroundings in the loaded assets; null when the radio is missing. */
export function locateRadio(radioRoot: Object3D | undefined, roomRoot: Object3D, lampBounds: Box3): RadioModel | null {
  if (!radioRoot) return null;
  radioRoot.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  radioRoot.traverse((object) => {
    if ((object as Mesh).isMesh && object.userData.interaction_id === RADIO_INTERACTION_ID) meshes.push(object as Mesh);
  });
  if (meshes.length === 0) return null;
  const bodyBounds = new Box3();
  for (const mesh of meshes) bodyBounds.expandByObject(mesh);
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
