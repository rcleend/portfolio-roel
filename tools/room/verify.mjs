import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import validator from 'gltf-validator';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { letteringResidue, UNBRANDED } from './debrand.mjs';
import { layoutViolations, POSTERS_TOPICS, toBlender, triangleOnSurface } from './posters-geometry.mjs';
import {
  components,
  decodeTriangles,
  findComponent,
  geometrySha256,
  RADIO_PARTS,
  radioMeshes,
  uvSha256,
  WELL_FLOOR,
  wellFloorTriangles,
} from './radio-geometry.mjs';
import { assetSizes } from './runtime-manifest.mjs';

const FILES = ['room.glb', 'tv-high.glb', 'pc-base.glb', 'radio-base.glb', 'ps2-base.glb'];
/** The radio's lazy close-up files (manifest.lazyFiles): never part of the first load. */
const LAZY_FILES = ['radio-closeup.glb', 'radio-skin-2k.webp'];
const CLOSEUP_MAX_BYTES = 80_000;
const CLOSEUP_MAX_TRIANGLES = 4000;
const CLOSEUP_ATLAS = 512;
const SKIN_SIZE = 2048;
const SKIN_MAX_BYTES = 280_000;
/** The open lid must never come closer than this to the antenna behind it. */
const LID_ANTENNA_CLEARANCE = 0.003;

/** The radio is unbranded: none of its atlases may carry the source model's lettering (tools/room/debrand.mjs). */
async function assertUnbranded(image, label) {
  const residue = await letteringResidue(sharp, image);
  assert.ok(residue <= UNBRANDED, `${label}: brand lettering is back (residue ${residue.toFixed(1)}): see debrand.mjs`);
}

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
      if (filename === 'radio-base.glb') await assertUnbranded(texture.getImage(), filename);
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

/**
 * The radio close-up's contract (tools/room/radio-closeup.mjs): its lazy files match manifest.lazyFiles, it was
 * built against exactly this radio-base.glb (geometry and UV fingerprints, per-mesh counts), its cut lists select
 * whole parts (one lid, one rocker, two mirrored side keys, the tub floor under the liner), the lid swings clear of
 * the antenna, and the 2K skin is the size it claims.
 */
