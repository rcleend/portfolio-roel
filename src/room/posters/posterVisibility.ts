import { Box3, type Camera, Frustum, Matrix4, Vector3 } from 'three';

/**
 * Per item, the box of everything it emits (its card, tape overhangs and skirts), as tools/room/posters.mjs writes it
 * into the posters node's extras, in the node's parent space (the room's).
 */
interface DecorRecord {
  readonly decor_id: string;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** The posters node's item boxes; throws when the node carries none (an asset from before the contract). */
export function decorBoxes(userData: Readonly<Record<string, unknown>>): Box3[] {
  const decor = userData.decor as readonly DecorRecord[] | undefined;
  if (!Array.isArray(decor) || decor.length === 0) throw new Error('posters.glb carries no decor boxes');
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
