// The posters' node stage: turns the Blender stage's shipped geometry and composed atlases into the lazy
// posters.glb and its two texture tiers, checks them, and publishes all three under manifest.lazyFiles.
//   node tools/room/posters.mjs --work /path/to/posters-work
// Reads posters-geometry.json, posters-atlas-2k.png and posters-atlas-1k.png, which `tools/room/posters.py`
// writes into the work directory. Nothing is published unless every check passes.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import validator from 'gltf-validator';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { overhangJoinGap } from './posters-geometry.mjs';
import { verifyPosters } from './verify.mjs';

export const POSTERS_FILE = 'posters.glb';
export const POSTERS_TIERS = { '2k': 'posters-2k.webp', '1k': 'posters-1k.webp' };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Blender's right-handed Z-up → glTF's Y-up: (x, y, z) → (x, z, -y). */
const toGltf = ([x, y, z]) => [x, z, -y];

/**
 * A piece's vertex normals, area-weighted over its own triangles: the wall's or the slope's for a sheet, smooth over
 * a curl, the faces' for a pin or the cork's frame.
 */
function pieceNormals(points, tris) {
  const sums = points.map(() => [0, 0, 0]);
  for (const [a, b, c] of tris) {
    const u = points[b].map((v, axis) => v - points[a][axis]);
    const w = points[c].map((v, axis) => v - points[a][axis]);
    const cross = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    for (const k of [a, b, c]) for (let axis = 0; axis < 3; axis++) sums[k][axis] += cross[axis];
  }
  return sums.flatMap((sum) => {
    const length = Math.hypot(...sum);
    if (length === 0) throw new Error('posters: a vertex without a triangle');
    return sum.map((v) => v / length);
  });
}

/**
 * The glTF document: one node, two primitives (opaque cards first, ascending layer; multiply skirts second), no
 * image (the runtime binds the tier it fetched), and per item the box of everything it emits for the per-pose
 * visibility rule.
 */
export function postersDocument(geometry, atlasSize, rings) {
  const document = new Document();
  const buffer = document.createBuffer();
  const unlit = document.createExtension(KHRMaterialsUnlit);
  const mesh = document.createMesh('posters');
  const boxes = new Map();
  for (const name of ['cards', 'skirts']) {
    const pieces = geometry.meshes.filter((piece) => piece.primitive === name);
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];
    for (const piece of pieces) {
      const start = positions.length / 3;
      normals.push(...pieceNormals(piece.positions.map(toGltf), piece.tris));
      const box = boxes.get(piece.item) ?? {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
      };
      for (const point of piece.positions) {
        const p = toGltf(point);
        positions.push(...p);
        for (let axis = 0; axis < 3; axis++) {
          box.min[axis] = Math.min(box.min[axis], p[axis]);
          box.max[axis] = Math.max(box.max[axis], p[axis]);
        }
      }
      boxes.set(piece.item, box);
      // Blender's UV origin is bottom-left, glTF's top-left.
      for (const [u, v] of piece.uvs) uvs.push(u, 1 - v);
      for (const triangle of piece.tris) indices.push(...triangle.map((k) => k + start));
    }
    const material = document
      .createMaterial(`posters_${name}`)
      .setBaseColorFactor([1, 1, 1, 1])
      .setMetallicFactor(0)
      .setRoughnessFactor(1)
      .setExtension('KHR_materials_unlit', unlit.createUnlit());
    if (name === 'skirts') material.setAlphaMode('BLEND');
    const primitive = document
      .createPrimitive()
      .setMaterial(material)
      .setAttribute(
        'POSITION',
        document.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer),
      )
      // Unlit draws ignore them, but three.js keys its programs on whether a geometry has normals: with them the
      // cards share the room's baked surfaces' program, and the skirts and fading cards share one more.
      .setAttribute(
        'NORMAL',
        document.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer),
      )
      .setAttribute(
        'TEXCOORD_0',
        document.createAccessor().setType('VEC2').setArray(new Float32Array(uvs)).setBuffer(buffer),
      )
      .setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer));
    if (positions.length / 3 > 65535) throw new Error(`posters ${name}: too many vertices for 16-bit indices`);
    mesh.addPrimitive(primitive);
  }
  const round = (values) => values.map((v) => Math.round(v * 1e4) / 1e4);
  const node = document
    .createNode('posters')
    .setMesh(mesh)
    .setExtras({
      posters: 1,
      atlas: atlasSize,
      skirtRings: rings,
      triangles: geometry.triangles,
      decor: [...boxes].map(([id, box]) => ({ decor_id: id, min: round(box.min), max: round(box.max) })),
    });
  document.createScene('posters').addChild(node);
  return document;
}

