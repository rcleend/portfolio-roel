import { Box3, BufferAttribute, type BufferGeometry, BufferGeometry as Geometry, Sphere, Vector3 } from 'three';

/**
 * Moves the listed triangles of an indexed geometry into a child geometry that shares every attribute of the
 * parent (no vertex is copied): the parent keeps the rest. The radio's lid and keys are cut out of the baked meshes
 * this way, so they can move while the room view still looks exactly as baked.
 */
export function cutTriangles(geometry: BufferGeometry, triangles: readonly number[]): Geometry {
  const index = geometry.getIndex();
  if (!index) throw new Error('cutTriangles needs an indexed geometry');
  const count = index.count / 3;
  const listed = new Uint8Array(count);
  for (const t of triangles) {
    if (t < 0 || t >= count || !Number.isInteger(t)) throw new RangeError(`No triangle ${t} in a geometry of ${count}`);
    listed[t] = 1;
  }
  const source = index.array;
  const Indices = source instanceof Uint32Array ? Uint32Array : Uint16Array;
  const cut = new Indices(triangles.length * 3);
  const kept = new Indices(source.length - triangles.length * 3);
  let c = 0;
  let k = 0;
  for (let t = 0; t < count; t++) {
    const target = listed[t] ? cut : kept;
    let at = listed[t] ? c : k;
    for (let corner = 0; corner < 3; corner++) target[at++] = source[t * 3 + corner] as number;
    if (listed[t]) c = at;
    else k = at;
  }
  if (c !== cut.length) throw new Error('cutTriangles: a triangle was listed twice');
  geometry.setIndex(new BufferAttribute(kept, 1));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const child = new Geometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) child.setAttribute(name, attribute);
  child.setIndex(new BufferAttribute(cut, 1));
  const bounds = indexedBounds(child);
  child.boundingBox = bounds;
  child.boundingSphere = bounds.getBoundingSphere(new Sphere());
  return child;
}

/** The bounds of the vertices an index actually uses (shared attributes span the whole parent). */
export function indexedBounds(geometry: BufferGeometry): Box3 {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const bounds = new Box3();
  const point = new Vector3();
  if (!index) return bounds.setFromBufferAttribute(position as BufferAttribute);
  for (let i = 0; i < index.count; i++) bounds.expandByPoint(point.fromBufferAttribute(position, index.getX(i)));
  return bounds;
}