export async function verifyRadioCloseup(directory, manifest) {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  assert.ok(Array.isArray(manifest.lazyFiles), 'manifest.lazyFiles is missing: run pnpm build:radio');
  const bytes = {};
  for (const name of LAZY_FILES) {
    const entry = manifest.lazyFiles.find((file) => file.name === name);
    assert.ok(entry, `Missing lazy manifest entry: ${name}`);
    bytes[name] = await readFile(join(directory, name));
    assert.equal(bytes[name].length, entry.bytes, `${name}: stale byte count`);
    assert.equal(createHash('sha256').update(bytes[name]).digest('hex'), entry.sha256, `${name}: stale hash`);
  }
  const baseBytes = await readFile(join(directory, 'radio-base.glb'));
  const baseEntry = manifest.files.find((file) => file.name === 'radio-base.glb');
  assert.ok(
    baseEntry && baseEntry.sha256 === createHash('sha256').update(baseBytes).digest('hex'),
    'radio-base.glb differs from the first-load manifest',
  );

  const closeupBytes = bytes['radio-closeup.glb'];
  assert.ok(closeupBytes.length <= CLOSEUP_MAX_BYTES, `radio-closeup.glb is ${closeupBytes.length} B`);
  const result = await validator.validateBytes(new Uint8Array(closeupBytes), { uri: 'radio-closeup.glb' });
  assert.equal(result.issues.numErrors, 0, `radio-closeup.glb: ${JSON.stringify(result.issues.messages)}`);
  assert.equal(result.issues.numWarnings, 0, `radio-closeup.glb: ${JSON.stringify(result.issues.messages)}`);
  const closeup = (await io.readBinary(new Uint8Array(closeupBytes))).getRoot();
  const textures = closeup.listTextures();
  assert.equal(textures.length, 1, 'radio-closeup.glb must carry exactly one atlas');
  assert.deepEqual(textures[0].getSize(), [CLOSEUP_ATLAS, CLOSEUP_ATLAS], 'radio-closeup.glb: atlas size');
  let triangles = 0;
  for (const mesh of closeup.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      triangles += primitive.getIndices().getCount() / 3;
      assert.ok(primitive.getMaterial()?.getExtension('KHR_materials_unlit'), 'radio-closeup.glb: outside the bake');
    }
  }
  assert.ok(triangles <= CLOSEUP_MAX_TRIANGLES, `radio-closeup.glb has ${triangles} triangles`);
  const nodes = closeup.listNodes().map((node) => node.getName());
  for (const name of ['Radio_CD_Well', 'Radio_CD_LidInner']) assert.ok(nodes.includes(name), `Missing ${name}`);
  const extras = closeup.listScenes()[0]?.getExtras() ?? {};
  assert.equal(extras.radioCloseup, 1, 'radio-closeup.glb: missing its extras');

  const base = radioMeshes(await io.readBinary(new Uint8Array(baseBytes)));
  assert.equal(extras.base.geometrySha256, geometrySha256(base), 'The close-up was cut from another radio-base.glb');
  assert.equal(extras.base.uvSha256, uvSha256(base), 'The 2K skin was proven on other UVs than radio-base.glb has');
  for (const mesh of base) {
    assert.deepEqual(
      extras.base.meshes[mesh.name],
      { vertices: mesh.vertices, triangles: mesh.indices.length / 3 },
      `${mesh.name}: counts differ from the close-up's`,
    );
  }
  const byName = new Map(base.map((mesh) => [mesh.name, mesh]));
  /** The welded components the listed triangles of a part form, on their own. */
  const partComponents = (names) => {
    const mesh = byName.get(extras.parts[names[0]].mesh);
    const listed = names.flatMap((name) => decodeTriangles(extras.parts[name]));
    const indices = new Uint32Array(listed.length * 3);
    listed.forEach((t, i) => {
      indices.set(mesh.indices.subarray(t * 3, t * 3 + 3), i * 3);
    });
    return components({ ...mesh, indices });
  };
  const [lid, ...strayLid] = partComponents(['lid']);
  assert.equal(strayLid.length, 0, 'The lid cut is not one welded component');
  const span = (bounds, axis) => bounds[1][axis] - bounds[0][axis];
  assert.ok(
    lid.triangles.length >= 1000 && span(lid.bounds, 0) >= 0.18 && span(lid.bounds, 2) >= 0.18,
    'The lid cut is not the lid',
  );
  const [rocker, ...strayRocker] = partComponents(['rockerTop', 'rockerBottom']);
  assert.equal(strayRocker.length, 0, 'The rocker halves are not one component');
  const centre = (bounds) => bounds[0].map((value, axis) => (value + bounds[1][axis]) / 2);
  const keys = ['previous', 'next'].map((name) => {
    const found = partComponents([name]);
    assert.equal(found.length, 1, `The ${name} key cut is not one component`);
    return centre(found[0].bounds);
  });
  const middle = centre(rocker.bounds);
  assert.ok(
    Math.abs(keys[0][0] + keys[1][0] - 2 * middle[0]) <= 0.001 && Math.abs(keys[0][1] - keys[1][1]) <= 0.001,
    'The side keys are not mirrored about the rocker',
  );

  // The tub floor the liner covers, exactly: the runtime hides it while the well shows, so nothing else may go.
  const floor = decodeTriangles(extras.parts.wellFloor);
  assert.equal(extras.parts.wellFloor.mesh, WELL_FLOOR.mesh, 'The well floor cut is not from the radio body');
  assert.deepEqual(
    floor,
    wellFloorTriangles(byName.get(WELL_FLOOR.mesh), extras.well),
    'The well floor cut is not the body floor under the liner',
  );
  assert.ok(floor.length >= 50, 'The well floor cut is not the tub floor');

  // Swing the lid 0–90° about its hinge: it must keep clear of the antenna behind it.
  const antenna = findComponent(byName.get(RADIO_PARTS.antenna.mesh), RADIO_PARTS.antenna.bounds).bounds;
  const lidMesh = byName.get(extras.parts.lid.mesh);
  const lidVertices = new Set(
    decodeTriangles(extras.parts.lid).flatMap((t) => [...lidMesh.indices.subarray(t * 3, t * 3 + 3)]),
  );
  const [, hy, hz] = extras.hinge.point;
  let clearance = Infinity;
  for (let degrees = 0; degrees <= 90; degrees++) {
    const angle = (degrees * Math.PI) / 180;
    for (const v of lidVertices) {
      const x = lidMesh.world[v * 3];
      const dy = lidMesh.world[v * 3 + 1] - hy;
      const dz = lidMesh.world[v * 3 + 2] - hz;
      const point = [
        x,
        hy + dy * Math.cos(angle) + dz * Math.sin(angle),
        hz - dy * Math.sin(angle) + dz * Math.cos(angle),
      ];
      const outside = point.map((value, axis) => Math.max(antenna[0][axis] - value, 0, value - antenna[1][axis]));
      clearance = Math.min(clearance, Math.hypot(...outside));
    }
  }
  assert.ok(
    clearance >= LID_ANTENNA_CLEARANCE,
    `The opening lid comes ${(clearance * 1000).toFixed(1)} mm from the antenna`,
  );

  await assertUnbranded(bytes['radio-skin-2k.webp'], 'radio-skin-2k.webp');
  const skin = await sharp(bytes['radio-skin-2k.webp']).metadata();
  assert.equal(skin.format, 'webp');
  assert.ok(skin.width === SKIN_SIZE && skin.height === SKIN_SIZE, 'radio-skin-2k.webp must be exactly 2048²');
  assert.ok(bytes['radio-skin-2k.webp'].length <= SKIN_MAX_BYTES, 'radio-skin-2k.webp exceeds 280 KB');
  return {
    closeupBytes: closeupBytes.length,
    closeupTriangles: triangles,
    skinBytes: bytes['radio-skin-2k.webp'].length,
    lidTriangles: lid.triangles.length,
    wellFloorTriangles: floor.length,
    lidAntennaClearanceMm: Math.round(clearance * 10000) / 10,
  };
}

