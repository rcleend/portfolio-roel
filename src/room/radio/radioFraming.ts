import { type Box3, MathUtils, Quaternion, Vector3 } from 'three';
import type { Viewpoint } from '../camera/cameraPath';
import { boxCorners, frameSubject, regionFromInsets } from '../camera/framing';
import { DISC_RADIUS, type DiscSlot, discSlots, STACK_BELOW_ASPECT } from './discLayout';

/** The radio's lid in world space (glTF metres), the close-up build's measurement (tools/room/radio-closeup.json). */
export const LID_FRAMING = {
  /** The lid swings about an x-parallel axis along its lower back edge. */
  hinge: { y: 1.044, z: -2.161 },
  openDegrees: 84,
  /** The closed lid: its footprint across x and its far (front, top) edge. */
  lid: { minX: 1.01, maxX: 1.213, frontY: 1.0822, frontZ: -1.9386 },
} as const;

/** Points of the open lid's far edge make the camera keep it in frame; this is the closed lid's, rotated. */
export function openLidCorners(degrees: number = LID_FRAMING.openDegrees): Vector3[] {
  const { hinge, lid } = LID_FRAMING;
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

/**
 * Where the camera rests at the CD player: straight at the radio's front, pitched 24° down so the open well,
 * the lid and the floating discs read in one frame, never showing the lava lamp (so the view can rest at zero
 * frames). Pure.
 */

export const RADIO_PITCH_DEGREES = 24;
const MARGIN = 0.05;
/** A long lens flattens the radio into a product shot, like the TV and the computer. */
const RADIO_FOV = 30;
const RADIO_MAX_FOV = 50;
/** Beyond this eye-to-target distance a portrait framing would back into the room; widen the lens instead. */
const RADIO_MAX_DISTANCE = 1.25;
/** The lamp must lie this far beyond the frame's left edge (NDC), clear of a 2 % band. */
const LAMP_CLEARANCE_NDC = -1.04;
/** Portrait screens frame the CD half of the radio, its LCD and keys; the left speaker and the feet are cropped. */
const PORTRAIT_CROP = { minX: 0.93, maxX: 1.245, minY: 1.02 };
/** Each slot as a ring of this radius in its plane: the disc at attention scale (×1.06) plus 2 mm. */
const SLOT_RING_RADIUS = DISC_RADIUS * 1.06 + 0.002;
const SLOT_RING_POINTS = 12;

const WORLD_UP = new Vector3(0, 1, 0);

export interface RadioFramingModel {
  /** World-space unit vector the radio's front faces. */
  readonly facing: Vector3;
  readonly bodyBounds: Box3;
  readonly lampBounds: Box3;
}

export interface FramingViewport {
  readonly width: number;
  readonly height: number;
}

/** CSS px the app's controls cover at the radio (the touch transport bar); the radio is framed clear of them. */
export interface ControlInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** The view direction: the radio's facing negated, pitched down. */
export function radioDirection(facing: Vector3): Vector3 {
  const pitch = MathUtils.degToRad(RADIO_PITCH_DEGREES);
  return facing
    .clone()
    .negate()
    .multiplyScalar(Math.cos(pitch))
    .add(new Vector3(0, -Math.sin(pitch), 0))
    .normalize();
}

/** The orientation a slot's disc rests in: label facing +z, turned by `yaw`, its top leaning back by `tilt`. */
export function slotOrientation(slot: DiscSlot, target = new Quaternion()): Quaternion {
  const yaw = new Quaternion().setFromAxisAngle(WORLD_UP, slot.yaw);
  const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -slot.tilt);
  return target.copy(yaw).multiply(tilt);
}

/** Points a framing must keep in view for one slot: a ring around the disc at its attention size. */
export function slotRing(slot: DiscSlot, radius = SLOT_RING_RADIUS): Vector3[] {
  const orientation = slotOrientation(slot);
  const points: Vector3[] = [];
  for (let k = 0; k < SLOT_RING_POINTS; k++) {
    const angle = (2 * Math.PI * k) / SLOT_RING_POINTS;
    points.push(
      new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
        .applyQuaternion(orientation)
        .add(slot.position),
    );
  }
  return points;
}

export interface RadioViewpoint extends Viewpoint {
  /** How far the eye and target were moved along +x to keep the lamp out of shot (m). */
  readonly truck: number;
}

/**
 * Frames the radio body (its CD half on portrait screens), the open lid and every disc slot into the viewport less
 * the control insets, then trucks right just enough that the lava lamp's bounds lie beyond the frame's left edge.
 */
export function radioViewpoint(
  model: RadioFramingModel,
  slots: readonly DiscSlot[],
  viewport: FramingViewport,
  insets: ControlInsets,
): RadioViewpoint {
  const aspect = viewport.width / viewport.height;
  const direction = radioDirection(model.facing);
  const region = regionFromInsets(viewport, insets);
  const body = model.bodyBounds;
  const subjectBox =
    aspect >= STACK_BELOW_ASPECT
      ? boxCorners(body.min, body.max)
      : boxCorners(
          new Vector3(Math.max(body.min.x, PORTRAIT_CROP.minX), Math.max(body.min.y, PORTRAIT_CROP.minY), body.min.z),
          new Vector3(Math.min(body.max.x, PORTRAIT_CROP.maxX), body.max.y, body.max.z),
        );
  const points = [...subjectBox, ...openLidCorners(), ...slots.flatMap((slot) => slotRing(slot))];
  let fov = RADIO_FOV;
  const frame = (fovY: number) =>
    frameSubject({ points, direction, up: WORLD_UP, fovY, aspect, region, margin: MARGIN });
  let pose = frame(fov);
  while (pose.position.distanceTo(pose.target) > RADIO_MAX_DISTANCE && fov < RADIO_MAX_FOV) {
    fov += 1;
    pose = frame(fov);
  }
  const truck = lampTruck(
    pose.position,
    direction,
    fov,
    aspect,
    boxCorners(model.lampBounds.min, model.lampBounds.max),
  );
  const shift = new Vector3(truck, 0, 0);
  return { position: pose.position.clone().add(shift), target: pose.target.clone().add(shift), fov, truck };
}

/** The camera's resting pose at the radio for `discs` slots clear of `insets`, as CameraRig asks for it per viewport. */
export function radioPoseSolver(
  model: RadioFramingModel,
  discs: number,
  insets: ControlInsets,
): (viewport: FramingViewport) => Viewpoint {
  return ({ width, height }) => {
    const { position, target, fov } = radioViewpoint(
      model,
      discSlots(discs, width / height),
      { width, height },
      insets,
    );
    return { position, target, fov };
  };
}

/** The sideways move (+x, m) that puts every lamp corner beyond NDC x = −1.04; 0 when it already is. */
export function lampTruck(
  eye: Vector3,
  direction: Vector3,
  fov: number,
  aspect: number,
  lamp: readonly Vector3[],
): number {
  const forward = direction.clone().normalize();
  const right = new Vector3().crossVectors(forward, WORLD_UP).normalize();
  const tanX = Math.tan(MathUtils.degToRad(fov) / 2) * aspect;
  let truck = 0;
  const relative = new Vector3();
  for (const corner of lamp) {
    relative.subVectors(corner, eye);
    const depth = relative.dot(forward);
    if (depth <= 0) continue;
    const ndcX = relative.dot(right) / (depth * tanX);
    truck = Math.max(truck, (ndcX - LAMP_CLEARANCE_NDC) * depth * tanX);
  }
  return truck;
}
