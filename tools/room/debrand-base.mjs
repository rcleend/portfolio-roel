// node tools/room/debrand-base.mjs — paints the source model's lettering out of the shipped
// public/room/radio-base.glb in place (tools/room/debrand.mjs has the table and the fill). The radio-base.glb this
// branch ships predates the debrand pass that optimize.mjs now runs, and its bake cannot be reproduced byte for byte,
// so this repaints its one atlas, proves the geometry and UVs untouched, and republishes the manifests. An atlas
// that already carries no lettering is left alone, so it never re-encodes twice.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { debrandImage, letteringResidue, UNBRANDED } from './debrand.mjs';
import { geometrySha256, radioMeshes, uvSha256 } from './radio-geometry.mjs';
import { writeRuntimeManifest } from './runtime-manifest.mjs';
import { verifyRadioCloseup, verifyRoomAssets } from './verify.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = join(root, 'public/room');
const file = join(target, 'radio-base.glb');
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});
const document = await io.read(file);
const textures = document.getRoot().listTextures();
if (textures.length !== 1) throw new Error(`radio-base.glb carries ${textures.length} textures, expected its atlas`);
const [atlas] = textures;
const residue = await letteringResidue(sharp, atlas.getImage());
if (residue <= UNBRANDED) {
  console.log(`radio-base.glb already carries no lettering (residue ${residue.toFixed(2)})`);
  process.exit(0);
}
const fingerprint = (doc) => [geometrySha256(radioMeshes(doc)), uvSha256(radioMeshes(doc))].join();
const before = fingerprint(document);
// optimize.mjs's radio quality: one more generation of the same encoder, on an atlas that is otherwise the same.
atlas.setImage(
  await sharp(await debrandImage(sharp, atlas.getImage()))
    .webp({ quality: 90 })
    .toBuffer(),
);
const bytes = Buffer.from(await io.writeBinary(document));
if (fingerprint(await io.readBinary(new Uint8Array(bytes))) !== before) {
  throw new Error('Repacking radio-base.glb changed its geometry or UVs');
}
const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
const entry = manifest.files.find((candidate) => candidate.name === 'radio-base.glb');
manifest.totalBytes += bytes.length - entry.bytes;
entry.bytes = bytes.length;
entry.sha256 = createHash('sha256').update(bytes).digest('hex');
const shipped = await readFile(file);
await writeFile(file, bytes);
try {
  await verifyRoomAssets(target, manifest);
  await verifyRadioCloseup(target, manifest);
} catch (error) {
  await writeFile(file, shipped);
  throw error;
}
await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeRuntimeManifest(root, manifest);
console.log(`radio-base.glb: lettering painted out (residue ${residue.toFixed(2)}), ${bytes.length} B`);
