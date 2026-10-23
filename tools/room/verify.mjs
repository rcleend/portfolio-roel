import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import validator from 'gltf-validator';
import { MeshoptDecoder } from 'meshoptimizer';
import { assetSizes } from './runtime-manifest.mjs';

const FILES = ['room.glb', 'tv-high.glb', 'pc-base.glb', 'radio-base.glb', 'ps2-base.glb'];

/** Asset-level regression checks for the contracts consumed by the room runtime. */
export async function verifyRoomAssets(directory, manifest) {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const documents = new Map();
  let totalBytes = 0;
  let triangles = 0;
  let texturePixels = 0;
  assert.equal(manifest.sourceRevision, 6);
  for (const filename of [...FILES, 'CREDITS.txt']) {
    const entry = manifest.files.find((file) => file.name === filename);
    assert.ok(entry, `Missing manifest entry: ${filename}`);
    const bytes = await readFile(join(directory, filename));
    totalBytes += bytes.length;
    assert.equal(bytes.length, entry.bytes, `${filename}: stale byte count`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${filename}: stale hash`);
    if (!filename.endsWith('.glb')) continue;
    const result = await validator.validateBytes(new Uint8Array(bytes), { uri: filename });
    assert.equal(result.issues.numErrors, 0, `${filename}: ${JSON.stringify(result.issues.messages)}`);
    assert.equal(result.issues.numWarnings, 0, `${filename}: ${JSON.stringify(result.issues.messages)}`);
    const doc = await io.read(join(directory, filename));
    documents.set(filename, doc);
    for (const texture of doc.getRoot().listTextures()) {
      const [width, height] = texture.getSize();
      assert.ok(width <= 2048 && height <= 2048, `${filename}: oversized texture`);
      texturePixels += width * height;
    }
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        triangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3;
        const material = primitive.getMaterial();
        assert.ok(material, `${mesh.getName()}: no material`);
        if (!material.getName().startsWith('Lava |')) {
          assert.ok(material.getExtension('KHR_materials_unlit'), `${material.getName()}: outside shared bake`);
        }
      }
    }
  }
  assert.equal(totalBytes, manifest.totalBytes);
  assert.ok(totalBytes < 9_000_000, 'Initial transfer exceeds the room budget');
  assert.ok(triangles < 500_000, 'Geometry exceeds the room budget');
  assert.ok(texturePixels < 48_000_000, 'Decoded texture allocation exceeds the room budget');
  const room = documents.get('room.glb').getRoot();
  assert.ok(
    room.listNodes().every((node) => !/pillow/i.test(node.getName()) && node.getExtras().supplied_asset !== 'pillow'),
    'The removed floor pillow is still in the scene',
  );
  const rugs = room.listNodes().filter((node) => node.getExtras().supplied_asset === 'rug');
  assert.equal(rugs.length, 1, 'Expected the supplied folded rug');
  const rug = rugs[0];
  assert.equal(rug.getExtras().rotation_degrees, -15, 'Rug must sit 15 degrees clockwise');
  const width = 2.3513786792755127;
  assert.ok(Math.abs(rug.getExtras().square_width_m - width) < 0.001, 'Rug width changed');
  const matrix = rug.getWorldMatrix();
  const cosine = Math.cos(Math.PI / 12);
  const sine = Math.sin(Math.PI / 12);
  const low = [Infinity, Infinity, Infinity];
  const high = [-Infinity, -Infinity, -Infinity];
  const point = [];
  for (const primitive of rug.getMesh().listPrimitives()) {
    const positions = primitive.getAttribute('POSITION');
    for (let i = 0; i < positions.getCount(); i++) {
      positions.getElement(i, point);
      const x = matrix[0] * point[0] + matrix[4] * point[1] + matrix[8] * point[2] + matrix[12];
      const y = matrix[1] * point[0] + matrix[5] * point[1] + matrix[9] * point[2] + matrix[13];
      const z = matrix[2] * point[0] + matrix[6] * point[1] + matrix[10] * point[2] + matrix[14];
      // Undo the rotation in Blender's XY floor plane (glTF's X,-Z).
      const aligned = [cosine * x + sine * z, sine * x - cosine * z, y];
      aligned.forEach((value, axis) => {
        low[axis] = Math.min(low[axis], value);
        high[axis] = Math.max(high[axis], value);
      });
    }
  }
  for (const axis of [0, 1]) assert.ok(Math.abs(high[axis] - low[axis] - width) < 0.003, 'Rug is not square');
  assert.ok(high[2] - low[2] > 0.04, 'The supplied rug fold was flattened');
  const groups = room
    .getDefaultScene()
    .listChildren()
    .map((node) => node.getName());
  for (const name of ['01_TV', '02_Desk', '03_Room', '04_Drawer']) {
    assert.ok(groups.includes(name), `Missing room group: ${name}`);
  }
  const posters = room.listNodes().filter((node) => node.getExtras().poster_id);
  assert.equal(posters.length, 0, 'Wall posters should be removed');
  assert.ok(
    room.listNodes().every((node) => !node.getName().startsWith('Cutaway_attic_rafter')),
    'Ceiling beams remain',
  );
  const animations = room.listAnimations();
  assert.equal(animations.length, 1, 'Expected one lava animation');
  assert.equal(animations[0].getName(), 'Lava flow');
  const targets = new Set(animations[0].listChannels().map((channel) => channel.getTargetNode()));
  assert.equal(targets.size, 7, 'Lost animated wax meshes');
  const duration = Math.max(...animations[0].listSamplers().flatMap((sampler) => [...sampler.getInput().getArray()]));
  assert.ok(Math.abs(duration - 48) < 0.05, `Lava loop is ${duration}s, expected 48s`);
  for (const [filename, id] of [
    ['tv-high.glb', 'tv-screen'],
    ['pc-base.glb', 'pc-screen'],
  ]) {
    const doc = documents.get(filename);
    const screens = doc
      .getRoot()
      .listNodes()
      .filter((node) => node.getExtras().interaction_id === id);
    assert.equal(screens.length, 1, `${filename}: screen must be unique`);
    const screen = screens[0];
    assert.equal(screen.getExtras().replaceable_screen, true);
    const primitive = screen.getMesh().listPrimitives()[0];
    const uv = primitive.getAttribute('TEXCOORD_0');
    assert.ok(uv, `${filename}: lost screen UVs`);
    const point = [];
    const min = [Infinity, Infinity];
    const max = [-Infinity, -Infinity];
    for (let i = 0; i < uv.getCount(); i++) {
      uv.getElement(i, point);
      for (let axis = 0; axis < 2; axis++) {
        assert.ok(Number.isFinite(point[axis]) && point[axis] >= -0.001 && point[axis] <= 1.001);
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
    assert.ok(max[0] - min[0] > 0.95 && max[1] - min[1] > 0.95, `${filename}: screen UV range collapsed`);
    if (id === 'pc-screen') verifyFlatRegisteredScreen(screen, primitive);
    if (id === 'tv-screen') {
      const bounds = getBounds(screen);
      // The camera, glow and pointer mapping depend on the original curved aperture.
      for (const [actual, expected] of [
        [bounds.min, [2.159, 0.614, -0.611]],
        [bounds.max, [2.184, 1.058, -0.029]],
      ]) {
        actual.forEach((value, axis) => {
          assert.ok(Math.abs(value - expected[axis]) < 0.003, 'TV screen moved');
        });
      }
      assert.equal(
        doc
          .getRoot()
          .listNodes()
          .filter((node) => node.getExtras().interaction_id === 'tv-buttons').length,
        1,
      );
    }
  }
  const pc = documents.get('pc-base.glb').getRoot();
  for (const name of ['PC_Imported_CRT_base', 'PC_Imported_Keyboard_base', 'PC_Imported_Mouse_base']) {
    assert.ok(
      pc.listNodes().some((node) => node.getName() === name && node.getMesh()),
      `Missing desktop part: ${name}`,
    );
  }
  // The CRT name also identifies the complete device as the computer's click target.
  // Keep this reconstruction economical compared with the high-detail reference.
  let pcTriangles = 0;
  for (const mesh of pc.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      pcTriangles += (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3;
    }
  }
  assert.ok(pcTriangles < 15_000, 'Rebuilt desktop exceeds its geometry budget');
  return { totalBytes, triangles, texturePixels, files: FILES.length, validationErrors: 0, validationWarnings: 0 };
}

/**
 * The live DOM screen is a flat 2D rectangle laid over the PC glass, and the still's projector
 * UVs assume the asset's planar UVs: both need the glass to face +Z with u, v a planar
 * projection of x, y (v = 0 at the top).
 */
function verifyFlatRegisteredScreen(screen, primitive) {
  const matrix = screen.getWorldMatrix();
  const positions = primitive.getAttribute('POSITION');
  const normals = primitive.getAttribute('NORMAL');
  const uvs = primitive.getAttribute('TEXCOORD_0');
  assert.ok(normals, 'pc-base.glb: the screen lost its normals');
  const world = [];
  const normal = [0, 0, 0];
  const point = [];
  for (let i = 0; i < positions.getCount(); i++) {
    positions.getElement(i, point);
    world.push(
      [0, 1, 2].map((r) => matrix[r] * point[0] + matrix[4 + r] * point[1] + matrix[8 + r] * point[2] + matrix[12 + r]),
    );
    normals.getElement(i, point);
    for (let r = 0; r < 3; r++) normal[r] += matrix[r] * point[0] + matrix[4 + r] * point[1] + matrix[8 + r] * point[2];
  }
  const length = Math.hypot(...normal);
  const degrees = (Math.acos(normal[2] / length) * 180) / Math.PI;
  assert.ok(degrees <= 0.5, `pc-base.glb: the screen faces ${degrees.toFixed(2)}° away from +Z`);
  const xs = world.map((p) => p[0]);
  const ys = world.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  let deviation = 0;
  const uv = [];
  world.forEach(([x, y], i) => {
    uvs.getElement(i, uv);
    deviation = Math.max(
      deviation,
      Math.abs(uv[0] - (x - minX) / (maxX - minX)),
      Math.abs(uv[1] - (maxY - y) / (maxY - minY)),
    );
  });
  assert.ok(deviation <= 0.002, `pc-base.glb: screen UVs are ${deviation.toFixed(4)} off a planar projection`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(process.argv[2] ?? 'public/room');
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (directory === resolve('public/room')) {
    const runtime = JSON.parse(await readFile('src/room/assets/roomAssetSizes.json', 'utf8'));
    assert.deepEqual(runtime, assetSizes(manifest), 'Loading progress weights do not match the asset revision');
  }
  console.log(JSON.stringify(await verifyRoomAssets(directory, manifest), null, 2));
}
