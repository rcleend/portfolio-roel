// Targeted rug bake: --prepare decodes the shipped geometry for Blender; without it, publishes its rug-only bake.
// node tools/room/retexture-rug.mjs --work .context/rug-build [--prepare]
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import validator from 'gltf-validator';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { writeRuntimeManifest } from './runtime-manifest.mjs';

const root = resolve(import.meta.dirname, '../..');
const work = resolve(process.argv[process.argv.indexOf('--work') + 1] ?? '.context/rug-build');
const shipped = join(root, 'public/room/room.glb');
await mkdir(work, { recursive: true });
if (process.argv.includes('--prepare')) {
  await copyFile(shipped, join(work, 'room-before.glb'));
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(shipped);
  for (const extension of doc.getRoot().listExtensionsUsed())
    if (extension.extensionName === 'EXT_meshopt_compression') extension.dispose();
  await io.write(join(work, 'runtime.glb'), doc);
} else {
  const before = await readFile(join(work, 'room-before.glb'));
  const jsonLength = before.readUInt32LE(12);
  const json = JSON.parse(before.subarray(20, 20 + jsonLength));
  const binary = before.subarray(28 + jsonLength);
  const material = json.materials.find((entry) => entry.name === '03_Room_floor_BAKED_UNLIT');
  const texture = json.textures[material.pbrMetallicRoughness.baseColorTexture.index];
  const image = json.images[texture.extensions.EXT_texture_webp.source];
  const view = json.bufferViews[image.bufferView];
  const start = view.byteOffset;
  const padded = (length) => Math.ceil(length / 4) * 4;
  const end = start + padded(view.byteLength);
  // Only the rug's existing islands are replaced. Their AgX lighting/fibres come from Cycles, not a flat recolour.
  const replacement = await sharp(binary.subarray(start, start + view.byteLength))
    .composite([{ input: join(work, 'rug-baked.png') }])
    .webp({ quality: 90 })
    .toBuffer();
  const bytes = Buffer.alloc(padded(replacement.length));
  replacement.copy(bytes);
  const delta = bytes.length - (end - start);
  for (const entry of json.bufferViews) {
    if (entry.buffer === 0 && entry.byteOffset >= end) entry.byteOffset += delta;
    const compressed = entry.extensions?.EXT_meshopt_compression;
    if (compressed?.buffer === 0 && compressed.byteOffset >= end) compressed.byteOffset += delta;
  }
  view.byteLength = replacement.length;
  json.buffers[0].byteLength += delta;
  const nextBinary = Buffer.concat([binary.subarray(0, start), bytes, binary.subarray(end)]);
  const encoded = Buffer.from(JSON.stringify(json));
  const nextJson = Buffer.alloc(padded(encoded.length), 0x20);
  encoded.copy(nextJson);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + nextJson.length + nextBinary.length, 8);
  header.writeUInt32LE(nextJson.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(nextBinary.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  const output = Buffer.concat([header, nextJson, binHeader, nextBinary]);
  const checked = await validator.validateBytes(output, { uri: 'room.glb', maxIssues: 100 });
  if (checked.issues.numErrors || checked.issues.numWarnings) throw new Error(JSON.stringify(checked.issues));
  const manifestPath = join(root, 'public/room/manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const file = manifest.files.find((entry) => entry.name === 'room.glb');
  manifest.totalBytes += output.length - file.bytes;
  file.bytes = output.length;
  file.sha256 = createHash('sha256').update(output).digest('hex');
  await writeFile(shipped, output);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeRuntimeManifest(root, manifest);
  console.log(
    `Rug atlas replaced; geometry and all other embedded assets unchanged. Room: ${output.length} bytes (${delta >= 0 ? '+' : ''}${delta}).`,
  );
}
