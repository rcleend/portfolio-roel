import { Vector3 } from 'three';
import { easeInOutCubic } from '../motion/easing';

/** A camera pose plus its vertical field of view in degrees. */
export interface Viewpoint {
  readonly position: Vector3;
  readonly target: Vector3;
  readonly fov: number;
}

/** Eased progress (0–1) of each part of a pose, so the look-at can lead or trail the position. */
export interface FlightProgress {
  readonly position: number;
  readonly target: number;
  readonly fov: number;
}

/**
 * The position's quadratic Bézier: either an arc lifted by `lift` metres at its middle, or an
 * explicit control point (e.g. a crane rising over the chair before settling onto the desk).
 */
export type FlightPath = { readonly lift: number } | { readonly control: Vector3 };

/** Rise above the higher eye before settling onto the desk, so the camera clears the chair back. */
const CRANE_RISE = 0.05;
/** Share of a device leg the look-at needs to turn; the rest is a pure dolly. */
const LOOK_LEAD = 0.82;

/** A flight to a device view (the computer, the radio) or from a settled one. */
export type DeviceLeg = 'arriving' | 'departing';

/** The views a visitor sits down at: flights to them lead with the look-at, flights from them stand up first. */
export type FlightEnd = 'tv' | 'room' | 'pc' | 'radio';

/**
 * How a flight moves. `lead`: arriving at the computer or the radio the look-at leads; leaving a settled one, the
 * camera stands up first (arriving wins when both apply). `crane`: which end of the flight is the computer, whose
 * legs crane over the chair; every other leg, the radio's included, takes the house arc. `from` is null mid-flight.
 */
export function flightShape(
  from: FlightEnd | null,
  to: FlightEnd,
): { lead: DeviceLeg | null; crane: DeviceLeg | null } {
  const device = (view: FlightEnd | null) => view === 'pc' || view === 'radio';
  const lead: DeviceLeg | null = device(to) ? 'arriving' : device(from) ? 'departing' : null;
  const crane: DeviceLeg | null = to === 'pc' ? 'arriving' : from === 'pc' ? 'departing' : null;
  return { lead, crane };
}

/**
 * Pose at `progress` between two viewpoints. Pulling back from the TV rises like a dolly on a
 * crane rather than sliding along a straight rail.
 */
export function interpolateViewpoint(
  from: Viewpoint,
  to: Viewpoint,
  progress: FlightProgress,
  path: FlightPath,
): Viewpoint {
  const control = 'control' in path ? path.control.clone() : arcControl(from.position, to.position, path.lift);
  const t = progress.position;
  const a = from.position.clone().lerp(control, t);
  const b = control.clone().lerp(to.position, t);
  return {
    position: a.lerp(b, t),
    target: from.target.clone().lerp(to.target, progress.target),
    fov: from.fov + (to.fov - from.fov) * progress.fov,
  };
}

/** The same eased value for every part of the pose: the motion every TV ↔ room flight uses. */
export function uniformProgress(t: number): FlightProgress {
  return { position: t, target: t, fov: t };
}

/**
 * Control point for a flight to or from the computer: halfway across, a little above the higher
 * eye, and as deep as the eye at the desk. The camera rises first and then settles down onto the
 * desk from above, like sitting down at the computer, instead of skimming over the chair back.
 */
export function craneControl(pcEye: Vector3, otherEye: Vector3): Vector3 {
  return new Vector3((pcEye.x + otherEye.x) / 2, Math.max(pcEye.y, otherEye.y) + CRANE_RISE, pcEye.z);
}

/**
 * Eased progress of a flight to or from a device (the computer, the radio) at linear time `t`. Arriving, the
 * look-at leads and is already on its target for the last 18 % of the flight, so the hand-off to the live screen
 * or controls happens on a pure settle with no rotation; departing, the camera stands up first and then looks round.
 */
export function deviceLegProgress(t: number, leg: DeviceLeg): FlightProgress {
  const eased = easeInOutCubic(t);
  const look = leg === 'arriving' ? Math.min(1, t / LOOK_LEAD) : Math.max(0, (t - (1 - LOOK_LEAD)) / LOOK_LEAD);
  return { position: eased, target: easeInOutCubic(look), fov: eased };
}

function arcControl(from: Vector3, to: Vector3, lift: number): Vector3 {
  const control = from.clone().lerp(to, 0.5);
  control.y += lift * 2; // A quadratic Bézier reaches half its control offset at t = 0.5.
  return control;
}

/** Vertical FOV that shows at least `minHorizontalFov` degrees across, within [min, max]. */
export function fovForAspect(baseFov: number, minHorizontalFov: number, aspect: number, maxFov: number): number {
  const needed = (2 * Math.atan(Math.tan((minHorizontalFov * Math.PI) / 360) / aspect) * 180) / Math.PI;
  return Math.min(maxFov, Math.max(baseFov, needed));
}

export function cloneViewpoint(v: Viewpoint): Viewpoint {
  return { position: v.position.clone(), target: v.target.clone(), fov: v.fov };
}
