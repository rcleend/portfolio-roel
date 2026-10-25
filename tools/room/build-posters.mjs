// pnpm build:posters — the decorated attic (docs/ROOM.md › Posters): lays out and packs the pieces, bakes them in
// the room's own night scene (tools/room/posters.py, one Blender process per stage and pass so that no command
// holds the machine for long), composes the two atlas tiers, then proves, compresses and publishes the lazy files
// (tools/room/posters.mjs). Reads the restyled ROOM_BUILD_DIR/room-source.blend that `pnpm build:room` writes
// (default .context/room-build); never saves it. POSTERS_SOURCE names the folder of artwork masters.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const blender =
  process.env.BLENDER_BIN ??
  (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
const work = resolve(root, process.env.ROOM_BUILD_DIR ?? '.context/room-build');
if (!existsSync(join(work, 'room-source.blend'))) {
  throw new Error(`No room-source.blend in ${work}: run pnpm build:room first, or set ROOM_BUILD_DIR.`);
}
if (!process.env.POSTERS_SOURCE) {
  throw new Error('Set POSTERS_SOURCE to the folder of artwork masters (tools/room/assets/posters/SOURCES.md).');
}
const device = process.env.ROOM_BAKE_DEVICE ?? 'CPU';
/** posters.py's exit code when a skirt side had to widen: the layout is packed again and everything rebaked. */
const WIDENED = 3;
const MAX_LAYOUTS = 4;

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => resolveRun(code));
  });
}
async function stage(name, extra = []) {
  const args = ['-b', '--factory-startup', '--python-exit-code', '1', '--python', 'tools/room/posters.py', '--'];
  return run(blender, [...args, '--work', work, '--stage', name, '--device', device, ...extra]);
}
async function must(code, what) {
  if (code !== 0) throw new Error(`posters ${what} exited ${code}`);
}

/**
 * The compose stage's noise gate (SPEC 5.2) holds the posters to the room wall's own grain, read from
 * WORK/posters-wall-baseline.png: the room build's bake of the window-side wall when this work folder has it, else the
 * wall atlas room.glb ships (a rebuild from a copied room-source.blend has no bakes). Never skipped for want of one.
 */
async function writeWallBaseline() {
  const baked = join(work, 'baked', '03_Room_window.png');
  const target = join(work, 'posters-wall-baseline.png');
  if (existsSync(baked)) {
    await sharp(await readFile(baked)).toFile(target);
    return;
  }
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.read(join(root, 'public/room/room.glb'));
  const wall = document
    .getRoot()
    .listTextures()
    .find((texture) => texture.getName() === '03_Room_window');
  const bytes = wall?.getImage();
  if (!bytes) throw new Error('public/room/room.glb carries no 03_Room_window atlas for the noise gate.');
  await sharp(Buffer.from(bytes)).png({ compressionLevel: 1 }).toColourspace('rgb16').toFile(target);
}

await writeWallBaseline();
let composed = false;
for (let attempt = 1; attempt <= MAX_LAYOUTS && !composed; attempt++) {
  await must(await stage('layout'), 'layout');
  // The colour and normal guides first (seconds), then the lit passes; each its own process (tools/room/README.md).
  for (const pass of ['albedo', 'normal', 'beauty', 'under', 'bare', 'shadow']) {
    await must(await stage('bake', ['--passes', pass]), `bake ${pass}`);
  }
  const code = await stage('compose');
  if (code === WIDENED) continue;
  await must(code, 'compose');
  composed = true;
}
if (!composed) throw new Error(`posters: skirts still widening after ${MAX_LAYOUTS} layouts`);
await must(await run(process.execPath, ['tools/room/posters.mjs', '--work', work]), 'node stage');
