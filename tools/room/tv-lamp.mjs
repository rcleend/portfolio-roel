// Publish the opal desk lamp on the right-hand end of the TV cabinet into room.glb, preserving every other asset.
// node tools/room/tv-lamp.mjs
//
// Source: tools/room/assets/tv-lamp-source.glb (PlexiAndOpaline Desk Lamp, MooseMannequin, Sketchfab Standard).
// Only the opal globe and the round metal base it sits on ship. The cord, the Sketchfab backdrop plane (pPlane8),
// the translucent plexi box around the globe (purple_plexi, White_plexi), the black corner rails that frame it and
// the four metal feet the box stood on are left out of the asset; the base drops by the feet's 2 cm onto the cabinet.
// The lamp is light, not a baked surface: the globe is an opal the runtime brightens past white (`light.glow`), and
// the finish lights the room from its centre (`light`, src/room/atmosphere/tvLamp.ts). Both parts are named like the
// bake (`_BAKED_UNLIT`) so the finish extends them with the room's own program: the base is a dark steel that the
// globe's light warms like any other surface, and the two add one shader program between them, not two.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { copyToDocument, meshopt, prune, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { geometrySha256, radioMeshes, uvSha256 } from './radio-geometry.mjs';
import { writeRuntimeManifest } from './runtime-manifest.mjs';
import { verifyRoomAssets } from './verify.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = join(root, 'public/room');
const staging = join(root, '.context/tv-lamp');
const NAME = 'TV desk lamp';

/** On the cabinet top (y 0.486, x 2.12–2.69, z to 0.675): near its right-hand end and front, whole in the TV view. */
const PLACE = [2.33, 0.486, 0.46];
/** The source's own bounds of the parts that ship (metres, Y up): the base's foot is at y 0.020. */
const FOOT = 0.02;
/** The globe's light; its centre and radius are measured from the globe's own vertices below. */
const LIGHT = {
  color: [1, 0.72, 0.46], // warm opal: a 2700 K bulb behind white glass, matching the room's tungsten practicals
  glow: 2.8, // the globe's unlit colour × this, so it reads as light and blooms in the finish
};
const METAL = [0.008, 0.0075, 0.0085, 1]; // brushed steel under the room's dim night light (~4 % of its albedo)

await mkdir(staging, { recursive: true });
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});

const source = await io.read(join(root, 'tools/room/assets/tv-lamp-source.glb'));
const sourceInfo = source.getRoot().getAsset().extras;
const nodes = source
  .getRoot()
  .listNodes()
  .filter((node) => node.getMesh());
assert.deepEqual(
  nodes.map((node) => node.getName()).sort(),
  [
    'pPlane8_floor_CLR_0',
    'plexiAndOpaline1_Opaline_CLR_0',
    'plexiAndOpaline1_White_plexi_CLR_0',
    'plexiAndOpaline1_cord_CLR_0',
    'plexiAndOpaline1_corners_CLR_0',
    'plexiAndOpaline1_metalParts_CLR_0',
    'plexiAndOpaline1_purple_plexi_CLR_0',
  ],
  'Unexpected lamp source meshes',
);
const byName = (name) => nodes.find((node) => node.getName() === name);

/** World-space positions and the triangle list of a source node, as plain arrays. */
function worldTriangles(node) {
  const primitive = node.getMesh().listPrimitives()[0];
  const positions = primitive.getAttribute('POSITION');
  const sourceNormals = primitive.getAttribute('NORMAL');
  const m = node.getWorldMatrix();
  const p = [0, 0, 0];
  const world = [];
  const normals = [];
  for (let i = 0; i < positions.getCount(); i++) {
    positions.getElement(i, p);
    world.push([
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ]);
    // The source's transforms are a uniform scale and rotations: normals turn with the upper 3 × 3.
    sourceNormals.getElement(i, p);
    const n = [
      m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
      m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
      m[2] * p[0] + m[6] * p[1] + m[10] * p[2],
    ];
    const length = Math.hypot(...n);
    normals.push(n.map((value) => value / length));
  }
  return { world, normals, indices: [...primitive.getIndices().getArray()] };
}

/** Connected pieces of a mesh: triangles sharing a vertex or a position (split normals) belong together. */
function pieces({ world, indices }) {
  const parent = world.map((_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) a = parent[a];
    return a;
  };
  const join = (a, b) => {
    parent[find(a)] = find(b);
  };
  for (let t = 0; t < indices.length; t += 3) {
    join(indices[t], indices[t + 1]);
    join(indices[t], indices[t + 2]);
  }
  const seen = new Map();
  world.forEach((q, i) => {
    const key = q.map((x) => Math.round(x * 1e5)).join();
    if (seen.has(key)) join(i, seen.get(key));
    else seen.set(key, i);
  });
  const groups = new Map();
  for (let t = 0; t < indices.length; t += 3) {
    const id = find(indices[t]);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(indices[t], indices[t + 1], indices[t + 2]);
  }
  return [...groups.values()];
}

const metal = worldTriangles(byName('plexiAndOpaline1_metalParts_CLR_0'));
const metalPieces = pieces(metal);
const radial = (triangles) => Math.max(...triangles.map((i) => Math.hypot(metal.world[i][0], metal.world[i][2])));
// Four feet in the box's corners (≈12 cm out) and the round base under the globe (6.4 cm).
assert.equal(metalPieces.length, 5, 'Expected the base and four corner feet');
const base = metalPieces.filter((triangles) => radial(triangles) < 0.07);
assert.equal(base.length, 1, 'Expected one round base under the globe');
const globe = worldTriangles(byName('plexiAndOpaline1_Opaline_CLR_0'));

