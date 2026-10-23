#!/usr/bin/env node
// Development-only: prints a GLB's node tree with names, extras, mesh/material names and
// world-space AABBs (from accessor min/max, so no geometry decoding is needed).
//   node scripts/inspect-glb.mjs public/room/tv-high.glb [--filter regex]
import { readFile } from 'node:fs/promises';

const [path, ...rest] = process.argv.slice(2);
const filterIndex = rest.indexOf('--filter');
const filter = filterIndex >= 0 ? new RegExp(rest[filterIndex + 1] ?? '', 'i') : null;

const buf = await readFile(path);
const jsonLength = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));

const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const compose = (n) => {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx,
    2 * (x * y + z * w) * sx,
    2 * (x * z - y * w) * sx,
    0,
    2 * (x * y - z * w) * sy,
    (1 - 2 * (x * x + z * z)) * sy,
    2 * (y * z + x * w) * sy,
    0,
    2 * (x * z + y * w) * sz,
    2 * (y * z - x * w) * sz,
    (1 - 2 * (x * x + y * y)) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
};
const apply = (m, [x, y, z]) => [0, 1, 2].map((i) => m[i] * x + m[4 + i] * y + m[8 + i] * z + m[12 + i]);
const fmt = (v) => v.map((n) => n.toFixed(3)).join(', ');

function meshBox(mesh, world) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const prim of mesh.primitives) {
    const acc = gltf.accessors[prim.attributes.POSITION];
    if (!acc.min || !acc.max) continue;
    let { min, max } = acc;
    if (acc.normalized) {
      const d =
        acc.componentType === 5122
          ? 32767
          : acc.componentType === 5123
            ? 65535
            : acc.componentType === 5120
              ? 127
              : 255;
      min = min.map((v) => v / d);
      max = max.map((v) => v / d);
    }
    for (let i = 0; i < 8; i++) {
      const p = apply(world, [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], p[k]);
        hi[k] = Math.max(hi[k], p[k]);
      }
    }
  }
  return { lo, hi };
}

function walk(index, parent, depth) {
  const node = gltf.nodes[index];
  const world = mul(parent, compose(node));
  const mesh = node.mesh !== undefined ? gltf.meshes[node.mesh] : null;
  const line = [`${'  '.repeat(depth)}${node.name ?? `#${index}`}`];
  if (node.extras) line.push(`extras=${JSON.stringify(node.extras)}`);
  if (mesh) {
    const mats = mesh.primitives.map((p) => gltf.materials?.[p.material]?.name ?? '-');
    const { lo, hi } = meshBox(mesh, world);
    line.push(`mesh=${mesh.name} mats=[${mats.join('|')}] min=(${fmt(lo)}) max=(${fmt(hi)})`);
  }
  const text = line.join(' ');
  if (!filter || filter.test(text)) console.log(text);
  for (const child of node.children ?? []) walk(child, world, depth + 1);
}

console.log(`extensions: ${(gltf.extensionsUsed ?? []).join(', ')}`);
console.log(`animations: ${(gltf.animations ?? []).map((a) => a.name).join(', ') || 'none'}`);
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
for (const root of gltf.scenes[gltf.scene ?? 0].nodes) walk(root, identity, 0);
if (!filter) {
  console.log('materials:');
  for (const m of gltf.materials ?? [])
    console.log(
      `  ${m.name} ext=${Object.keys(m.extensions ?? {}).join(',')} emissive=${JSON.stringify(m.emissiveFactor ?? null)} extras=${JSON.stringify(m.extras ?? null)}`,
    );
}
