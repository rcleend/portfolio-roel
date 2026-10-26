import { type BufferGeometry, Mesh, type Object3D, Vector3 } from 'three';

/** Queries the device models (tvModel, pcModel) run on a loaded glTF scene. */

/** Every mesh under `root`, in traversal order. */
export function meshesOf(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object);
  });
  return meshes;
}

/** The mean of a geometry's vertex normals, normalised: which way a gently curved screen faces. */
export function averageNormal(geometry: BufferGeometry): Vector3 {
  const normals = geometry.getAttribute('normal');
  const sum = new Vector3();
  const n = new Vector3();
  for (let i = 0; i < normals.count; i++) sum.add(n.fromBufferAttribute(normals, i));
  return sum.normalize();
}
