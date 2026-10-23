import { type Box3, Vector3 } from 'three';
import type { Viewpoint } from '../camera/cameraPath';
import { type CameraPose, FULL_VIEWPORT, frameSubject } from '../camera/framing';
import { type GlassPlane, planeCentre, planeCorners } from './glassPlane';

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
/**
 * Room left in frame beyond the shell, on both sides of it, as a fraction of the frame. Clicking
 * outside the computer is one way to get up from it, so there must always be some room to click.
 */
const ROOM_MARGIN = 0.06;
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
  /** The CRT shell around the glass: whatever the frame shows beyond it is room. */
  readonly shellBounds: Box3;
}

/**
 * The glass and its bezel band fill the frame, unless that leaves no room around the shell:
 * wide screens see the room beside the monitor and tall ones above it, but in between (4:3, 5:4,
 * a window that is not maximised) the shell would fill the frame edge to edge. There the eye
 * steps back until the room shows beside or above the shell, whichever keeps the picture larger.
 *
 * Framing insets are deliberately ignored: the touch pad that causes them is hidden away from
 * the TV, so the monitor uses the whole viewport.
 */
export function pcViewpoint(model: PcFramingModel, aspect: number): Viewpoint {
  const { rim, shellBounds: shell, facing } = model;
  const band: GlassPlane = {
    minX: rim.minX - BEZEL_SIDE,
    maxX: rim.maxX + BEZEL_SIDE,
    minY: rim.minY - BEZEL_CHIN,
    maxY: rim.maxY + BEZEL_TOP,
    z: rim.z,
  };
  const axis = planeCentre(band);
  // The shell's front, symmetric about the glass, so every framing below looks down the same line
  // and they differ only in how far back the eye stands. Upwards only its top counts: it stands on
  // the desk, and the room above it is what a tall frame shows.
  const front = shell.max.z;
  const halfWidth = Math.max(axis.x - shell.min.x, shell.max.x - axis.x);
  const halfHeight = Math.max(shell.max.y - axis.y, 0);
  const besideShell = [new Vector3(axis.x - halfWidth, axis.y, front), new Vector3(axis.x + halfWidth, axis.y, front)];
  const aboveShell = [new Vector3(axis.x, axis.y - halfHeight, front), new Vector3(axis.x, axis.y + halfHeight, front)];
  const direction = facing.clone().negate();
  /** How far the eye stands back from the glass along its line of sight. */
  const reach = (pose: CameraPose): number => pose.position.clone().sub(axis).dot(facing);

  const frame = (fovY: number): CameraPose => {
    const framing = (points: readonly Vector3[], margin: number): CameraPose =>
      frameSubject({ points, direction, up: WORLD_UP, fovY, aspect, region: FULL_VIEWPORT, margin });
    const glass = framing(planeCorners(band), MARGIN);
    const beside = framing(besideShell, ROOM_MARGIN);
    const above = framing(aboveShell, ROOM_MARGIN);
    const room = reach(beside) <= reach(above) ? beside : above;
    return reach(glass) >= reach(room) ? glass : room;
  };
  let fov = PC_FOV;
  let pose = frame(fov);
  while (reach(pose) > PC_MAX_DISTANCE && fov < PC_MAX_FOV) {
    fov += 1;
    pose = frame(fov);
  }
  // Aimed at the glass's plane whichever subject set the distance, so the eye-to-glass distance is
  // what the rest of the room measures.
  return { position: pose.position, target: pose.position.clone().addScaledVector(direction, reach(pose)), fov };
}
