// The radio's geometry contract, shared by the close-up build (radio-closeup.mjs) and `pnpm verify:room`:
// which triangles of the shipped radio-base.glb are its lid and transport keys, and a fingerprint of the
// geometry and UVs the close-up was built against. All coordinates are glTF world metres.
import { createHash } from 'node:crypto';

/** The parts the runtime cuts out of the base meshes, found as welded components by their bounds (±2 mm). */
export const RADIO_PARTS = {
  lid: {
    mesh: 'Radio_Imported_Part_04_base',
    bounds: [
      [1.01, 1.0409, -2.1612],
      [1.213, 1.0822, -1.9386],
    ],
  },
  rocker: {
    mesh: 'Radio_Imported_Part_05_base',
    bounds: [
      [1.0886, 1.035, -1.8962],
      [1.1137, 1.0766, -1.883],
    ],
  },
  previous: {
    mesh: 'Radio_Imported_Part_05_base',
    bounds: [
      [1.0801, 1.0396, -1.8951],
      [1.0978, 1.0721, -1.884],
    ],
  },
  next: {
    mesh: 'Radio_Imported_Part_05_base',
    bounds: [
      [1.1045, 1.0395, -1.895],
      [1.1222, 1.072, -1.8839],
    ],
  },
  antenna: {
    mesh: 'Radio_Imported_Part_05_base',
    bounds: [
      [0.8173, 1.0248, -2.1971],
      [1.2001, 1.0755, -2.1887],
    ],
  },
};
/**
 * The tub floor the close-up's liner covers: the body's upward-facing triangles whose centroid lies inside the
 * liner's floor and whose corners stay this close (m) to its plane. The source floor is not flat (up to ±1.3 mm
 * about the fitted plane), so where the liner's pickup pocket and magazine slit go down into the radio, and where
 * the floor rises through the liner at the back, the body's own floor would cover them: the runtime draws these
 * triangles only while the lid is shut, and tools/room/radio_closeup.py leaves them out of the close-up's bake.
 */
export const WELL_FLOOR = { mesh: 'Radio_Imported_Part_00_base', band: 0.0025, minNormalY: 0.8 };

/** The body triangles under the liner (WELL_FLOOR), for the well measured by radio_closeup.py. */
export function wellFloorTriangles(mesh, well) {
  const [ax, az, a0] = well.floor;
  const triangles = [];
  const corner = (t, c, r) => mesh.world[mesh.indices[t * 3 + c] * 3 + r];
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const cx = (corner(t, 0, 0) + corner(t, 1, 0) + corner(t, 2, 0)) / 3;
    const cz = (corner(t, 0, 2) + corner(t, 1, 2) + corner(t, 2, 2)) / 3;
    if (cx < well.minX || cx > well.maxX || cz < well.minZ || cz > well.maxZ) continue;
    let near = true;
    for (let c = 0; c < 3; c++) {
      const plane = ax * corner(t, c, 0) + az * corner(t, c, 2) + a0;
      near &&= Math.abs(corner(t, c, 1) - plane) <= WELL_FLOOR.band;
    }
    if (!near) continue;
    const e1 = [0, 1, 2].map((r) => corner(t, 1, r) - corner(t, 0, r));
    const e2 = [0, 1, 2].map((r) => corner(t, 2, r) - corner(t, 0, r));
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[1] / Math.hypot(...n) >= WELL_FLOOR.minNormalY) triangles.push(t);
  }
  return triangles;
}

/** Vertices this close are one point when parts are told apart (the source splits them at UV seams). */
export const WELD = 1e-4;
/** A part needing more ranges than this is stored as base64 Uint32 triangle indices instead. */
export const MAX_RANGES = 200;

/** Every mesh node of a glTF-Transform document with its triangles in world space, in node order. */
export function radioMeshes(document) {
  const meshes = [];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const primitives = mesh.listPrimitives();
    if (primitives.length !== 1) throw new Error(`${node.getName()}: expected one primitive`);
    const primitive = primitives[0];
    const position = primitive.getAttribute('POSITION');
    const index = primitive.getIndices();
    if (!position || !index) throw new Error(`${node.getName()}: expected indexed positions`);
    const matrix = node.getWorldMatrix();
    const world = new Float64Array(position.getCount() * 3);
    const point = [];
    for (let i = 0; i < position.getCount(); i++) {
      position.getElement(i, point);
      for (let r = 0; r < 3; r++) {
        world[i * 3 + r] = matrix[r] * point[0] + matrix[4 + r] * point[1] + matrix[8 + r] * point[2] + matrix[12 + r];
      }
    }
    meshes.push({ name: node.getName(), primitive, world, indices: index.getArray(), vertices: position.getCount() });
  }
  return meshes;
}

