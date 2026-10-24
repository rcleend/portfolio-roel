// pnpm build:radio — the CD player's lazy close-up (docs/ROOM.md › The CD player): bakes the 2K skin on the
// shipped radio's UVs and the parts an open lid reveals (tools/room/radio_closeup.py, two Blender processes),
// then proves, compresses and publishes them (tools/room/radio-closeup.mjs). Reads the restyled
// ROOM_BUILD_DIR/room-source.blend that `pnpm build:room` writes (default .context/room-build); never saves it.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const blender =
  process.env.BLENDER_BIN ??
  (process.platform === 'darwin' ? '/Applications/Blender.app/Contents/MacOS/Blender' : 'blender');
const work = resolve(root, process.env.ROOM_BUILD_DIR ?? '.context/room-build');
if (!existsSync(join(work, 'room-source.blend'))) {
  throw new Error(`No room-source.blend in ${work}: run pnpm build:room first, or set ROOM_BUILD_DIR.`);
}

async function run(command, args) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}`))));
  });
}
const device = process.env.ROOM_BAKE_DEVICE ?? 'CPU';
for (const stage of ['skin', 'closeup']) {
  await run(blender, [
    '-b',
    '-t',
    '8',
    '--python-exit-code',
    '1',
    '--python',
    'tools/room/radio_closeup.py',
    '--',
    '--work',
    work,
    '--stage',
    stage,
    '--device',
    device,
  ]);
}
await run(process.execPath, ['tools/room/radio-closeup.mjs', '--work', work]);
