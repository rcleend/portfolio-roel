// The room at half the atlas size, for devices that start below the top quality tier (docs/ROOM.md › Quality):
//   pnpm build:room-small
// Reads the published public/room/room.glb and writes room-1k.glb beside it: the same scene, geometry, materials and
// extras, every 2048 px atlas but the floor's resampled to 1024 px (Lanczos) and encoded again as WebP. Nothing else is
// touched, so it needs no Blender source; run it again whenever room.glb changes (pnpm verify:room holds them in step).
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

export const SMALL_ROOM = 'room-1k.glb';
export const SMALL_ATLAS = 1024;
/** Atlases the small room keeps at full size. */
export const KEPT = new Set(['03_Room_floor']);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = join(root, 'public/room');

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
  const source = await readFile(join(directory, 'room.glb'));
  const doc = await io.readBinary(new Uint8Array(source));
  const resized = [];
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    const meta = await sharp(image).metadata();
    // The baked atlases; the window's exterior plate (1448 px, what the rain refracts) stays as it is.
    if (Math.max(meta.width, meta.height) < 2 * SMALL_ATLAS) continue;
    // The floor and its rug fill the bottom of every room view, nearest the camera: at 1024 px the rug's pile goes soft.
    if (KEPT.has(texture.getName())) continue;
    const small = await sharp(image)
      .resize({ width: SMALL_ATLAS, height: SMALL_ATLAS, fit: 'inside', kernel: 'lanczos3' })
      .webp({ quality: 92, effort: 6 })
      .toBuffer();
    texture.setImage(new Uint8Array(small)).setMimeType('image/webp');
    resized.push({
      name: texture.getName() || texture.getURI(),
      from: `${meta.width}×${meta.height}`,
      bytes: [image.length, small.length],
    });
  }
  const bytes = Buffer.from(await io.writeBinary(doc));
  await writeFile(join(directory, SMALL_ROOM), bytes);

  const manifestPath = join(directory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const entry = {
    name: SMALL_ROOM,
    source: 'room.glb',
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  manifest.variants = [...(manifest.variants ?? []).filter((file) => file.name !== SMALL_ROOM), entry];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // The loader's progress weight for it (the other files' are roomAssetSizes.json).
  await writeFile(
    join(root, 'src/room/assets/roomSmallSizes.json'),
    `${JSON.stringify({ [SMALL_ROOM]: bytes.length }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ ...entry, roomBytes: source.length, resized }, null, 2));
}
