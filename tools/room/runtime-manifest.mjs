import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function assetSizes(manifest) {
  return Object.fromEntries(
    manifest.files.filter((file) => file.name.endsWith('.glb')).map((file) => [file.name, file.bytes]),
  );
}

/** Vite's public directory is served verbatim; bundle a generated size table from src. */
export async function writeRuntimeManifest(root, manifest) {
  await writeFile(
    join(root, 'src/room/assets/roomAssetSizes.json'),
    `${JSON.stringify(assetSizes(manifest), null, 2)}\n`,
  );
}
