#!/usr/bin/env node
// Import an already-built revision-6 runtime directory. Validate before replacing files;
// never silently restore the old machine-specific revision-5 export.
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeRuntimeManifest } from '../tools/room/runtime-manifest.mjs';
import { verifyRoomAssets } from '../tools/room/verify.mjs';

if (!process.env.ROOM_SOURCE) {
  throw new Error(
    'Set ROOM_SOURCE to a built revision-6 runtime directory, or use pnpm build:room with a Blender source.',
  );
}
const source = resolve(process.env.ROOM_SOURCE);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'public/room');
if (source === target) throw new Error('ROOM_SOURCE is already the runtime directory');
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
const report = await verifyRoomAssets(source, manifest);
await mkdir(target, { recursive: true });
for (const file of manifest.files) {
  if (
    file.name !== 'CREDITS.txt' &&
    !['room.glb', 'tv-high.glb', 'pc-base.glb', 'radio-base.glb', 'ps2-base.glb'].includes(file.name)
  ) {
    throw new Error(`Unexpected room file: ${file.name}`);
  }
}
// The lazy files (the radio's close-up) are imported with the build they belong to; the posters are painted in code.
const lazy = manifest.lazyFiles ?? [];
for (const file of lazy) {
  if (!/^(radio-closeup\.glb|radio-skin-2k\.webp)$/.test(file.name)) {
    throw new Error(`Unexpected lazy room file: ${file.name}`);
  }
}
for (const file of [...manifest.files, ...lazy]) await copyFile(join(source, file.name), join(target, file.name));
await copyFile(join(source, 'manifest.json'), join(target, 'manifest.json'));
await writeRuntimeManifest(root, manifest);
console.log(`Synced verified revision 6: ${(report.totalBytes / 1e6).toFixed(2)} MB`);
