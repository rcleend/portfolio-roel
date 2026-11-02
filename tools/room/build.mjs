import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = process.env.ROOM_SOURCE;
if (!source) throw new Error('Set ROOM_SOURCE to the original revision-5 attic-room.blend. See tools/room/README.md.');
const blender =
  process.env.BLENDER_BIN ??
  (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
const work = resolve(root, process.env.ROOM_BUILD_DIR ?? '.context/room-build');
const input = resolve(source);
if (!existsSync(input)) throw new Error(`Blender source not found: ${input}`);
await mkdir(work, { recursive: true });

async function run(command, args) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}`))));
  });
}
const common = ['-b', '-t', '8', '--python-exit-code', '1', '--python'];
await run(blender, [...common, 'tools/room/restyle.py', '--', '--source', input, '--out', work]);
await run(blender, [
  ...common,
  'tools/room/bake.py',
  '--',
  '--work',
  work,
  '--device',
  process.env.ROOM_BAKE_DEVICE ?? 'CPU',
]);
await run(process.execPath, ['tools/room/optimize.mjs', '--work', work]);
// The radio's close-up is cut from radio-base.glb: rebuild it on the new base (docs/ROOM.md › The CD player).
await run(process.execPath, ['tools/room/build-radio.mjs']);
// The posters are baked in the same scene and published beside the radio's lazy files (docs/ROOM.md › Posters).
await run(process.execPath, ['tools/room/build-posters.mjs']);
// The opal lamp on the TV cabinet is a supplied model, not part of the bake: add it to the new room.glb.
await run(process.execPath, ['tools/room/tv-lamp.mjs']);
