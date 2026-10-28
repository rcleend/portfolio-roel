// Publish only the opening-view cabinet, plant and game prints, preserving other baked assets.
// node tools/room/tv-dressing.mjs --work .context/room-build
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { copyToDocument, dedup, meshopt, prune, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { compressBakedTextures } from './baked-textures.mjs';
import { geometrySha256, radioMeshes, uvSha256 } from './radio-geometry.mjs';
import { writeRuntimeManifest } from './runtime-manifest.mjs';
import { verifyRoomAssets } from './verify.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const index = process.argv.indexOf('--work');
assert.ok(index >= 0 && process.argv[index + 1], 'Expected --work /path/to/room-build');
const work = resolve(process.argv[index + 1]);
const target = join(root, 'public/room');
const staging = join(work, 'dressed');
await cp(target, staging, { recursive: true });
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});
const room = await io.read(join(target, 'room.glb'));
const fresh = await io.read(join(work, 'tv-dressing-raw.glb'));
const cabinet = '01_TV_surfaces';
const plant = 'TV desk plant';
const cover = 'PS2 printed cover Product Engineer';
const covers = [cover, 'PS2 printed cover Kingdom Hearts', 'PS2 printed cover LEGO Star Wars'];
const oldCover = 'PS2 printed cover Star Wars Battlefront II';
const replacements = [cabinet, plant, ...covers];
const replaced = new Set([...replacements, oldCover]);
const fingerprint = (document) => {
  const untouched = radioMeshes(document).filter((mesh) => !replaced.has(mesh.name));
  return [geometrySha256(untouched), uvSha256(untouched)].join();
};
const before = fingerprint(room);
assert.deepEqual(
  fresh
    .getRoot()
    .listNodes()
    .filter((node) => node.getMesh())
    .map((node) => node.getName())
    .sort(),
  [...replacements].sort(),
  'Unexpected opening-view export nodes',
);
const unlit = fresh.createExtension(KHRMaterialsUnlit);
for (const material of fresh.getRoot().listMaterials()) {
  assert.ok(material.getName().endsWith('_UNLIT'), `Unexpected material: ${material.getName()}`);
  if (!material.getExtension('KHR_materials_unlit')) {
    const texture = material.getEmissiveTexture();
    const channel = material.getEmissiveTextureInfo()?.getTexCoord() ?? 0;
    material.setBaseColorFactor([...material.getEmissiveFactor(), 1]);
    material.setBaseColorTexture(texture);
    if (texture) material.getBaseColorTextureInfo().setTexCoord(channel);
    material.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]).setMetallicFactor(0).setRoughnessFactor(1);
    material.setExtension('KHR_materials_unlit', unlit.createUnlit());
  }
  const tint = material.getExtras().web_tint;
  if (tint) material.setBaseColorFactor([...tint, 1]);
}
await compressBakedTextures(fresh, 'room');
await fresh.transform(
  weld(),
  dedup(),
  prune({ keepAttributes: true }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizeTexcoord: 16, quantizePosition: 16 }),
);
const group = room
  .getRoot()
  .listNodes()
  .find((node) => node.getName() === '01_TV');
assert.ok(group);
for (const name of replacements) {
  const source = fresh
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === name);
  const original = room
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === name || (name === cover && node.getName() === oldCover));
  const copied = copyToDocument(room, fresh, [source]).get(source);
  if (original) {
    const parent = original.getParentNode();
    assert.equal(parent, group, `${name}: unexpected parent`);
    parent.removeChild(original);
    original.dispose();
  }
  group.addChild(copied);
}
await room.transform(prune({ keepAttributes: true }), unpartition());
await io.write(join(staging, 'room.glb'), room);
const result = await io.read(join(staging, 'room.glb'));
assert.equal(fingerprint(result), before, 'Unrelated room geometry or UVs changed');
const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
for (const name of ['room.glb', 'CREDITS.txt']) {
  const bytes = await readFile(join(staging, name));
  const entry = manifest.files.find((file) => file.name === name);
  entry.bytes = bytes.length;
  entry.sha256 = createHash('sha256').update(bytes).digest('hex');
}
manifest.totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
manifest.atlases['01_TV_plant'] = 1024;
console.log('Room contracts:', await verifyRoomAssets(staging, manifest));
await cp(join(staging, 'room.glb'), join(target, 'room.glb'));
await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeRuntimeManifest(root, manifest);
console.log(`Published opening-view cabinet, plant and game prints: ${manifest.totalBytes} bytes total.`);