/** A new primitive from world positions, moved onto the cabinet. Unlit: no UVs; the finish lights it by its normals. */
function primitive(document, buffer, { world, normals }, triangles, material) {
  const used = [...new Set(triangles)];
  const remap = new Map(used.map((index, i) => [index, i]));
  const positions = new Float32Array(used.length * 3);
  const normalArray = new Float32Array(used.length * 3);
  used.forEach((index, i) => {
    normalArray.set(normals[index], i * 3);
    positions.set([world[index][0] + PLACE[0], world[index][1] - FOOT + PLACE[1], world[index][2] + PLACE[2]], i * 3);
  });
  return document
    .createPrimitive()
    .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer))
    .setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(normalArray).setBuffer(buffer))
    .setIndices(
      document
        .createAccessor()
        .setType('SCALAR')
        .setArray(new Uint16Array(triangles.map((index) => remap.get(index))))
        .setBuffer(buffer),
    )
    .setMaterial(material);
}

const fresh = new Document();
const buffer = fresh.createBuffer();
const unlit = fresh.createExtension(KHRMaterialsUnlit);
const metalMaterial = fresh
  .createMaterial('01_TV_lamp_metal_BAKED_UNLIT')
  .setBaseColorFactor(METAL)
  .setMetallicFactor(0)
  .setRoughnessFactor(1)
  .setExtension('KHR_materials_unlit', unlit.createUnlit());
const globeMaterial = fresh
  .createMaterial('01_TV_lamp_opaline_BAKED_UNLIT')
  .setBaseColorFactor([...LIGHT.color, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(1)
  .setExtension('KHR_materials_unlit', unlit.createUnlit());
// One primitive per node, as everywhere in room.glb: the base and the globe under one lamp node.
const baseNode = fresh
  .createNode(`${NAME} base`)
  .setMesh(fresh.createMesh(`${NAME} base`).addPrimitive(primitive(fresh, buffer, metal, base[0], metalMaterial)));
const globeNode = fresh
  .createNode(`${NAME} globe`)
  .setMesh(
    fresh.createMesh(`${NAME} globe`).addPrimitive(primitive(fresh, buffer, globe, globe.indices, globeMaterial)),
  );

// The light's centre and radius from the globe's own vertices, in the room.
const low = [Infinity, Infinity, Infinity];
const high = [-Infinity, -Infinity, -Infinity];
for (const q of globe.world)
  q.forEach((value, axis) => {
    low[axis] = Math.min(low[axis], value);
    high[axis] = Math.max(high[axis], value);
  });
const round = (value) => Math.round(value * 1e4) / 1e4;
const center = [
  round((low[0] + high[0]) / 2 + PLACE[0]),
  round((low[1] + high[1]) / 2 - FOOT + PLACE[1]),
  round((low[2] + high[2]) / 2 + PLACE[2]),
];
const radius = round((high[0] - low[0]) / 2);

const node = fresh
  .createNode(NAME)
  .addChild(baseNode)
  .addChild(globeNode)
  .setExtras({
    asset_group: '01_TV',
    supplied_asset: 'tv-lamp',
    source_title: sourceInfo.title,
    source_author: sourceInfo.author,
    source_license: sourceInfo.license,
    source_url: sourceInfo.source,
    removed: ['cord', 'pPlane8 backdrop', 'purple_plexi', 'White_plexi', 'corners', 'corner feet'],
    light: { center, radius, color: LIGHT.color, glow: LIGHT.glow },
  });
fresh.createScene().addChild(node);
await fresh.transform(
  weld(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizeTexcoord: 16, quantizePosition: 16 }),
);

const room = await io.read(join(target, 'room.glb'));
const untouched = (document) => {
  const meshes = radioMeshes(document).filter((entry) => !entry.name.startsWith(NAME));
  return [geometrySha256(meshes), uvSha256(meshes)].join();
};
const before = untouched(room);
const group = room
  .getRoot()
  .listNodes()
  .find((entry) => entry.getName() === '01_TV');
assert.ok(group, 'Missing the opening-view group');
for (const old of room
  .getRoot()
  .listNodes()
  .filter((entry) => entry.getName() === NAME)) {
  old.getParentNode()?.removeChild(old);
  old.dispose();
}
const freshNode = fresh
  .getRoot()
  .listNodes()
  .find((entry) => entry.getName() === NAME);
group.addChild(copyToDocument(room, fresh, [freshNode]).get(freshNode));
await room.transform(prune({ keepAttributes: true }), unpartition());
await io.write(join(staging, 'room.glb'), room);
assert.equal(untouched(await io.read(join(staging, 'room.glb'))), before, 'Unrelated room geometry or UVs changed');

await cp(join(target, 'CREDITS.txt'), join(staging, 'CREDITS.txt'));
for (const file of ['tv-high.glb', 'pc-base.glb', 'radio-base.glb', 'ps2-base.glb', ...(await lazyNames())])
  await cp(join(target, file), join(staging, file));
const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
for (const name of ['room.glb', 'CREDITS.txt']) {
  const bytes = await readFile(join(staging, name));
  const entry = manifest.files.find((file) => file.name === name);
  entry.bytes = bytes.length;
  entry.sha256 = createHash('sha256').update(bytes).digest('hex');
}
manifest.totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
console.log('Room contracts:', await verifyRoomAssets(staging, manifest));
await cp(join(staging, 'room.glb'), join(target, 'room.glb'));
await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeRuntimeManifest(root, manifest);
console.log(
  `Published the TV desk lamp (light at ${center.join(', ')}, r ${radius}): ${manifest.totalBytes} bytes total.`,
);

async function lazyNames() {
  const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
  return (manifest.lazyFiles ?? []).map((file) => file.name);
}
