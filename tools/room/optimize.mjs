// Validate all five generated files before publishing any of them to public/room.
// node tools/room/optimize.mjs --work .context/room-build
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import validator from 'gltf-validator';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { writeRuntimeManifest } from './runtime-manifest.mjs';
import { verifyRoomAssets } from './verify.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const index = process.argv.indexOf('--work');
if (index < 0 || !process.argv[index + 1]) throw new Error('Expected --work /path/to/room-build');
const work = resolve(process.argv[index + 1]);
const staging = join(work, 'optimized');
await mkdir(staging, { recursive: true });
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});
const files = [
  ['room', 'room.glb'],
  ['tv', 'tv-high.glb'],
  ['pc', 'pc-base.glb'],
  ['radio', 'radio-base.glb'],
  ['ps2', 'ps2-base.glb'],
];
const reports = [];
for (const [key, filename] of files) {
  const doc = await io.read(join(work, `${key}-raw.glb`));
  const unlit = doc.createExtension(KHRMaterialsUnlit);
  for (const material of doc.getRoot().listMaterials()) {
    if (!material.getName().endsWith('_UNLIT')) continue;
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
  for (const animation of doc.getRoot().listAnimations()) animation.setName('Lava flow');
  await doc.transform(
    weld(),
    dedup(),
    prune({ keepAttributes: true }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: key === 'tv' ? 94 : 90 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizeTexcoord: 16, quantizePosition: 16 }),
  );
  const output = join(staging, filename);
  await io.write(output, doc);
  const bytes = await readFile(output);
  const validation = await validator.validateBytes(new Uint8Array(bytes), { uri: filename, maxIssues: 100 });
  if (validation.issues.numErrors || validation.issues.numWarnings) {
    throw new Error(`${filename}: ${JSON.stringify(validation.issues)}`);
  }
  reports.push({
    name: filename,
    source: `${key}-raw.glb`,
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    validationErrors: validation.issues.numErrors,
    validationWarnings: validation.issues.numWarnings,
  });
  console.log(`${filename}: ${(bytes.length / 1e6).toFixed(2)} MB, validated`);
}
const bake = JSON.parse(await readFile(join(work, 'bake-report.json'), 'utf8'));
const target = join(root, 'public/room');
const credits = await readFile(join(target, 'CREDITS.txt'));
reports.push({
  name: 'CREDITS.txt',
  source: 'Retained source attribution + revision 6 modifications',
  bytes: credits.length,
  sha256: createHash('sha256').update(credits).digest('hex'),
});
const manifest = {
  generatedBy: 'tools/room/optimize.mjs',
  sourceRevision: 6,
  artDirection: 'After hours — crafted miniature',
  totalBytes: reports.reduce((sum, file) => sum + file.bytes, 0),
  lighting: bake.lighting,
  atlases: bake.atlases,
  files: reports,
};
await copyFile(join(target, 'CREDITS.txt'), join(staging, 'CREDITS.txt'));
await writeFile(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Asset contracts:', await verifyRoomAssets(staging, manifest));
// A failed bake/optimization leaves the previous runtime files untouched.
for (const [, filename] of files) await copyFile(join(staging, filename), join(target, filename));
await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeRuntimeManifest(root, manifest);
console.log(`Revision 6: ${(manifest.totalBytes / 1e6).toFixed(2)} MB total`);
