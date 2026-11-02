// Publishes a prop built outside the bake (the opal lamp, the neon sign) into room.glb under `01_TV`, preserving
// every other asset: the prop's node replaces any earlier one of the same name, the script checks that no other
// geometry or UV changed, re-verifies the whole set of room assets in a staging folder and only then writes
// public/room/room.glb, its manifest and the runtime manifest. Re-running a publisher gives a byte-identical file.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { copyToDocument, meshopt, prune, unpartition, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { geometrySha256, radioMeshes, uvSha256 } from './radio-geometry.mjs';
import { writeRuntimeManifest } from './runtime-manifest.mjs';
import { verifyRoomAssets } from './verify.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const target = join(root, 'public/room');

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});

/**
 * Adds the node called `name` of `fresh` (a document holding only the prop) to room.glb's `01_TV` group. `staging` is
 * a folder name under .context/. Returns the new manifest's total bytes.
 */
export async function publishTvProp(fresh, name, staging) {
  const stagingDir = join(root, '.context', staging);
  await mkdir(stagingDir, { recursive: true });
  await fresh.transform(
    weld(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizeTexcoord: 16, quantizePosition: 16 }),
  );

  const room = await io.read(join(target, 'room.glb'));
  const untouched = (document) => {
    const meshes = radioMeshes(document).filter((entry) => !entry.name.startsWith(name));
    // The props built here (the lamp, the sign) carry no UVs: their geometry is checked, their UVs have none to check.
    return [
      geometrySha256(meshes),
      uvSha256(meshes.filter((entry) => entry.primitive.getAttribute('TEXCOORD_0'))),
    ].join();
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
    .filter((entry) => entry.getName() === name)) {
    old.getParentNode()?.removeChild(old);
    old.dispose();
  }
  const freshNode = fresh
    .getRoot()
    .listNodes()
    .find((entry) => entry.getName() === name);
  group.addChild(copyToDocument(room, fresh, [freshNode]).get(freshNode));
  await room.transform(prune({ keepAttributes: true }), unpartition());
  await io.write(join(stagingDir, 'room.glb'), room);
  assert.equal(
    untouched(await io.read(join(stagingDir, 'room.glb'))),
    before,
    'Unrelated room geometry or UVs changed',
  );

  await cp(join(target, 'CREDITS.txt'), join(stagingDir, 'CREDITS.txt'));
  const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
  const lazy = (manifest.lazyFiles ?? []).map((file) => file.name);
  for (const file of ['tv-high.glb', 'pc-base.glb', 'radio-base.glb', 'ps2-base.glb', ...lazy])
    await cp(join(target, file), join(stagingDir, file));
  for (const file of ['room.glb', 'CREDITS.txt']) {
    const bytes = await readFile(join(stagingDir, file));
    const entry = manifest.files.find((candidate) => candidate.name === file);
    entry.bytes = bytes.length;
    entry.sha256 = createHash('sha256').update(bytes).digest('hex');
  }
  manifest.totalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
  console.log('Room contracts:', await verifyRoomAssets(stagingDir, manifest));
  await cp(join(stagingDir, 'room.glb'), join(target, 'room.glb'));
  await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeRuntimeManifest(root, manifest);
  return manifest.totalBytes;
}
