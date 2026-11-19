import { Box3, type Mesh, type Object3D, Vector3 } from 'three';
import { RADIO_SPEC } from '../gen/props/radioSpec';

/**
 * Facts about the CD player on the cabinet that the room needs on its first load: where to click and where the radio
 * sits on the page. They are the generated radio's own measurements (gen/props/radioSpec.ts, plain numbers). What
 * frames the open lid loads with the radio's deck (radioFraming.ts › LID_FRAMING).
 */

/** The radio's `room.anchors` point: its front panel centre (world space, metres). */
export const RADIO_ANCHOR = new Vector3(...RADIO_SPEC.anchor);

export interface RadioModel {
  /** The generated radio's node: the body and its parts on their pivots. */
  readonly root: Object3D;
  /** The radio's outline; the camera frames it and a proxy box over it takes clicks. */
  readonly bodyBounds: Box3;
  /** World-space unit vector the radio's front faces. */
  readonly facing: Vector3;
  /** The lava lamp beside it, which must stay out of the radio view so that view can rest at zero frames. */
  readonly lampBounds: Box3;
  /** The cabinet the radio and the lamp stand on. */
  readonly cabinet: Mesh | null;
}

/** The radio as the room's first load knows it: its node and surroundings, around the spec's bounds. */
export function radioModelOf(root: Object3D, cabinet: Mesh | null, lampBounds: Box3): RadioModel {
  const { min, max } = RADIO_SPEC.bodyBounds;
  return {
    root,
    bodyBounds: new Box3(new Vector3(...min), new Vector3(...max)),
    facing: new Vector3(0, 0, 1),
    lampBounds,
    cabinet,
  };
}
