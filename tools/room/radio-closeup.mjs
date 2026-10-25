// The radio close-up's node stage: proves the 2K skin fits the shipped UVs, compresses the close-up parts,
// computes the triangle lists that cut the lid and keys out of public/room/radio-base.glb, writes the
// extras the runtime validates against, and publishes both lazy files under manifest.lazyFiles.
//   node tools/room/radio-closeup.mjs --work .context/room-build
// Reads radio-uvcheck-raw.glb, radio-skin-2k.png, radio-closeup-raw.glb and radio-closeup.json, which
// tools/room/radio_closeup.py writes into the work directory. Nothing is published unless every check passes.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import validator from 'gltf-validator';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { debrandImage } from './debrand.mjs';
import {
  centroidY,
  encodeTriangles,
  findComponent,
  geometrySha256,
  RADIO_PARTS,
  radioMeshes,
  triangleBounds,
  uvIdentity,
  uvSha256,
} from './radio-geometry.mjs';
import { verifyRadioCloseup } from './verify.mjs';

export const CLOSEUP_FILE = 'radio-closeup.glb';
export const SKIN_FILE = 'radio-skin-2k.webp';
const BASE_FILE = 'radio-base.glb';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const index = process.argv.indexOf('--work');
if (index < 0 || !process.argv[index + 1]) throw new Error('Expected --work /path/to/room-build');
const work = resolve(process.argv[index + 1]);
const target = join(root, 'public/room');
const staging = join(work, 'radio-optimized');
await mkdir(staging, { recursive: true });
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});

// 1. The 2K skin is baked on a fresh unwrap; it is only usable if that unwrap is the shipped one.
const base = radioMeshes(await io.read(join(target, BASE_FILE)));
const identity = uvIdentity(base, radioMeshes(await io.read(join(work, 'radio-uvcheck-raw.glb'))));
console.log('UV identity (worst |Δuv| × 65535 per mesh):', JSON.stringify(identity));

// 2. Compress the close-up parts exactly like optimize.mjs compresses the room.
const document = await io.read(join(work, 'radio-closeup-raw.glb'));
const unlit = document.createExtension(KHRMaterialsUnlit);
for (const material of document.getRoot().listMaterials()) {
  if (!material.getName().endsWith('_UNLIT') || material.getExtension('KHR_materials_unlit')) continue;
  const texture = material.getEmissiveTexture();
  const channel = material.getEmissiveTextureInfo()?.getTexCoord() ?? 0;
  material.setBaseColorFactor([...material.getEmissiveFactor(), 1]);
  material.setBaseColorTexture(texture);
  if (texture) material.getBaseColorTextureInfo().setTexCoord(channel);
  material.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]).setMetallicFactor(0).setRoughnessFactor(1);
  material.setExtension('KHR_materials_unlit', unlit.createUnlit());
}

// 3. Which base triangles are the lid and the keys. The rocker splits at its pivot: ▷II above, ■ below.
const measured = JSON.parse(await readFile(join(work, 'radio-closeup.json'), 'utf8'));
const meshByName = new Map(base.map((mesh) => [mesh.name, mesh]));
const part = (name, triangles) => {
  const mesh = meshByName.get(RADIO_PARTS[name === 'rockerTop' || name === 'rockerBottom' ? 'rocker' : name].mesh);
  return { mesh: mesh.name, ...encodeTriangles(triangles), bounds: triangleBounds(mesh, triangles) };
};
const component = (name) => findComponent(meshByName.get(RADIO_PARTS[name].mesh), RADIO_PARTS[name].bounds);
const rocker = component('rocker');
const rockerMesh = meshByName.get(RADIO_PARTS.rocker.mesh);
const pivotY = measured.rocker.pivot[1];
const parts = {
  lid: part('lid', component('lid').triangles),
  rockerTop: part(
    'rockerTop',
    rocker.triangles.filter((t) => centroidY(rockerMesh, t) >= pivotY),
  ),
  rockerBottom: part(
    'rockerBottom',
    rocker.triangles.filter((t) => centroidY(rockerMesh, t) < pivotY),
  ),
  previous: part('previous', component('previous').triangles),
  next: part('next', component('next').triangles),
};

const scene = document.getRoot().getDefaultScene() ?? document.getRoot().listScenes()[0];
scene.setExtras({
  radioCloseup: 1,
  base: {
    file: BASE_FILE,
    geometrySha256: geometrySha256(base),
    uvSha256: uvSha256(base),
    meshes: Object.fromEntries(
      base.map((mesh) => [mesh.name, { vertices: mesh.vertices, triangles: mesh.indices.length / 3 }]),
    ),
  },
  parts,
  hinge: measured.hinge,
  rocker: measured.rocker,
  keyTravel: measured.keyTravel,
  turntable: measured.turntable,
  slot: measured.slot,
  well: measured.well,
  lcd: measured.lcd,
  led: measured.led,
});

await document.transform(
  weld(),
  dedup(),
  prune({ keepAttributes: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 90, effort: 100 }),
  // 'high' adds meshopt's filters (octahedral normals): the parts are unlit, so their normals only need to exist.
  meshopt({ encoder: MeshoptEncoder, level: 'high', quantizeTexcoord: 16, quantizePosition: 16 }),
);
await io.write(join(staging, CLOSEUP_FILE), document);
const closeup = await readFile(join(staging, CLOSEUP_FILE));
const validation = await validator.validateBytes(new Uint8Array(closeup), { uri: CLOSEUP_FILE, maxIssues: 100 });
if (validation.issues.numErrors || validation.issues.numWarnings) {
  throw new Error(`${CLOSEUP_FILE}: ${JSON.stringify(validation.issues)}`);
}
// The source model's lettering is painted out of the skin (tools/room/debrand.mjs) before it is encoded.
await sharp(await debrandImage(sharp, join(work, 'radio-skin-2k.png')))
  .webp({ quality: 90, effort: 6 })
  .toFile(join(staging, SKIN_FILE));
const skin = await readFile(join(staging, SKIN_FILE));

// 4. Publish: the lazy files sit beside the first-load ones, which stay byte-identical.
const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
const entry = (name, bytes, validated) => ({
  name,
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  ...(validated ? { validationErrors: 0, validationWarnings: 0 } : {}),
});
const published = { ...manifest, lazyFiles: [entry(CLOSEUP_FILE, closeup, true), entry(SKIN_FILE, skin, false)] };
await writeFile(join(staging, BASE_FILE), await readFile(join(target, BASE_FILE)));
console.log('Radio contracts:', JSON.stringify(await verifyRadioCloseup(staging, published)));
await writeFile(join(target, CLOSEUP_FILE), closeup);
await writeFile(join(target, SKIN_FILE), skin);
await writeFile(join(target, 'manifest.json'), `${JSON.stringify(published, null, 2)}\n`);
console.log(
  `${CLOSEUP_FILE}: ${(closeup.length / 1000).toFixed(1)} KB, ${SKIN_FILE}: ${(skin.length / 1000).toFixed(1)} KB`,
);
