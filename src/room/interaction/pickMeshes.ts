import { Box3, BufferAttribute, BufferGeometry, Mesh, type Object3D, Sphere, Vector3 } from 'three';

/** Meshes with more triangles than this are cut into chunks; cutting smaller ones costs more at load than it saves. */
export const PICK_CUT_TRIANGLES = 8192;
/** The most triangles in one chunk. */
export const PICK_CHUNK_TRIANGLES = 1024;
/** Triangles visited per unit of work when cutting in the background: about a millisecond on a slow phone. */
const TRIANGLES_PER_UNIT = 4096;

const sources = new WeakMap<Object3D, Mesh>();

/** Every mesh under `root`, in traversal order. */
export function meshesOf(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object);
  });
  return meshes;
}

/**
 * What the pointer ray tests for an interactable: its meshes, with every mesh of more than
 * PICK_CUT_TRIANGLES triangles cut into compact chunks. The baked room merges whole groups into
 * one mesh (the desk with its drawers, chair, lamp, tower and basket is 54 k triangles), and
 * three.js tests every triangle of a mesh whose bounds a ray crosses: about 3 ms per pointer event
 * on a laptop and 20 ms on a phone six times slower. A chunk shares its mesh's attributes, material
 * and world matrix and has its own tight bounds, so a ray only tests the few chunks it crosses and
 * finds exactly the same hits. Chunks are never rendered and hold nothing but an index.
 */
export function pickMeshes(root: Object3D): Mesh[] {
  const steps = pickMeshesInSteps(root);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/**
 * `pickMeshes` in units of work for the room's IdleWork: cutting the desk takes 9 ms on a laptop and
 * 50 ms on a phone six times slower, too long for the room's first frame or one idle moment.
 */
export function* pickMeshesInSteps(root: Object3D): Generator<void, Mesh[], void> {
  const meshes: Mesh[] = [];
  for (const mesh of meshesOf(root)) meshes.push(...(yield* chunksOf(mesh)));
  return meshes;
}

/** The mesh a ray hit belongs to: the object itself, or the mesh a chunk was cut from. */
export function pickedMesh(object: Object3D): Object3D {
  return sources.get(object) ?? object;
}

function* chunksOf(mesh: Mesh): Generator<void, Mesh[], void> {
  const { geometry, material } = mesh;
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = (index ? index.count : position.count) / 3;
  // A chunk has no material groups to pick a material by; no room mesh this large has several.
  if (count <= PICK_CUT_TRIANGLES || Array.isArray(material)) return [mesh];

  const vertex = (corner: number): number => (index ? index.getX(corner) : corner);
  const point = new Vector3();
  // Three times each triangle's centroid: splitting only compares them with each other.
  const centres = new Float32Array(count * 3);
  for (let corner = 0; corner < count * 3; corner++) {
    point.fromBufferAttribute(position, vertex(corner));
    const at = corner - (corner % 3);
    centres[at] = (centres[at] as number) + point.x;
    centres[at + 1] = (centres[at + 1] as number) + point.y;
    centres[at + 2] = (centres[at + 2] as number) + point.z;
    if ((corner + 1) % (TRIANGLES_PER_UNIT * 3) === 0) yield;
  }
  const triangles = new Uint32Array(count);
  for (let triangle = 0; triangle < count; triangle++) triangles[triangle] = triangle;
  const leaves = yield* split(triangles, centres);

  const chunks: Mesh[] = [];
  let visited = 0;
  for (const leaf of leaves) {
    const chunk = new BufferGeometry();
    for (const [name, attribute] of Object.entries(geometry.attributes)) chunk.setAttribute(name, attribute);
    const indices = new (position.count > 0xffff ? Uint32Array : Uint16Array)(leaf.length * 3);
    const bounds = new Box3();
    leaf.forEach((triangle, i) => {
      for (let corner = 0; corner < 3; corner++) {
        const v = vertex(triangle * 3 + corner);
        indices[i * 3 + corner] = v;
        bounds.expandByPoint(point.fromBufferAttribute(position, v));
      }
    });
    chunk.setIndex(new BufferAttribute(indices, 1));
    chunk.boundingBox = bounds;
    chunk.boundingSphere = bounds.getBoundingSphere(new Sphere());
    const piece = new Mesh(chunk, material);
    // The chunk is not in the scene: sharing the mesh's world matrix keeps it where the mesh is.
    piece.matrixWorld = mesh.matrixWorld;
    piece.matrixAutoUpdate = false;
    piece.matrixWorldAutoUpdate = false;
    sources.set(piece, mesh);
    chunks.push(piece);
    visited += leaf.length;
    if (visited >= TRIANGLES_PER_UNIT) {
      visited = 0;
      yield;
    }
  }
  return chunks;
}

/**
 * Halves `triangles` in place at the middle of their centres' longest extent, until each part is
 * small enough, and returns the parts (views into the one array) in depth-first order.
 */
function* split(triangles: Uint32Array, centres: Float32Array): Generator<void, Uint32Array[], void> {
  const leaves: Uint32Array[] = [];
  const parts = [triangles];
  let visited = 0;
  // A unit ends every TRIANGLES_PER_UNIT triangles visited, inside a large part or across small ones.
  const unitDone = (): boolean => ++visited % TRIANGLES_PER_UNIT === 0;
  for (let part = parts.pop(); part; part = parts.pop()) {
    if (part.length <= PICK_CHUNK_TRIANGLES) {
      leaves.push(part);
      continue;
    }
    const below = yield* partition(part, centres, unitDone);
    // Every centre at one point: nothing left to separate.
    if (below === 0 || below === part.length) leaves.push(part);
    // Upper half first onto the stack, so the lower half comes off it first.
    else parts.push(part.subarray(below), part.subarray(0, below));
  }
  return leaves;
}

/**
 * Moves the triangles whose centres lie below the middle of the longest extent to the front; returns how many.
 * Yields whenever `unitDone()`, counting every triangle either pass visits: the first parts hold the whole mesh.
 */
function* partition(
  triangles: Uint32Array,
  centres: Float32Array,
  unitDone: () => boolean,
): Generator<void, number, void> {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < triangles.length; i++) {
    const triangle = triangles[i] as number;
    for (let axis = 0; axis < 3; axis++) {
      const value = centres[triangle * 3 + axis] as number;
      if (value < (min[axis] as number)) min[axis] = value;
      if (value > (max[axis] as number)) max[axis] = value;
    }
    if (unitDone()) yield;
  }
  const extents = max.map((value, axis) => value - (min[axis] as number));
  const axis = extents.indexOf(Math.max(...extents));
  const middle = ((min[axis] as number) + (max[axis] as number)) / 2;
  let below = 0;
  for (let i = 0; i < triangles.length; i++) {
    const triangle = triangles[i] as number;
    if ((centres[triangle * 3 + axis] as number) < middle) {
      triangles[i] = triangles[below] as number;
      triangles[below++] = triangle;
    }
    if (unitDone()) yield;
  }
  return below;
}