/** The posters' lazy files (tools/room/posters.mjs): one glb and two texture tiers, one of which a visitor fetches. */
export const POSTERS_LAZY_FILES = ['posters.glb', 'posters-2k.webp', 'posters-1k.webp'];
const POSTERS_MAX_BYTES = 80_000;
const POSTERS_MAX_TRIANGLES = 3000;
const POSTERS_TIER_CAPS = { 'posters-2k.webp': [2048, 1024, 480_000], 'posters-1k.webp': [1024, 512, 170_000] };
/**
 * A skirt side's outer ring after encoding, its mean over the wall it shows (the stage asserts 0.99 before encoding,
 * and the local step along it; WebP may cost 0.005).
 */
const POSTERS_RING_MIN = 0.985;
/** The resident share of decoded texture pixels the posters may take (the 2K tier). */
const POSTERS_MAX_PIXELS = 2_200_000;

/**
 * The posters' contract (docs/ROOM.md "Posters"): lazy files match manifest.lazyFiles beside the radio's, one
 * unlit node with exactly two primitives and no image, every item carries its emitted-geometry box and every
 * triangle lies in one item's box, on the back wall or the slope and outside every keep-out (posters-geometry.mjs),
 * the layout holds the eleven topics and only its declared overlaps, the tiers' sizes, caps and decoded pixels, and
 * every skirt's outer ring decodes to ≈ 1 in both tiers (no seam where the multiply ends).
 */
