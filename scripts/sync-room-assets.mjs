#!/usr/bin/env node
// Copies the attic room's runtime files from the Blender/Codex export into public/room/
// and writes public/room/manifest.json, so re-syncing after a room revision is one command:
//
//   ROOM_SOURCE=/path/to/attic-room node scripts/sync-room-assets.mjs
//
// The export directory is the source of truth; public/room/ is a generated mirror.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SOURCE = '/Users/roel/Documents/Codex/2026-10-21/i-m-building-my-portfolio-website/outputs/attic-room';

/** Source path (relative to ROOM_SOURCE) -> destination name inside public/room/. */
const FILES = [
  ['room.glb', 'room.glb'],
  // The page opens zoomed on the TV, so the TV ships at close-up detail from the start.
  ['assets/tv-high.glb', 'tv-high.glb'],
  ['assets/pc-base.glb', 'pc-base.glb'],
  ['assets/radio-base.glb', 'radio-base.glb'],
  ['assets/ps2-base.glb', 'ps2-base.glb'],
  ['licenses/ASSET-CREDITS.txt', 'CREDITS.txt'],
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(process.env.ROOM_SOURCE ?? DEFAULT_SOURCE);
const target = join(repoRoot, 'public', 'room');

async function readRevision() {
  try {
    const manifest = JSON.parse(await readFile(join(source, 'scene-manifest.json'), 'utf8'));
    return typeof manifest.revision === 'number' ? manifest.revision : null;
  } catch {
    return null;
  }
}

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function main() {
  await stat(source).catch(() => {
    throw new Error(`ROOM_SOURCE not found: ${source}`);
  });
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });

  const files = [];
  for (const [from, to] of FILES) {
    const src = join(source, from);
    const dst = join(target, to);
    await copyFile(src, dst);
    const { size } = await stat(dst);
    files.push({ name: to, source: from, bytes: size, sha256: await sha256(dst) });
  }

  const manifest = {
    generatedBy: 'scripts/sync-room-assets.mjs',
    sourceRevision: await readRevision(),
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
  await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  for (const file of files) {
    console.log(`${file.name.padEnd(16)} ${(file.bytes / 1e6).toFixed(2).padStart(6)} MB`);
  }
  console.log(`revision ${manifest.sourceRevision}, ${(manifest.totalBytes / 1e6).toFixed(2)} MB -> ${target}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
