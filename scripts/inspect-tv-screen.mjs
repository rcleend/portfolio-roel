#!/usr/bin/env node
// Development-only: decodes a device GLB with three's GLTFLoader (textures stubbed) and reports
// the screen mesh's UV orientation in world space plus per-mesh details for the TV.
//   node scripts/inspect-tv-screen.mjs public/room/tv-high.glb
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Node has no image decoding; geometry is all this script needs.
globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
globalThis.self = globalThis;
const origWarn = console.warn;
console.warn = () => {};

const path = process.argv[2] ?? 'public/room/tv-high.glb';
const buf = await readFile(path);
await MeshoptDecoder.ready;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
console.warn = origWarn;
gltf.scene.updateMatrixWorld(true);

const v = (x) =>
  `(${x
    .toArray()
    .map((n) => n.toFixed(4))
    .join(', ')})`;
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry;
  const box = new THREE.Box3().setFromObject(o);
  console.log(
    `${o.name}: verts=${g.attributes.position.count} uvSets=${Object.keys(g.attributes)
      .filter((k) => k.startsWith('uv'))
      .join(',')} box=${v(box.min)}..${v(box.max)} mat=${o.material.name} type=${o.material.type}`,
  );
  for (const slot of ['map', 'emissiveMap', 'normalMap', 'roughnessMap'])
    if (o.material[slot]) console.log(`   ${slot} channel=${o.material[slot].channel}`);
});

const screen = gltf.scene.getObjectByProperty('name', 'TV_Interactive_Screen_high') ?? null;
let screenMesh = null;
gltf.scene.traverse((o) => {
  if (o.isMesh && o.userData.replaceable_screen) screenMesh = o;
});
if (!screenMesh) {
  console.log('no replaceable screen');
  process.exit(0);
}
console.log('\nscreen mesh:', screenMesh.name, screen ? '' : '(by userData)');
console.log('userData', JSON.stringify(screenMesh.userData));
const g = screenMesh.geometry;
const pos = g.attributes.position;
const uv = g.attributes.uv;
const world = new THREE.Vector3();
// Find world positions at the UV corners and the UV centre.
const targets = { '(0,0)': [0, 0], '(1,0)': [1, 0], '(0,1)': [0, 1], '(1,1)': [1, 1], '(.5,.5)': [0.5, 0.5] };
const uvMin = [Infinity, Infinity],
  uvMax = [-Infinity, -Infinity];
for (let i = 0; i < uv.count; i++) {
  uvMin[0] = Math.min(uvMin[0], uv.getX(i));
  uvMin[1] = Math.min(uvMin[1], uv.getY(i));
  uvMax[0] = Math.max(uvMax[0], uv.getX(i));
  uvMax[1] = Math.max(uvMax[1], uv.getY(i));
}
console.log(
  `uv range: u ${uvMin[0].toFixed(4)}..${uvMax[0].toFixed(4)} v ${uvMin[1].toFixed(4)}..${uvMax[1].toFixed(4)}`,
);
for (const [label, [tu, tv]] of Object.entries(targets)) {
  let best = -1,
    bestD = Infinity;
  for (let i = 0; i < uv.count; i++) {
    const d = (uv.getX(i) - tu) ** 2 + (uv.getY(i) - tv) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  world.fromBufferAttribute(pos, best).applyMatrix4(screenMesh.matrixWorld);
  console.log(`uv${label} nearest=(${uv.getX(best).toFixed(3)}, ${uv.getY(best).toFixed(3)}) world=${v(world)}`);
}
const n = new THREE.Vector3();
if (g.attributes.normal) {
  const sum = new THREE.Vector3();
  for (let i = 0; i < g.attributes.normal.count; i++) sum.add(n.fromBufferAttribute(g.attributes.normal, i));
  sum.transformDirection(screenMesh.matrixWorld);
  console.log('mean normal (world)', v(sum.normalize()));
}
// Depth (bulge) of the curved glass along the outward normal.
const xs = [];
for (let i = 0; i < pos.count; i++) xs.push(world.fromBufferAttribute(pos, i).applyMatrix4(screenMesh.matrixWorld).x);
console.log(`screen x range ${Math.min(...xs).toFixed(4)}..${Math.max(...xs).toFixed(4)}`);

// Visible aperture: cast straight-on rays over the screen and keep the UVs of rays that
// reach the glass rather than the bezel. Paste the result into TV_SCREEN_APERTURE.
const occluders = [];
gltf.scene.traverse((o) => {
  if (o.isMesh) {
    o.material.side = THREE.DoubleSide;
    occluders.push(o);
  }
});
const box = new THREE.Box3().setFromObject(screenMesh);
const ray = new THREE.Raycaster();
const facing = new THREE.Vector3(0, 0, 0);
for (let i = 0; i < g.attributes.normal.count; i++) facing.add(n.fromBufferAttribute(g.attributes.normal, i));
facing.transformDirection(screenMesh.matrixWorld).normalize();
const aperture = { minU: 1, minV: 1, maxU: 0, maxV: 0 };
const steps = 120;
for (let j = 0; j <= steps; j++) {
  for (let i = 0; i <= steps; i++) {
    // Assumes the TV faces -X as in the attic; screen width runs along Z.
    const z = box.min.z + (i / steps) * (box.max.z - box.min.z);
    const y = box.min.y + (j / steps) * (box.max.y - box.min.y);
    ray.set(new THREE.Vector3(box.min.x, y, z).addScaledVector(facing, 1), facing.clone().negate());
    const hit = ray.intersectObjects(occluders, false)[0];
    if (hit?.object !== screenMesh || !hit.uv) continue;
    aperture.minU = Math.min(aperture.minU, hit.uv.x);
    aperture.maxU = Math.max(aperture.maxU, hit.uv.x);
    aperture.minV = Math.min(aperture.minV, hit.uv.y);
    aperture.maxV = Math.max(aperture.maxV, hit.uv.y);
  }
}
const round = (x) => Math.round(x * 1000) / 1000;
console.log(
  'visible aperture (TV_SCREEN_APERTURE):',
  JSON.stringify(Object.fromEntries(Object.entries(aperture).map(([k, v]) => [k, round(v)]))),
);
