// Publish only refreshed PC/radio assets; preserve the rest of the room byte for byte.
// See README.md › Device surface refinement for the three Blender inputs.
import { createHash } from 'node:crypto';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { debrandImage } from './debrand.mjs';
import { geometrySha256, radioMeshes, uvIdentity, uvSha256 } from './radio-geometry.mjs';
import { writeRuntimeManifest } from './runtime-manifest.mjs';
import { verifyRadioCloseup, verifyRoomAssets } from './verify.mjs';

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

const pc = await io.read(join(work, 'pc-raw.glb'));
const unlit = pc.createExtension(KHRMaterialsUnlit);
for (const material of pc.getRoot().listMaterials()) {
  if (material.getExtension('KHR_materials_unlit')) continue;
  if (!material.getName().endsWith('_UNLIT')) throw new Error(`Unexpected PC material: ${material.getName()}`);
  const texture = material.getEmissiveTexture();
  const channel = material.getEmissiveTextureInfo()?.getTexCoord() ?? 0;
  material.setBaseColorFactor([...material.getEmissiveFactor(), 1]);
  material.setBaseColorTexture(texture);
  if (texture) material.getBaseColorTextureInfo().setTexCoord(channel);
  material.setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]).setMetallicFactor(0).setRoughnessFactor(1);
  material.setExtension('KHR_materials_unlit', unlit.createUnlit());
}
await pc.transform(
  weld(),
  dedup(),
  prune({ keepAttributes: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 94, resize: [2048, 2048] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizeTexcoord: 16, quantizePosition: 16 }),
);
await io.write(join(staging, 'pc-base.glb'), pc);

// The radio's lid/key triangle indices are a runtime contract. Replace only the
// atlas, prove its fresh bake fits, then prove the repack preserves that contract.
const radio = await io.read(join(target, 'radio-base.glb'));
const meshes = radioMeshes(radio);
const probe = radioMeshes(await io.read(join(work, 'radio-uvcheck-raw.glb')));
console.log('Radio UV identity:', uvIdentity(meshes, probe));
const fingerprint = (doc) => [geometrySha256(radioMeshes(doc)), uvSha256(radioMeshes(doc))].join();
const before = fingerprint(radio);
const textures = radio.getRoot().listTextures();
if (textures.length !== 1) throw new Error('Expected one radio atlas');
for (const size of [1024, 2048]) {
  // Remove lettering after resizing, exactly on the final atlas's pixels.
  const png = await sharp(join(work, 'radio-skin-2k.png')).resize(size, size).png().toBuffer();
  const webp = await sharp(await debrandImage(sharp, png))
    .webp({ quality: 94, effort: 6 })
    .toBuffer();
  if (size === 1024) textures[0].setImage(webp).setMimeType('image/webp');
  else await writeFile(join(staging, 'radio-skin-2k.webp'), webp);
}
const bytes = await io.writeBinary(radio);
if (fingerprint(await io.readBinary(bytes)) !== before) throw new Error('Radio geometry or UVs changed');
await writeFile(join(staging, 'radio-base.glb'), bytes);

const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
const changed = ['pc-base.glb', 'radio-base.glb', 'radio-skin-2k.webp'];
for (const name of changed) {
  const data = await readFile(join(staging, name));
  const entry = [...manifest.files, ...manifest.lazyFiles].find((file) => file.name === name);
  entry.bytes = data.length;
  entry.sha256 = createHash('sha256').update(data).digest('hex');
}
manifest.totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
console.log('Room contracts:', await verifyRoomAssets(staging, manifest));
console.log('Radio contracts:', await verifyRadioCloseup(staging, manifest));
// All asset/UV/hash/size contracts passed before any runtime file is replaced.
for (const name of changed) await cp(join(staging, name), join(target, name));
await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeRuntimeManifest(root, manifest);
console.log('Published refined PC and radio surfaces.');
