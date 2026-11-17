import type { Material, Mesh, Object3D } from 'three';
import { type IdleTask, QUIET } from './IdleWork';

/**
 * Vertices a unit draws at most: a unit uploads its meshes' buffers, and the largest mesh of the room (the props, 60 k
 * vertices on the top tier) is a unit to itself.
 */
export const WARM_UNIT_VERTICES = 24_000;

/** The one stage call this needs (RoomStage.warm). */
export type Warmer = (objects: readonly Object3D[]) => void;

/**
 * Warms every mesh and points under `root` that `warmed` does not hold yet, a few per unit of background work
 * (docs/ROOM.md › Warming). three.js makes a mesh's vertex array and uploads its buffers the first time a frame draws
 * it, and the driver builds its own state for a program the first time it draws with one vertex layout into one kind
 * of target: for everything the TV view leaves out, that first time was a frame of the first flight away from it,
 * as the mesh came into the picture. Drawn once here instead, out of sight. A mesh that is never drawn
 * (`userData.neverDrawn`: the pick meshes) is left alone, and so is one whose material is switched off.
 */
export function* warmObjects(root: Object3D, warm: Warmer, warmed: WeakSet<Object3D>): IdleTask {
  const all: Object3D[] = [];
  root.traverse((object) => {
    if (drawn(object) && !warmed.has(object)) all.push(object);
  });
  let batch: Object3D[] = [];
  let vertices = 0;
  for (const object of all) {
    batch.push(object);
    vertices += (object as Mesh).geometry.getAttribute('position')?.count ?? 0;
    if (vertices < WARM_UNIT_VERTICES) continue;
    // An upload and a draw: the GPU's cost, which the main thread cannot time.
    yield QUIET;
    warm(batch);
    for (const one of batch) warmed.add(one);
    batch = [];
    vertices = 0;
  }
  if (batch.length === 0) return;
  yield QUIET;
  warm(batch);
  for (const one of batch) warmed.add(one);
}

function drawn(object: Object3D): boolean {
  const mesh = object as Mesh & { isPoints?: boolean };
  if (!(mesh.isMesh || mesh.isPoints) || !mesh.geometry || !mesh.material) return false;
  if (object.userData.neverDrawn === true) return false;
  const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) => material.visible);
}