async function main() {
  const index = process.argv.indexOf('--work');
  if (index < 0 || !process.argv[index + 1]) throw new Error('Expected --work /path/to/posters-work');
  const work = resolve(process.argv[index + 1]);
  const target = join(root, 'public/room');
  const staging = join(work, 'posters-optimized');
  await mkdir(staging, { recursive: true });
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
  const layout = JSON.parse(await readFile(join(root, 'tools/room/assets/posters/layout.json'), 'utf8'));
  const geometry = JSON.parse(await readFile(join(work, 'posters-geometry.json'), 'utf8'));
  // Spec 6.2: a tape's overhang starts on its card's surface (the per-item pieces exist only here, before the merge).
  const joinGap = overhangJoinGap(geometry.meshes);
  if (joinGap > 1e-4) throw new Error(`posters: an overhang starts ${(joinGap * 1000).toFixed(2)} mm off its card`);
  console.log(`Overhang joins: widest gap ${(joinGap * 1000).toFixed(3)} mm`);
  const report = JSON.parse(await readFile(join(work, 'posters-tapes.json'), 'utf8'));
  // The compose stage lists the runs of 1 cm segments of every easing skirt's outer 2 px ring that the wall shows
  // whole.
  const document = postersDocument(geometry, layout.atlas.size, report.skirtRingRects);
  await document.transform(
    prune({ keepAttributes: true }),
    meshopt({
      encoder: MeshoptEncoder,
      level: 'medium',
      quantizeTexcoord: 16,
      quantizePosition: 16,
      quantizeNormal: 8,
    }),
  );
  const glb = await io.writeBinary(document);
  const validation = await validator.validateBytes(glb, { uri: POSTERS_FILE, maxIssues: 100 });
  if (validation.issues.numErrors || validation.issues.numWarnings) {
    throw new Error(`${POSTERS_FILE}: ${JSON.stringify(validation.issues)}`);
  }
  await writeFile(join(staging, POSTERS_FILE), glb);
  // The 1K is composed per island by the Blender stage (never a resample of the packed 2K).
  for (const [tier, file] of Object.entries(POSTERS_TIERS)) {
    await sharp(join(work, `posters-atlas-${tier}.png`))
      .webp({ quality: 90, effort: 6 })
      .toFile(join(staging, file));
  }

  const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
  const entry = async (name, validated) => {
    const bytes = await readFile(join(staging, name));
    return {
      name,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      ...(validated ? { validationErrors: 0, validationWarnings: 0 } : {}),
    };
  };
  const ours = [
    await entry(POSTERS_FILE, true),
    ...(await Promise.all(Object.values(POSTERS_TIERS).map((f) => entry(f, false)))),
  ];
  // Merged by name: the radio's lazy files stay as they are.
  const kept = (manifest.lazyFiles ?? []).filter((file) => !ours.some((own) => own.name === file.name));
  // CREDITS.txt carries the posters' third-party note, so its entry and the room's total follow the file.
  const credits = await readFile(join(target, 'CREDITS.txt'));
  const files = manifest.files.map((file) =>
    file.name === 'CREDITS.txt'
      ? { ...file, bytes: credits.length, sha256: createHash('sha256').update(credits).digest('hex') }
      : file,
  );
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  const published = { ...manifest, totalBytes, files, lazyFiles: [...kept, ...ours] };
  console.log('Posters contracts:', JSON.stringify(await verifyPosters(staging, published)));
  for (const file of ours) await writeFile(join(target, file.name), await readFile(join(staging, file.name)));
  await writeFile(join(target, 'manifest.json'), `${JSON.stringify(published, null, 2)}\n`);
  console.log(ours.map((file) => `${file.name}: ${(file.bytes / 1000).toFixed(1)} KB`).join(', '));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
