import { Box3, BufferAttribute, type BufferGeometry, BufferGeometry as Geometry, Sphere, Vector3 } from 'three';

/**
 * Cuts listed triangles of an indexed geometry out into child geometries that share every attribute of the parent
 * (no vertex is copied), so the radio's lid and keys can move while the room view still looks exactly as baked.
 *
 * Nothing changes until `commit`: every list is read against the parent's own triangle numbering, all at once, so
 * several parts cut from one mesh never see each other's renumbering, and a check that fails after planning leaves
 * the shipped radio exactly as it was. `restore` gives the parent back every triangle it had.
 */
export interface TriangleCut {
  /** One child per list, in list order, its bounds those of the vertices it uses. */
  readonly parts: readonly Geometry[];
  /** The parent keeps only the triangles no list names. Idempotent. */
  commit(): void;
  /** The parent gets its original index back (the children keep theirs). Idempotent. */
  restore(): void;
}

export function cutTriangles(geometry: BufferGeometry, lists: readonly (readonly number[])[]): TriangleCut {
  const index = geometry.getIndex();
  if (!index) throw new Error('cutTriangles needs an indexed geometry');
  const count = index.count / 3;
  // 0: kept; k + 1: the k-th list's.
  const owner = new Uint8Array(count);
  if (lists.length > 254) throw new RangeError('cutTriangles cuts at most 254 parts from one geometry');
  lists.forEach((list, k) => {
    for (const t of list) {
      if (!Number.isInteger(t) || t < 0 || t >= count)
        throw new RangeError(`No triangle ${t} in a geometry of ${count}`);
      if (owner[t] !== 0) throw new Error(`cutTriangles: triangle ${t} is listed twice`);
      owner[t] = k + 1;
    }
  });
  const source = index.array;
  const Indices = source instanceof Uint32Array ? Uint32Array : Uint16Array;
  const sizes = lists.map((list) => list.length * 3);
  const cuts = sizes.map((size) => new Indices(size));
  const kept = new Indices(source.length - sizes.reduce((sum, size) => sum + size, 0));
  const cursor = new Array<number>(lists.length).fill(0);
  let k = 0;
  for (let t = 0; t < count; t++) {
    const part = (owner[t] ?? 0) - 1;
    const target = part < 0 ? kept : (cuts[part] as InstanceType<typeof Indices>);
    let at = part < 0 ? k : (cursor[part] as number);
    for (let corner = 0; corner < 3; corner++) target[at++] = source[t * 3 + corner] as number;
    if (part < 0) k = at;
    else cursor[part] = at;
  }
  const parts = cuts.map((indices) => {
    const child = new Geometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) child.setAttribute(name, attribute);
    child.setIndex(new BufferAttribute(indices, 1));
    const bounds = indexedBounds(child);
    child.boundingBox = bounds;
    child.boundingSphere = bounds.getBoundingSphere(new Sphere());
    return child;
  });
  const keptIndex = new BufferAttribute(kept, 1);
  const apply = (attribute: BufferAttribute): void => {
    if (geometry.getIndex() === attribute) return;
    geometry.setIndex(attribute);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
  };
  return { parts, commit: () => apply(keptIndex), restore: () => apply(index) };
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