/** Triangles grouped into welded, connected components: [{ triangles: number[], bounds }]. */
export function components(mesh) {
  const { world, indices, vertices } = mesh;
  const parent = Int32Array.from({ length: vertices }, (_, i) => i);
  const find = (a) => {
    let at = a;
    while (parent[at] !== at) {
      parent[at] = parent[parent[at]];
      at = parent[at];
    }
    return at;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const welded = new Map();
  for (let i = 0; i < vertices; i++) {
    const key = `${Math.round(world[i * 3] / WELD)},${Math.round(world[i * 3 + 1] / WELD)},${Math.round(world[i * 3 + 2] / WELD)}`;
    const other = welded.get(key);
    if (other === undefined) welded.set(key, i);
    else union(i, other);
  }
  const count = indices.length / 3;
  for (let t = 0; t < count; t++) {
    union(indices[t * 3], indices[t * 3 + 1]);
    union(indices[t * 3], indices[t * 3 + 2]);
  }
  const groups = new Map();
  for (let t = 0; t < count; t++) {
    const root = find(indices[t * 3]);
    let group = groups.get(root);
    if (!group) {
      group = {
        triangles: [],
        bounds: [
          [Infinity, Infinity, Infinity],
          [-Infinity, -Infinity, -Infinity],
        ],
      };
      groups.set(root, group);
    }
    group.triangles.push(t);
    for (let corner = 0; corner < 3; corner++) {
      const v = indices[t * 3 + corner];
      for (let r = 0; r < 3; r++) {
        group.bounds[0][r] = Math.min(group.bounds[0][r], world[v * 3 + r]);
        group.bounds[1][r] = Math.max(group.bounds[1][r], world[v * 3 + r]);
      }
    }
  }
  return [...groups.values()];
}

/** The one component whose bounds match `bounds` within `tolerance`; throws when there is not exactly one. */
export function findComponent(mesh, bounds, tolerance = 0.002) {
  const matches = components(mesh).filter((group) =>
    group.bounds.every((corner, c) => corner.every((value, r) => Math.abs(value - bounds[c][r]) <= tolerance)),
  );
  if (matches.length !== 1)
    throw new Error(`${mesh.name}: ${matches.length} components match ${JSON.stringify(bounds)}`);
  return matches[0];
}

/** World bounds of a set of triangles. */
export function triangleBounds(mesh, triangles) {
  const bounds = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity],
  ];
  for (const t of triangles) {
    for (let corner = 0; corner < 3; corner++) {
      const v = mesh.indices[t * 3 + corner];
      for (let r = 0; r < 3; r++) {
        bounds[0][r] = Math.min(bounds[0][r], mesh.world[v * 3 + r]);
        bounds[1][r] = Math.max(bounds[1][r], mesh.world[v * 3 + r]);
      }
    }
  }
  return bounds.map((corner) => corner.map((value) => Math.round(value * 1e5) / 1e5));
}

/** Mean world height of a triangle's corners. */
export function centroidY(mesh, triangle) {
  let sum = 0;
  for (let corner = 0; corner < 3; corner++) sum += mesh.world[mesh.indices[triangle * 3 + corner] * 3 + 1];
  return sum / 3;
}

/** Sorted triangle indices as [[start, count], …], or base64 little-endian Uint32 indices when that is shorter. */
export function encodeTriangles(triangles) {
  const sorted = [...triangles].sort((a, b) => a - b);
  const ranges = [];
  for (const t of sorted) {
    const last = ranges.at(-1);
    if (last && last[0] + last[1] === t) last[1]++;
    else ranges.push([t, 1]);
  }
  if (ranges.length <= MAX_RANGES) return { ranges };
  return { indices: Buffer.from(new Uint32Array(sorted).buffer).toString('base64') };
}

