import type { Vector3 } from 'three';
import { type GlassPlane, planeHeight, planeWidth } from './glassPlane';

/**
 * Texture coordinates that project a display's texture onto its curved glass from `eye`, like a
 * slide projector standing where the viewer's eye is.
 *
 * Each world vertex `w` takes the UV of the point where the ray from the eye through `w` meets
 * the rim plane: p = e + (w − e)·(r − e.z)/(w.z − e.z). Seen from the eye, the texture is then
 * exactly the flat rectangle `plane` covers on the page, which is the rectangle the live DOM
 * screen covers, so the two register at the hand-off. The glass's own planar UVs project
 * straight back instead and misregister by a few pixels where the glass bulges towards the
 * viewer. u runs left → right and v = 0 is the top edge, like the asset's UVs.
 *
 * `worldPositions` holds x, y, z per vertex; the result holds u, v per vertex.
 */
export function projectorUvs(worldPositions: Float32Array, eye: Vector3, plane: GlassPlane): Float32Array {
  const count = worldPositions.length / 3;
  const uvs = new Float32Array(count * 2);
  const width = planeWidth(plane);
  const height = planeHeight(plane);
  const towardsPlane = plane.z - eye.z;
  for (let i = 0; i < count; i++) {
    const x = worldPositions[i * 3] as number;
    const y = worldPositions[i * 3 + 1] as number;
    const z = worldPositions[i * 3 + 2] as number;
    const scale = towardsPlane / (z - eye.z);
    const px = eye.x + (x - eye.x) * scale;
    const py = eye.y + (y - eye.y) * scale;
    uvs[i * 2] = (px - plane.minX) / width;
    uvs[i * 2 + 1] = (plane.maxY - py) / height;
  }
  return uvs;
}
