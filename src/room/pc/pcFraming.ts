import { Vector3 } from 'three';
import type { Viewpoint } from '../camera/cameraPath';
import { FULL_VIEWPORT, frameSubject } from '../camera/framing';
import type { GlassPlane } from './glassPlane';

/**
 * Where the camera rests in front of the computer: dead straight at the glass (zero pitch, yaw
 * and roll), so the picture is an axis-aligned rectangle on the page that a flat DOM element can
 * cover with a 2D translate, no matrix3d.
 */

/** The bezel band framed around the glass: a little of the shell at the sides and top, the chin below. */
const BEZEL_SIDE = 0.018;
const BEZEL_TOP = 0.018;
const BEZEL_CHIN = 0.03;
const MARGIN = 0.02;
/** A long lens flattens the monitor into a straight-on screen, like the TV's product shot. */
const PC_FOV = 30;
const PC_MAX_FOV = 70;
/**
 * Beyond this eye-to-glass distance a portrait framing would back the camera into the chair;
 * widen the lens instead. Keeps the eye at least 22 cm in front of the chair back.
 */
const PC_MAX_DISTANCE = 0.72;

const WORLD_UP = new Vector3(0, 1, 0);

export interface PcFramingModel {
  /** World-space unit vector the glass faces. */
  readonly facing: Vector3;
  /** The plane the glass rim sits on. */
  readonly rim: GlassPlane;
}

/**
 * Framing insets are deliberately ignored: the touch pad that causes them is hidden away from
 * the TV, so the monitor uses the whole viewport.
 */
export function pcViewpoint(model: PcFramingModel, aspect: number): Viewpoint {
  const { rim } = model;
  const z = rim.z;
  const points = [
    new Vector3(rim.minX - BEZEL_SIDE, rim.maxY + BEZEL_TOP, z),
    new Vector3(rim.maxX + BEZEL_SIDE, rim.maxY + BEZEL_TOP, z),
    new Vector3(rim.minX - BEZEL_SIDE, rim.minY - BEZEL_CHIN, z),
    new Vector3(rim.maxX + BEZEL_SIDE, rim.minY - BEZEL_CHIN, z),
  ];
  const direction = model.facing.clone().negate();
  const frame = (fovY: number) =>
    frameSubject({ points, direction, up: WORLD_UP, fovY, aspect, region: FULL_VIEWPORT, margin: MARGIN });
  let fov = PC_FOV;
  let pose = frame(fov);
  while (pose.position.distanceTo(pose.target) > PC_MAX_DISTANCE && fov < PC_MAX_FOV) {
    fov += 1;
    pose = frame(fov);
  }
  return { position: pose.position, target: pose.target, fov };
}
