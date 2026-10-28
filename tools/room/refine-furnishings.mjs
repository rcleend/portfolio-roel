// Refresh the TV and four shared furniture/window atlases, preserving the rest of the room.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { copyToDocument, dedup, meshopt, prune, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { compressBakedTextures, REFINED_ROOM_ATLASES } from './baked-textures.mjs';
import { geometrySha256, radioMeshes, uvIdentity, uvSha256 } from './radio-geometry.mjs';
import { writeRuntimeManifest } from './runtime-manifest.mjs';
import { verifyRoomAssets } from './verify.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const index = process.argv.indexOf('--work');
if (index < 0 || !process.argv[index + 1]) throw new Error('Expected --work /path/to/room-build');
const work = resolve(process.argv[index + 1]);
const target = join(root, 'public/room');
const staging = join(work, 'refined');
await cp(target, staging, { recursive: true });
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});
const newUvNodes = new Set(['02_Desk_surfaces', '04_Drawer_surfaces']);
const fingerprint = (doc) => {
  const untouched = radioMeshes(doc).filter((mesh) => !newUvNodes.has(mesh.name));
  return [geometrySha256(untouched), uvSha256(untouched)].join();
};
const runtimeCost = (doc) => {
  const primitives = doc
    .getRoot()
    .listMeshes()
    .flatMap((mesh) => mesh.listPrimitives());
  return {
    primitives: primitives.length,
    triangles: primitives.reduce((sum, primitive) => sum + primitive.getIndices().getCount() / 3, 0),
    texturePixels: doc
      .getRoot()
      .listTextures()
      .reduce((sum, texture) => {
        const [width, height] = texture.getSize();
        return sum + width * height;
      }, 0),
  };
};

const room = await io.read(join(target, 'room.glb'));
const before = fingerprint(room);
const probe = await io.read(join(work, 'furnishings-raw.glb'));
const replacementMeshes = radioMeshes(probe);
const names = new Set(replacementMeshes.map((mesh) => mesh.name));
assert.deepEqual([...names].sort(), [...REFINED_ROOM_ATLASES].sort(), 'Unexpected furniture export nodes');
const shippedMeshes = radioMeshes(room).filter((mesh) => names.has(mesh.name));
for (const mesh of shippedMeshes) {
  assert.equal(
    mesh.indices.length,
    replacementMeshes.find((fresh) => fresh.name === mesh.name).indices.length,
    `${mesh.name}: triangle count changed`,
  );
}
// Geometry stays in place even where the lamps need a new continuous UV strip.
uvIdentity(shippedMeshes, replacementMeshes, 1);
console.log(
  'Furniture UV identity:',
  uvIdentity(
    shippedMeshes.filter((mesh) => !newUvNodes.has(mesh.name)),
    replacementMeshes,
  ),
);
await compressBakedTextures(probe, 'room');
for (const atlas of REFINED_ROOM_ATLASES) {
  const textures = room
    .getRoot()
    .listTextures()
    .filter((texture) => texture.getName().startsWith(atlas));
  const fresh = probe
    .getRoot()
    .listTextures()
    .filter((texture) => texture.getName().startsWith(atlas));
  assert.equal(textures.length, 1, `${atlas}: expected one shipped atlas`);
  assert.equal(fresh.length, 1, `${atlas}: expected one fresh atlas`);
  assert.deepEqual(textures[0].getSize(), fresh[0].getSize(), `${atlas}: texture allocation changed`);
  textures[0].setImage(fresh[0].getImage()).setMimeType('image/webp');
}
await probe.transform(
  weld(),
  dedup(),
  prune({ keepAttributes: true }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizeTexcoord: 16, quantizePosition: 16 }),
);
for (const name of newUvNodes) {
  const original = room
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === name);
  const fresh = probe
    .getRoot()
    .listNodes()
    .find((node) => node.getName() === name);
  const material = original.getMesh().listPrimitives()[0].getMaterial();
  const copied = copyToDocument(room, probe, [fresh.getMesh()]).get(fresh.getMesh());
  for (const primitive of copied.listPrimitives()) primitive.setMaterial(material);
  original
    .setMesh(copied)
    .setTranslation(fresh.getTranslation())
    .setRotation(fresh.getRotation())
    .setScale(fresh.getScale());
}
await room.transform(prune({ keepAttributes: true }), unpartition());
const roomBytes = await io.writeBinary(room);
const repackedRoom = await io.readBinary(roomBytes);
assert.equal(fingerprint(repackedRoom), before, 'Untouched room geometry or UVs changed');
const baselineRoom = await io.read(join(target, 'room.glb'));
uvIdentity(
  radioMeshes(baselineRoom).filter((mesh) => names.has(mesh.name)),
  radioMeshes(repackedRoom),
  1,
);
assert.deepEqual(runtimeCost(repackedRoom), runtimeCost(baselineRoom), 'Room runtime cost changed');
await writeFile(join(staging, 'room.glb'), roomBytes);

const tv = await io.read(join(work, 'tv-raw.glb'));
const unlit = tv.createExtension(KHRMaterialsUnlit);
for (const material of tv.getRoot().listMaterials()) {
  if (material.getExtension('KHR_materials_unlit')) continue;
  assert.ok(material.getName().endsWith('_UNLIT'), `Unexpected TV material: ${material.getName()}`);
  const texture = material.getEmissiveTexture();
  const channel = material.getEmissiveTextureInfo()?.getTexCoord() ?? 0;
  material.setBaseColorFactor([...material.getEmissiveFactor(), 1]);
  material.setBaseColorTexture(texture);
  if (texture) material.getBaseColorTextureInfo().setTexCoord(channel);
  material.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]).setMetallicFactor(0).setRoughnessFactor(1);
  material.setExtension('KHR_materials_unlit', unlit.createUnlit());
}
await compressBakedTextures(tv, 'tv');
await tv.transform(
  weld(),
  dedup(),
  prune({ keepAttributes: true }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizeTexcoord: 16, quantizePosition: 16 }),
);
await io.write(join(staging, 'tv-high.glb'), tv);
const originalTv = await io.read(join(target, 'tv-high.glb'));
const updatedTv = await io.read(join(staging, 'tv-high.glb'));
assert.deepEqual(runtimeCost(updatedTv), runtimeCost(originalTv), 'TV runtime cost changed');
// All TV triangles stay in place; only the casing's atlas coordinates may change.
uvIdentity(radioMeshes(originalTv), radioMeshes(updatedTv), 1);
const screen = (doc) => radioMeshes(doc).filter((mesh) => mesh.name === 'TV_Interactive_Screen_high');
assert.equal(screen(originalTv).length, 1);
console.log('TV screen UV identity:', uvIdentity(screen(originalTv), screen(updatedTv)));

const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
const changed = ['room.glb', 'tv-high.glb'];
for (const name of changed) {
  const bytes = await readFile(join(staging, name));
  const entry = manifest.files.find((file) => file.name === name);
  entry.bytes = bytes.length;
  entry.sha256 = createHash('sha256').update(bytes).digest('hex');
}
manifest.totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
console.log('Room contracts:', await verifyRoomAssets(staging, manifest));
for (const name of changed) await cp(join(staging, name), join(target, name));
await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeRuntimeManifest(root, manifest);
console.log('Published refined TV, cabinet, desk, lamps and window surfaces.');
