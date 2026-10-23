import { MathUtils, Vector3 } from 'three';
import { fovForAspect, type Viewpoint } from './cameraPath';

/** The Blender review's "whole room" preset: window, desk, posters and the TV in one shot. */
const ROOM_WIDE = { eye: new Vector3(-0.55, 1.62, 2.1), target: new Vector3(0.25, 1.12, -1.1), minHorizontalFov: 72 };
/**
 * A tall screen cannot hold the whole room, and the TV must stay in shot to be clicked
 * back into, so portrait turns towards the TV corner: lava lamp, guitar, TV and console.
 */
const ROOM_TALL = { eye: new Vector3(-0.25, 1.5, 2.25), target: new Vector3(1.55, 0.85, -0.6), minHorizontalFov: 50 };
const ROOM_FOV = 64;
const ROOM_MAX_FOV = 84;
/** Aspect ratios between which the room view blends from the tall to the wide framing. */
const ROOM_TALL_ASPECT = 0.62;
const ROOM_WIDE_ASPECT = 1.15;

/** The whole-room overview for a viewport of this aspect (width / height). */
export function roomViewpoint(aspect: number): Viewpoint {
  const wide = MathUtils.smoothstep(aspect, ROOM_TALL_ASPECT, ROOM_WIDE_ASPECT);
  const minHorizontalFov = MathUtils.lerp(ROOM_TALL.minHorizontalFov, ROOM_WIDE.minHorizontalFov, wide);
  return {
    position: ROOM_TALL.eye.clone().lerp(ROOM_WIDE.eye, wide),
    target: ROOM_TALL.target.clone().lerp(ROOM_WIDE.target, wide),
    fov: fovForAspect(ROOM_FOV, minHorizontalFov, aspect, ROOM_MAX_FOV),
  };
}
