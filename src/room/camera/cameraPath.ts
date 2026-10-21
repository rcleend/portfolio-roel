import { Vector3 } from 'three';

/** A camera pose plus its vertical field of view in degrees. */
export interface Viewpoint {
  readonly position: Vector3;
  readonly target: Vector3;
  readonly fov: number;
}

/**
 * Pose at progress `t` (0–1, already eased) between two viewpoints. The position follows a
 * quadratic arc lifted by `lift` metres at its middle, so pulling back from the TV rises
 * like a dolly on a crane rather than sliding along a straight rail.
 */
export function interpolateViewpoint(from: Viewpoint, to: Viewpoint, t: number, lift: number): Viewpoint {
  const control = from.position.clone().lerp(to.position, 0.5);
  control.y += lift * 2; // A quadratic Bézier reaches half its control offset at t = 0.5.
  const a = from.position.clone().lerp(control, t);
  const b = control.clone().lerp(to.position, t);
  return {
    position: a.lerp(b, t),
    target: from.target.clone().lerp(to.target, t),
    fov: from.fov + (to.fov - from.fov) * t,
  };
}

/** Vertical FOV that shows at least `minHorizontalFov` degrees across, within [min, max]. */
export function fovForAspect(baseFov: number, minHorizontalFov: number, aspect: number, maxFov: number): number {
  const needed = (2 * Math.atan(Math.tan((minHorizontalFov * Math.PI) / 360) / aspect) * 180) / Math.PI;
  return Math.min(maxFov, Math.max(baseFov, needed));
}

export function cloneViewpoint(v: Viewpoint): Viewpoint {
  return { position: v.position.clone(), target: v.target.clone(), fov: v.fov };
}
