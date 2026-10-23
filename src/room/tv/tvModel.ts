import { Box3, type BufferGeometry, Mesh, type Object3D, Vector3 } from 'three';
import type { UvRect } from './screenMapping';

/**
 * Facts about the CRT television asset (tv-high.glb, room revision 6) that the room relies
 * on. Anything findable at runtime is found at runtime; only the bezel aperture is a
 * measured constant (see docs/ROOM.md and scripts/inspect-tv-screen.mjs to re-measure).
 */

/** `userData.interaction_id` of the screen mesh, exported from Blender. */
export const TV_SCREEN_INTERACTION_ID = 'tv-screen';

/**
 * The part of the screen mesh's 0–1 UV square that is not hidden behind the bezel when seen
 * straight on. Measured by ray casting the asset; corners are additionally rounded.
 */
export const TV_SCREEN_APERTURE: UvRect = { minU: 0.058, minV: 0.05, maxU: 0.942, maxV: 0.95 };

/** Extra inset inside the aperture, so the picture clears the bezel's rounded corners. */
export const TV_PICTURE_INSET = 0.02;

export interface TvModel {
  readonly root: Object3D;
  /** The curved glass; UV v = 0 is its top edge. */
  readonly screen: Mesh;
  /** World-space unit vector the screen faces, i.e. towards the viewer. */
  readonly facing: Vector3;
  /** World-space bounds of the whole set, cabinet and controls included. */
  readonly bounds: Box3;
  /** Physical width / height of the screen mesh's UV square. */
  readonly screenAspect: number;
  /** Front-panel button strip (power and channel buttons), if the asset has one. */
  readonly frontButtons: Mesh | null;
}

export function locateTv(root: Object3D): TvModel {
  root.updateMatrixWorld(true);
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object);
  });
  const screen = meshes.find(
    (mesh) => mesh.userData.replaceable_screen && mesh.userData.interaction_id === TV_SCREEN_INTERACTION_ID,
  );
  if (!screen) throw new Error(`TV asset has no screen mesh with interaction_id "${TV_SCREEN_INTERACTION_ID}"`);
  const frontButtons = meshes.find((mesh) => mesh.userData.interaction_id === 'tv-buttons') ?? null;

  const facing = averageNormal(screen.geometry).transformDirection(screen.matrixWorld);
  const screenBox = new Box3().setFromObject(screen);
  const size = screenBox.getSize(new Vector3());
  const up = new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(facing, up).negate().normalize();
  const screenAspect = Math.abs(size.dot(right)) / Math.abs(size.dot(up));

  return { root, screen, facing, bounds: new Box3().setFromObject(root), screenAspect, frontButtons };
}

function averageNormal(geometry: BufferGeometry): Vector3 {
  const normals = geometry.getAttribute('normal');
  const sum = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < normals.count; i++) sum.add(n.fromBufferAttribute(normals, i));
  return sum.normalize();
}
