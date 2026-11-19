import { Box3, type Camera, Frustum, Matrix4, Vector3 } from 'three';

/** Per piece, the box of everything it draws (its card, tape overhangs and skirt), in the room's space. */
export interface DecorRecord {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** The pieces' boxes as the wall's geometry measures them (posters/wall/geometry.ts). */
export function decorBoxes(decor: readonly DecorRecord[]): Box3[] {
  return decor.map(({ min, max }) => new Box3(new Vector3(...min), new Vector3(...max)));
}

const frustum = new Frustum();
const viewProjection = new Matrix4();

/**
 * Whether any item's box meets the camera's frustum as it is now. Boxes are conservative (a box may meet the frustum
 * where its polygons do not), so a pose that reads false shows no piece of decoration and the node may rest hidden
 * there; a pose that reads true keeps it drawn.
 */
export function anyInView(boxes: readonly Box3[], camera: Camera): boolean {
  camera.updateMatrixWorld();
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProjection);
  return boxes.some((box) => frustum.intersectsBox(box));
}
