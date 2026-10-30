import { type Box3, MathUtils, type Mesh, Triangle, Vector3 } from 'three';
import type { Viewpoint } from '../camera/cameraPath';
import { boxCorners, type CameraPose, frameSubject, type NdcRegion, projectedBounds } from '../camera/framing';
import type { UvRect } from './screenMapping';

/**
 * Where the camera rests at the TV: straight on, a little from above, with a long lens. Wide screens see the whole
 * set; portrait and short ones the game's picture as large as it goes, since the whole set would leave it too small
 * to play (a phone's picture was 70 % of its width).
 */

// A long lens flattens the set into a "product shot" of the TV.
const TV_FOV = 28;
/**
 * Beyond this distance from the set's middle a portrait framing would back the camera into the desk; widen the lens
 * instead. Measured from the middle whichever subject is framed, so the eye never stands further back.
 */
const TV_MAX_DISTANCE = 1.75;
const TV_MAX_FOV = 60;
// Space left around the TV on each side, as a fraction of the framing region.
const TV_MARGIN = 0.06;
// Looking down slightly shows the top of the cabinet: depth without losing "straight on".
const TV_PITCH_DEGREES = 4;
/**
 * The whole set must show the picture at least this tall (CSS px; 1.25 per game row), or the picture is framed
 * instead: a phone on its side, a very short window. Tablets and desktops in landscape stay above it.
 */
const MIN_PICTURE_HEIGHT = 300;
/** A framed picture's hairline of room on each side, as a fraction of the region: about 0.4 px on a phone. */
const PICTURE_MARGIN = 0.001;

const WORLD_UP = new Vector3(0, 1, 0);

export interface TvFramingModel {
  /** World-space unit vector the screen faces, i.e. towards the viewer. */
  readonly facing: Vector3;
  /** World-space bounds of the whole set. */
  readonly bounds: Box3;
  /** The game's picture on the glass, as `pictureOutline` traces it. */
  readonly picture: readonly Vector3[];
}

/**
 * The TV view for a viewport and the part of it the app's overlays leave free (`region`): the whole set with a margin,
 * or, on a portrait viewport or where the whole set would show the picture under MIN_PICTURE_HEIGHT, the picture with
 * a hairline. A portrait picture is limited by width, so it spans the screen edge to edge (its top row does; the pitch
 * keystones the bottom row a little narrower) and the bezel is cropped at the sides; a phone on its side is limited by
 * height, between the touch pad's clusters.
 */
export function tvViewpoint(
  model: TvFramingModel,
  viewport: { readonly width: number; readonly height: number },
  region: NdcRegion,
): Viewpoint {
  const pitch = MathUtils.degToRad(TV_PITCH_DEGREES);
  const direction = model.facing
    .clone()
    .negate()
    .multiplyScalar(Math.cos(pitch))
    .add(new Vector3(0, -Math.sin(pitch), 0));
  const forward = direction.clone().normalize();
  const middle = model.bounds.getCenter(new Vector3());
  const aspect = viewport.width / viewport.height;
  /** How far the eye stands back from the set's middle along its line of sight. */
  const reach = (pose: CameraPose): number => middle.clone().sub(pose.position).dot(forward);

  const frame = (points: readonly Vector3[], margin: number): Viewpoint => {
    const framing = (fovY: number): CameraPose =>
      frameSubject({ points, direction, up: WORLD_UP, fovY, aspect, region, margin });
    let fov = TV_FOV;
    let pose = framing(fov);
    while (reach(pose) > TV_MAX_DISTANCE && fov < TV_MAX_FOV) {
      fov += 2;
      pose = framing(fov);
    }
    return { position: pose.position, target: pose.target, fov };
  };

  if (viewport.width >= viewport.height) {
    const set = frame(boxCorners(model.bounds.min, model.bounds.max), TV_MARGIN);
    const picture = projectedBounds(model.picture, set, WORLD_UP, set.fov, aspect);
    if (((picture.top - picture.bottom) / 2) * viewport.height >= MIN_PICTURE_HEIGHT) return set;
  }
  return frame(model.picture, PICTURE_MARGIN);
}

/**
 * The picture's outline on the curved glass, in world space: the corners of `picture` (the content rect, in the
 * glass's UVs) and every point where its edges cross an edge of the glass's triangles. Within a triangle UVs are
 * affine, so the outline is straight between these points and they bound the picture exactly from any viewpoint.
 */
export function pictureOutline(glass: Mesh, picture: UvRect): Vector3[] {
  const position = glass.geometry.getAttribute('position');
  const uv = glass.geometry.getAttribute('uv');
  if (!uv) throw new Error('The TV glass has no UVs');
  const index = glass.geometry.getIndex();
  const vertexAt = (i: number): number => (index ? index.getX(i) : i);
  const count = index ? index.count : position.count;
  const uvOf = (vertex: number): Vector3 => new Vector3(uv.getX(vertex), uv.getY(vertex), 0);
  const positionOf = (vertex: number): Vector3 => new Vector3().fromBufferAttribute(position, vertex);

  const points: Vector3[] = [];
  const corners = [
    [picture.minU, picture.minV],
    [picture.maxU, picture.minV],
    [picture.maxU, picture.maxV],
    [picture.minU, picture.maxV],
  ] as const;
  const found = corners.map(() => false);
  const visited = new Set<string>();
  const barycentric = new Vector3();
  for (let i = 0; i < count; i += 3) {
    const triangle = [vertexAt(i), vertexAt(i + 1), vertexAt(i + 2)] as const;
    const [a, b, c] = triangle.map(uvOf) as [Vector3, Vector3, Vector3];
    corners.forEach(([u, v], k) => {
      const weights = found[k] ? null : Triangle.getBarycoord(new Vector3(u, v, 0), a, b, c, barycentric);
      if (!weights || weights.x < 0 || weights.y < 0 || weights.z < 0) return;
      found[k] = true;
      points.push(
        positionOf(triangle[0])
          .multiplyScalar(weights.x)
          .addScaledVector(positionOf(triangle[1]), weights.y)
          .addScaledVector(positionOf(triangle[2]), weights.z),
      );
    });
    for (let edge = 0; edge < 3; edge++) {
      const from = triangle[edge] as number;
      const to = triangle[(edge + 1) % 3] as number;
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      if (visited.has(key)) continue;
      visited.add(key);
      for (const t of edgeCrossings(uvOf(from), uvOf(to), picture)) {
        points.push(positionOf(from).lerp(positionOf(to), t));
      }
    }
  }
  if (found.includes(false)) throw new Error('The TV picture reaches beyond the glass');
  return points.map((point) => point.applyMatrix4(glass.matrixWorld));
}

/** Where (0–1 along it) the UV segment from `a` to `b` crosses the outline of `rect`. */
function edgeCrossings(a: Vector3, b: Vector3, rect: UvRect): number[] {
  const crossings: number[] = [];
  // Along one axis the segment runs `from` → `to` and meets `line`; there the other axis must be within [min, max].
  const cross = (from: number, to: number, line: number, along: [number, number], min: number, max: number): void => {
    if (from === to) return;
    const t = (line - from) / (to - from);
    const other = along[0] + (along[1] - along[0]) * t;
    if (t >= 0 && t <= 1 && other >= min && other <= max) crossings.push(t);
  };
  for (const u of [rect.minU, rect.maxU]) cross(a.x, b.x, u, [a.y, b.y], rect.minV, rect.maxV);
  for (const v of [rect.minV, rect.maxV]) cross(a.y, b.y, v, [a.x, b.x], rect.minU, rect.maxU);
  return crossings;
}