/** The inverse of encodeTriangles. */
export function decodeTriangles(part) {
  if (part.ranges) return part.ranges.flatMap(([start, count]) => Array.from({ length: count }, (_, i) => start + i));
  const bytes = Buffer.from(part.indices, 'base64');
  return [...new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)];
}

/** SHA-256 over every mesh's decoded index and POSITION arrays, in node order. */
export function geometrySha256(meshes) {
  const hash = createHash('sha256');
  for (const { primitive } of meshes) {
    hash.update(bytesOf(primitive.getIndices().getArray()));
    hash.update(bytesOf(primitive.getAttribute('POSITION').getArray()));
  }
  return hash.digest('hex');
}

/** SHA-256 over every mesh's decoded TEXCOORD_0 array, in node order: the layout the 2K skin was proven on. */
export function uvSha256(meshes) {
  const hash = createHash('sha256');
  for (const { primitive } of meshes) hash.update(bytesOf(primitive.getAttribute('TEXCOORD_0').getArray()));
  return hash.digest('hex');
}

function bytesOf(array) {
  return new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
}

/**
 * Proof that a re-unwrapped radio (Blender's export, float UVs) has the shipped radio's atlas layout: every shipped
 * triangle has a counterpart with the same corners (within 0.1 mm, any rotation of the corners) whose UVs differ
 * by at most `tolerance`. Returns the worst difference per mesh; throws on a missing triangle or mesh.
 */
export function uvIdentity(shipped, check, tolerance = 2 / 65535) {
  const byName = new Map(check.map((mesh) => [mesh.name.replace(/_base$/, ''), mesh]));
  const report = {};
  for (const mesh of shipped) {
    const name = mesh.name.replace(/_base$/, '');
    const other = byName.get(name);
    if (!other) throw new Error(`the 2K skin would not fit the shipped UVs: ${name} is missing from the check export`);
    const grid = new Map();
    const cell = 0.002;
    const keyOf = (c) => c.map((value) => Math.floor(value / cell)).join(',');
    const corners = (m, t) => [0, 1, 2].map((k) => m.indices[t * 3 + k]);
    const centroid = (m, t) => [0, 1, 2].map((r) => corners(m, t).reduce((sum, v) => sum + m.world[v * 3 + r], 0) / 3);
    const uvs = (m) => m.primitive.getAttribute('TEXCOORD_0');
    const checkUv = uvs(other);
    const shippedUv = uvs(mesh);
    for (let t = 0; t < other.indices.length / 3; t++) {
      const key = keyOf(centroid(other, t));
      const list = grid.get(key);
      if (list) list.push(t);
      else grid.set(key, [t]);
    }
    const near = (a, ma, b, mb) => [0, 1, 2].every((r) => Math.abs(ma.world[a * 3 + r] - mb.world[b * 3 + r]) < WELD);
    const a = [];
    const c = [];
    let worst = 0;
    for (let t = 0; t < mesh.indices.length / 3; t++) {
      const base = centroid(mesh, t).map((value) => Math.floor(value / cell));
      const mine = corners(mesh, t);
      let best = Infinity;
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            for (const u of grid.get([base[0] + dx, base[1] + dy, base[2] + dz].join(',')) ?? []) {
              const theirs = corners(other, u);
              for (let rotation = 0; rotation < 3; rotation++) {
                if (!mine.every((v, k) => near(v, mesh, theirs[(k + rotation) % 3], other))) continue;
                let difference = 0;
                mine.forEach((v, k) => {
                  shippedUv.getElement(v, a);
                  checkUv.getElement(theirs[(k + rotation) % 3], c);
                  difference = Math.max(difference, Math.abs(a[0] - c[0]), Math.abs(a[1] - c[1]));
                });
                best = Math.min(best, difference);
              }
            }
          }
      if (best === Infinity) throw new Error(`the 2K skin would not fit the shipped UVs: ${name} triangle ${t} moved`);
      worst = Math.max(worst, best);
    }
    if (worst > tolerance) {
      throw new Error(
        `the 2K skin would not fit the shipped UVs: ${name} differs by ${(worst * 65535).toFixed(2)}/65535`,
      );
    }
    report[name] = Math.round(worst * 65535 * 100) / 100;
  }
  return report;
}