export async function verifyPosters(directory, manifest) {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  assert.ok(Array.isArray(manifest.lazyFiles), 'manifest.lazyFiles is missing: run pnpm build:posters');
  for (const name of LAZY_FILES) {
    assert.ok(
      manifest.lazyFiles.some((file) => file.name === name),
      `The radio's ${name} left manifest.lazyFiles`,
    );
  }
  const bytes = {};
  for (const name of POSTERS_LAZY_FILES) {
    const entry = manifest.lazyFiles.find((file) => file.name === name);
    assert.ok(entry, `Missing lazy manifest entry: ${name}`);
    bytes[name] = await readFile(join(directory, name));
    assert.equal(bytes[name].length, entry.bytes, `${name}: stale byte count`);
    assert.equal(createHash('sha256').update(bytes[name]).digest('hex'), entry.sha256, `${name}: stale hash`);
  }
  const glb = bytes['posters.glb'];
  assert.ok(glb.length <= POSTERS_MAX_BYTES, `posters.glb is ${glb.length} B`);
  const result = await validator.validateBytes(new Uint8Array(glb), { uri: 'posters.glb' });
  assert.equal(result.issues.numErrors, 0, `posters.glb: ${JSON.stringify(result.issues.messages)}`);
  assert.equal(result.issues.numWarnings, 0, `posters.glb: ${JSON.stringify(result.issues.messages)}`);
  const root = (await io.readBinary(new Uint8Array(glb))).getRoot();
  assert.equal(root.listTextures().length, 0, 'posters.glb must not embed an image');
  const nodes = root.listNodes();
  assert.equal(nodes.length, 1, 'posters.glb must be one node');
  const primitives = nodes[0].getMesh()?.listPrimitives() ?? [];
  assert.equal(primitives.length, 2, 'posters.glb must have exactly two primitives (cards, skirts)');
  const extras = nodes[0].getExtras();
  assert.equal(extras.posters, 1, 'posters.glb: missing its extras');
  assert.ok(Array.isArray(extras.decor) && extras.decor.length > 0, 'posters.glb: no decor boxes');
  const layout = JSON.parse(await readFile(new URL('./assets/posters/layout.json', import.meta.url), 'utf8'));
  assert.deepEqual(layoutViolations(layout), [], 'posters: the layout breaks its contract');
  assert.deepEqual([...layout.topics].sort(), [...POSTERS_TOPICS].sort(), "posters: the layout's topic list");
  const keys = [...layout.items.map((item) => item.key), 'corkboard'].sort();
  assert.deepEqual(extras.decor.map(({ decor_id: id }) => id).sort(), keys, 'posters: an item without its box');
  const contains = ({ min, max }, p) => p.every((v, axis) => v >= min[axis] - 1e-4 && v <= max[axis] + 1e-4);
  // Quantized positions are scaled and offset back to the room by the node's transform.
  const m = nodes[0].getWorldMatrix();
  const world = ([x, y, z]) => [0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
  let triangles = 0;
  let maxOffset = 0;
  for (const primitive of primitives) {
    assert.ok(primitive.getMaterial()?.getExtension('KHR_materials_unlit'), 'posters.glb: outside the bake');
    // Without normals three.js compiles programs of its own for the posters (+1 opaque, see posters.mjs).
    assert.ok(primitive.getAttribute('NORMAL'), 'posters.glb: a primitive without normals');
    const position = primitive.getAttribute('POSITION');
    const indices = primitive.getIndices();
    const skirts = primitive.getMaterial()?.getAlphaMode() === 'BLEND';
    for (let t = 0; t < indices.getCount(); t += 3) {
      triangles++;
      const points = [0, 1, 2].map((k) => world(position.getElement(indices.getScalar(t + k), [])));
      // One item emitted the whole triangle, so one item's box holds all three corners.
      assert.ok(
        extras.decor.some((box) => points.every((p) => contains(box, p))),
        `posters.glb: a triangle outside every item's box (${JSON.stringify(points)})`,
      );
      // Spec section 2: on the back wall or the slope, never the knee wall; inside its surface (a skirt may run on
      // into the room's corner or behind the slope, where the wall hides it); outside every keep-out.
      const at = triangleOnSurface(layout, points.map(toBlender));
      assert.ok(at.surface, `posters.glb: a triangle off the back wall and the slope (${JSON.stringify(points)})`);
      assert.ok(skirts || at.inside, `posters.glb: a card triangle leaves the ${at.surface}`);
      assert.deepEqual(at.keepouts, [], `posters.glb: a triangle enters a keep-out (${JSON.stringify(points)})`);
      maxOffset = Math.max(maxOffset, at.offset);
    }
  }
  assert.ok(triangles <= POSTERS_MAX_TRIANGLES, `posters.glb has ${triangles} triangles`);
  for (const { decor_id: id, min, max } of extras.decor) {
    assert.ok(typeof id === 'string' && min.every((v, axis) => v <= max[axis]), `posters.glb: bad decor box ${id}`);
  }

  const rings = {};
  for (const [name, [width, height, cap]] of Object.entries(POSTERS_TIER_CAPS)) {
    const image = sharp(bytes[name]);
    const meta = await image.metadata();
    assert.equal(meta.format, 'webp');
    assert.ok(meta.width === width && meta.height === height, `${name} must be exactly ${width}×${height}`);
    assert.ok(meta.width * meta.height <= POSTERS_MAX_PIXELS, `${name} decodes to ${meta.width * meta.height} pixels`);
    assert.ok(bytes[name].length <= cap, `${name} is ${bytes[name].length} B (cap ${cap})`);
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const scale = width / extras.atlas[0];
    let worstMean = 1;
    // Each skirt side lists the runs of 1 cm segments of its outer 2 px that the wall shows whole (the compose stage's
    // list); at the 1K a run is read at half the coordinates, at least one texel.
    for (const [side, rects] of Object.entries(extras.skirtRings)) {
      let sum = 0;
      let texels = 0;
      for (const rect of rects) {
        const [rx, ry] = rect.map((v) => Math.floor(v * scale));
        const [rw, rh] = rect.slice(2).map((v) => Math.max(1, Math.floor(v * scale)));
        for (let py = ry; py < ry + rh; py++) {
          for (let px = rx; px < rx + rw; px++) sum += data[(py * info.width + px) * info.channels] / 255;
        }
        texels += rw * rh;
      }
      const mean = sum / texels;
      assert.ok(mean >= POSTERS_RING_MIN, `${name}: ${side}'s outer ring decodes to ${mean.toFixed(3)}`);
      worstMean = Math.min(worstMean, mean);
    }
    rings[name] = Math.round(worstMean * 1000) / 1000;
  }
  return {
    glbBytes: glb.length,
    triangles,
    items: extras.decor.length,
    maxOffsetMm: Math.round(maxOffset * 10000) / 10,
    tier2kBytes: bytes['posters-2k.webp'].length,
    tier1kBytes: bytes['posters-1k.webp'].length,
    worstRing: rings,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(process.argv[2] ?? 'public/room');
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (directory === resolve('public/room')) {
    const runtime = JSON.parse(await readFile('src/room/assets/roomAssetSizes.json', 'utf8'));
    assert.deepEqual(runtime, assetSizes(manifest), 'Loading progress weights do not match the asset revision');
  }
  console.log(JSON.stringify(await verifyRoomAssets(directory, manifest), null, 2));
  console.log(JSON.stringify({ radio: await verifyRadioCloseup(directory, manifest) }, null, 2));
  console.log(JSON.stringify({ posters: await verifyPosters(directory, manifest) }, null, 2));
}
