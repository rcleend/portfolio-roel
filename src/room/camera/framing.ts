import { MathUtils, Vector3 } from 'three';

/**
 * Computes a camera pose that fits a set of points into (part of) the viewport for a given
 * field of view and aspect, so the TV framing holds on any screen, portrait phones included.
 * Pure math on three's vector types; no scene or renderer involved.
 */

/** A rectangle in normalised device coordinates (-1 … 1 on both axes, +y up). */
export interface NdcRegion {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

export const FULL_VIEWPORT: NdcRegion = { left: -1, right: 1, bottom: -1, top: 1 };

export interface FramingRequest {
  /** World-space points that must all be visible, e.g. the corners of a bounding box. */
  readonly points: readonly Vector3[];
  /** Viewing direction, from the camera towards the subject. */
  readonly direction: Vector3;
  readonly up: Vector3;
  /** Vertical field of view in degrees. */
  readonly fovY: number;
  readonly aspect: number;
  /** Part of the viewport to frame into; defaults to all of it. */
  readonly region?: NdcRegion;
  /** Free space kept on each side, as a fraction of the region's width or height. */
  readonly margin: number;
}

export interface CameraPose {
  readonly position: Vector3;
  readonly target: Vector3;
}

interface Basis {
  readonly forward: Vector3;
  readonly right: Vector3;
  readonly up: Vector3;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const SEARCH_STEPS = 48;
const CENTRING_STEPS = 6;

export function frameSubject(request: FramingRequest): CameraPose {
  const { points, fovY, aspect, margin } = request;
  if (points.length === 0) throw new Error('frameSubject needs at least one point');
  const region = request.region ?? FULL_VIEWPORT;
  const basis = makeBasis(request.direction, request.up);
  const centre = points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length);
  const tanY = Math.tan(MathUtils.degToRad(fovY) / 2);
  const tanX = tanY * aspect;
  const inner = shrink(region, margin);
  const innerWidth = inner.right - inner.left;
  const innerHeight = inner.top - inner.bottom;

  // Nearest distance at which every point is still in front of the camera.
  const depthSpread = Math.max(...points.map((p) => -p.clone().sub(centre).dot(basis.forward)));
  const span = Math.max(...points.map((p) => p.distanceTo(centre)), 1e-3);
  let near = Math.max(depthSpread, 0) + span * 1e-3;
  let far = near + span * 1e4;

  const solve = (distance: number) => centredPose(points, centre, basis, distance, tanX, tanY, inner);
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (near + far) / 2;
    const { bounds } = solve(mid);
    const fits = bounds.maxX - bounds.minX <= innerWidth && bounds.maxY - bounds.minY <= innerHeight;
    if (fits) far = mid;
    else near = mid;
  }
  const { position } = solve(far);
  return { position, target: position.clone().addScaledVector(basis.forward, far) };
}

/** Where `points` land on the viewport (NDC) seen from `pose` with a vertical fov of `fovY` degrees. */
export function projectedBounds(
  points: readonly Vector3[],
  pose: CameraPose,
  up: Vector3,
  fovY: number,
  aspect: number,
): NdcRegion {
  const basis = makeBasis(pose.target.clone().sub(pose.position), up);
  const tanY = Math.tan(MathUtils.degToRad(fovY) / 2);
  const { minX, maxX, minY, maxY } = project(points, pose.position, basis, tanY * aspect, tanY);
  return { left: minX, right: maxX, bottom: minY, top: maxY };
}

function centredPose(
  points: readonly Vector3[],
  centre: Vector3,
  basis: Basis,
  distance: number,
  tanX: number,
  tanY: number,
  region: NdcRegion,
): { position: Vector3; bounds: Bounds } {
  const goalX = (region.left + region.right) / 2;
  const goalY = (region.bottom + region.top) / 2;
  const position = centre.clone().addScaledVector(basis.forward, -distance);
  let bounds = project(points, position, basis, tanX, tanY);
  // Perspective makes the projected centre drift from the 3D centre; a few fixed-point
  // steps of lateral shift converge well below a pixel.
  for (let i = 0; i < CENTRING_STEPS; i++) {
    const errorX = (bounds.minX + bounds.maxX) / 2 - goalX;
    const errorY = (bounds.minY + bounds.maxY) / 2 - goalY;
    position.addScaledVector(basis.right, errorX * distance * tanX);
    position.addScaledVector(basis.up, errorY * distance * tanY);
    bounds = project(points, position, basis, tanX, tanY);
  }
  return { position, bounds };
}

function project(points: readonly Vector3[], eye: Vector3, basis: Basis, tanX: number, tanY: number): Bounds {
  const bounds: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const rel = new Vector3();
  for (const p of points) {
    rel.subVectors(p, eye);
    const depth = rel.dot(basis.forward);
    const x = rel.dot(basis.right) / (depth * tanX);
    const y = rel.dot(basis.up) / (depth * tanY);
    bounds.minX = Math.min(bounds.minX, x);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxY = Math.max(bounds.maxY, y);
  }
  return bounds;
}

function makeBasis(direction: Vector3, up: Vector3): Basis {
  const forward = direction.clone().normalize();
  const right = new Vector3().crossVectors(forward, up).normalize();
  return { forward, right, up: new Vector3().crossVectors(right, forward) };
}

function shrink(region: NdcRegion, margin: number): NdcRegion {
  const dx = (region.right - region.left) * margin;
  const dy = (region.top - region.bottom) * margin;
  return { left: region.left + dx, right: region.right - dx, bottom: region.bottom + dy, top: region.top - dy };
}

/** All eight corners of an axis-aligned box. */
export function boxCorners(min: Vector3, max: Vector3): Vector3[] {
  const corners: Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    corners.push(new Vector3(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z));
  }
  return corners;
}

/** Converts CSS-pixel insets of a viewport into the NDC region left free for framing. */
export function regionFromInsets(
  viewport: { readonly width: number; readonly height: number },
  insets: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number },
): NdcRegion {
  const x = (px: number): number => (px / viewport.width) * 2 - 1;
  const y = (px: number): number => 1 - (px / viewport.height) * 2;
  return {
    left: x(insets.left),
    right: x(viewport.width - insets.right),
    top: y(insets.top),
    bottom: y(viewport.height - insets.bottom),
  };
}
