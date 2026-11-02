// Publish the vintage toy robot on the left-hand end of the TV cabinet into room.glb, preserving every other asset.
// node tools/room/toy-robot.mjs
//
// Source: tools/room/assets/toy-robot-source.glb ("Vintage Toy Robot" by Tom Scudder, Sketchfab, CC-BY-4.0): 32 parts,
// 15.5k vertices, one clear-coated material with 1K colour, normal and metal/roughness PNGs (2.7 MB). The room is
// unlit, so only the colour map ships, reduced to 512² WebP; the 31 body parts become one mesh, simplified with
// meshoptimizer, and the two eyes a second one that the runtime turns into light (`light`, toyRobot.ts).
//
// The body is named like the bake (`_BAKED_UNLIT`) so the finish extends it with the room's program. Unlike the
// baked surfaces it carries its albedo, not its light: `NIGHT` dims it to the room's night (about 4 % of full light
// where the TV stands), so the finish (albedo = colour × 25) lights it from its true colours. The eyes are a mapless
// `_BAKED_UNLIT` like the lamp's globe and share its program.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Document } from '@gltf-transform/core';
import { EXTTextureWebP, KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { io, publishTvProp, root } from './publish-tv-prop.mjs';
import { TV_LAMP_LIGHT } from './tv-lamp-light.mjs';

const NAME = 'TV toy robot';
/** The robot's height on the cabinet: a 30 cm tin toy, about half the set's height. */
const HEIGHT = 0.3;
/** On the cabinet top (y 0.486) at its left-hand end, behind the Product Engineer case and clear of the set in view. */
const PLACE = [2.58, 0.486, -0.87];
/** The body's turn towards the room's right (+z), in degrees; the source's head turns 19° back from it. */
const BODY_TURN = 30;
/** The body's colour under the room's night light (see above). */
const NIGHT = 0.04;
/**
 * The eyes' unlit colour (the lamp's) × this: past white, so they read as light, but less than the globe's, as small
 * bright points bloom into a hard-edged square in the finish (as the set's power light does).
 */
const EYE_GLOW = 1.25;
const TEXTURE = { size: 512, quality: 88 };
const SIMPLIFY = { body: 0.12, eyes: 0.3, error: 0.01, weights: [0.3, 0.3, 0.3, 1, 1] };
/** How far in front of each eye's glass its light sits, so the face around it catches it at a graze. */
const EYE_LIGHT_OFFSET = 0.006;
/** Self-shadow boxes are measured from these parts and shrunk by this much, so their own faces stay lit. */
const SHADOW_PARTS = { head: 'pCube2_', body: 'pCube12_' };
const SHADOW_INSET = 0.004;

const source = await io.read(join(root, 'tools/room/assets/toy-robot-source.glb'));
const sourceInfo = source.getRoot().getAsset().extras;
const nodes = source
  .getRoot()
  .listNodes()
  .filter((node) => node.getMesh());
assert.equal(nodes.length, 32, 'Unexpected robot source parts');
const [sourceMaterial] = source.getRoot().listMaterials();
assert.equal(source.getRoot().listMaterials().length, 1, 'Expected one robot material');
const EYES = 'ToyRobot:pCylinder22_ToyRobot_MAT_0';
assert.equal(nodes.filter((node) => node.getName() === EYES).length, 1, 'Missing the eyes');

/** World positions, normals, UVs and triangles of a source node, as plain arrays. */
function part(node) {
  const primitive = node.getMesh().listPrimitives()[0];
  const m = node.getWorldMatrix();
  const p = [0, 0, 0];
  const world = [];
  const normals = [];
  const uvs = [];
  const positions = primitive.getAttribute('POSITION');
  for (let i = 0; i < positions.getCount(); i++) {
    positions.getElement(i, p);
    world.push([0, 1, 2].map((a) => m[a] * p[0] + m[4 + a] * p[1] + m[8 + a] * p[2] + m[12 + a]));
    // The source's transforms are uniform scales and rotations: normals turn with the upper 3 × 3.
    primitive.getAttribute('NORMAL').getElement(i, p);
    const n = [0, 1, 2].map((a) => m[a] * p[0] + m[4 + a] * p[1] + m[8 + a] * p[2]);
    const length = Math.hypot(...n);
    normals.push(n.map((value) => value / length));
    uvs.push(primitive.getAttribute('TEXCOORD_0').getElement(i, [0, 0]));
  }
  return { name: node.getName(), world, normals, uvs, indices: [...primitive.getIndices().getArray()] };
}
const parts = nodes.map(part);

// Turn and size: the body's facing is the source group's own (-z turned by its yaw), measured below as an angle θ with
// facing = (-cos θ, sin θ) in (x, z): θ = 0 faces the opening camera (-x), positive turns towards +z.
const yawOf = ([x, , z]) => Math.atan2(z, -x);
const group = source
  .getRoot()
  .listNodes()
  .find((node) => node.getName() === 'Robot_GRP');
const [, qy, , qw] = group.getRotation();
const sourceYaw = 2 * Math.atan2(qy, qw); // the group turns about +y only
const bodyFacing = [-Math.sin(sourceYaw), 0, -Math.cos(sourceYaw)];
const turn = (BODY_TURN * Math.PI) / 180 - yawOf(bodyFacing);
const rotate = ([x, y, z], angle = turn) => [
  x * Math.cos(angle) + z * Math.sin(angle),
  y,
  -x * Math.sin(angle) + z * Math.cos(angle),
];
const all = parts.flatMap((entry) => entry.world);
const low = [0, 1, 2].map((a) => Math.min(...all.map((q) => q[a])));
const high = [0, 1, 2].map((a) => Math.max(...all.map((q) => q[a])));
const feet = parts.filter((entry) => /pCube1[45]_/.test(entry.name)).flatMap((entry) => entry.world);
const pivot = [0, 2].map((a) => (Math.min(...feet.map((q) => q[a])) + Math.max(...feet.map((q) => q[a]))) / 2);
const scale = HEIGHT / (high[1] - low[1]);
const place = (q) => {
  const r = rotate([(q[0] - pivot[0]) * scale, (q[1] - low[1]) * scale, (q[2] - pivot[1]) * scale]);
  return [r[0] + PLACE[0], r[1] + PLACE[1], r[2] + PLACE[2]];
};
for (const entry of parts) {
  entry.world = entry.world.map(place);
  entry.normals = entry.normals.map((n) => rotate(n));
}

/** One primitive from several parts. */
function primitive(document, buffer, pieces, material, withUv) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (const entry of pieces) {
    const base = positions.length / 3;
    positions.push(...entry.world.flat());
    normals.push(...entry.normals.flat());
    uvs.push(...entry.uvs.flat());
    indices.push(...entry.indices.map((index) => index + base));
  }
  const accessor = (type, array) => document.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const result = document
    .createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array(normals)))
    .setIndices(accessor('SCALAR', new Uint32Array(indices)))
    .setMaterial(material);
  if (withUv) result.setAttribute('TEXCOORD_0', accessor('VEC2', new Float32Array(uvs)));
  return result;
}

/** Several parts as one mesh. */
function merge(pieces) {
  const merged = { name: pieces.map((entry) => entry.name).join(), world: [], normals: [], uvs: [], indices: [] };
  for (const entry of pieces) {
    const base = merged.world.length;
    merged.world.push(...entry.world);
    merged.normals.push(...entry.normals);
    merged.uvs.push(...entry.uvs);
    merged.indices.push(...entry.indices.map((index) => index + base));
  }
  return merged;
}

/**
 * Simplified with meshoptimizer, weighing normals and UVs. Permissive: the source splits its vertices at every hard
 * edge and UV seam, and without it those splits lock most of the mesh. Prune drops the bevel slivers that fall under
 * the error. `error` is relative to the mesh's extent.
 */
function decimate(mesh, ratio, error) {
  const positions = new Float32Array(mesh.world.flat());
  const attributes = new Float32Array(mesh.world.flatMap((_, i) => [...mesh.normals[i], ...mesh.uvs[i]]));
  const target = Math.floor((mesh.indices.length * ratio) / 3) * 3;
  const [indices] = MeshoptSimplifier.simplifyWithAttributes(
    new Uint32Array(mesh.indices),
    positions,
    3,
    attributes,
    5,
    SIMPLIFY.weights,
    null,
    target,
    error,
    ['Permissive', 'Prune'],
  );
  const used = [...new Set(indices)];
  const remap = new Map(used.map((index, i) => [index, i]));
  return {
    name: mesh.name,
    world: used.map((index) => mesh.world[index]),
    normals: used.map((index) => mesh.normals[index]),
    uvs: used.map((index) => mesh.uvs[index]),
    indices: [...indices].map((index) => remap.get(index)),
  };
}

const fresh = new Document();
const buffer = fresh.createBuffer();
const unlit = fresh.createExtension(KHRMaterialsUnlit);
fresh.createExtension(EXTTextureWebP).setRequired(true);
const sourceImage = sourceMaterial.getBaseColorTexture().getImage();
const image = await sharp(sourceImage)
  .resize(TEXTURE.size, TEXTURE.size, { kernel: 'lanczos3' })
  .webp({ quality: TEXTURE.quality, effort: 6 })
  .toBuffer();
const texture = fresh.createTexture('toy-robot').setImage(image).setMimeType('image/webp');
const bodyMaterial = fresh
  .createMaterial('01_TV_robot_BAKED_UNLIT')
  .setBaseColorTexture(texture)
  .setBaseColorFactor([NIGHT, NIGHT, NIGHT, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(1)
  .setExtension('KHR_materials_unlit', unlit.createUnlit());
const eyeMaterial = fresh
  .createMaterial('01_TV_robot_eyes_BAKED_UNLIT')
  .setBaseColorFactor([...TV_LAMP_LIGHT.color, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(1)
  .setExtension('KHR_materials_unlit', unlit.createUnlit());

const eyes = parts.find((entry) => entry.name === EYES);
await MeshoptSimplifier.ready;
const body = decimate(merge(parts.filter((entry) => entry !== eyes)), SIMPLIFY.body, SIMPLIFY.error);
const eyeMesh = decimate(eyes, SIMPLIFY.eyes, SIMPLIFY.error);
const bodyNode = fresh
  .createNode(`${NAME} body`)
  .setMesh(fresh.createMesh(`${NAME} body`).addPrimitive(primitive(fresh, buffer, [body], bodyMaterial, true)));
const eyesNode = fresh
  .createNode(`${NAME} eyes`)
  .setMesh(fresh.createMesh(`${NAME} eyes`).addPrimitive(primitive(fresh, buffer, [eyeMesh], eyeMaterial, false)));
const sourceVertices = parts.reduce((sum, entry) => sum + entry.world.length, 0);
const sourceTriangles = parts.reduce((sum, entry) => sum + entry.indices.length / 3, 0);
// The eyes: two glass discs, told apart by which side of the face they sit on. Each one's light sits just in front of
// its glass, along the head's facing (perpendicular to the line between the eyes, away from the wall).
const [leftEye, rightEye] = [[], []];
const eyeCenter = [0, 1, 2].map((a) => eyes.world.reduce((sum, q) => sum + q[a], 0) / eyes.world.length);
const across = (() => {
  // The line between the eyes: the direction along which the eye vertices spread furthest from their middle.
  const far = eyes.world.reduce((best, q) =>
    Math.hypot(q[0] - eyeCenter[0], q[2] - eyeCenter[2]) > Math.hypot(best[0] - eyeCenter[0], best[2] - eyeCenter[2])
      ? q
      : best,
  );
  const d = [far[0] - eyeCenter[0], 0, far[2] - eyeCenter[2]];
  const length = Math.hypot(...d);
  return d.map((value) => value / length);
})();
for (const q of eyes.world) {
  const side = (q[0] - eyeCenter[0]) * across[0] + (q[2] - eyeCenter[2]) * across[2];
  (side < 0 ? leftEye : rightEye).push(q);
}
let facing = [-across[2], 0, across[0]];
if (facing[0] > 0) facing = facing.map((value) => -value);
const round = (value) => Math.round(value * 1e4) / 1e4;
const eyeLight = (points) => {
  const middle = [0, 1, 2].map((a) => points.reduce((sum, q) => sum + q[a], 0) / points.length);
  const front = Math.max(...points.map((q) => (q[0] - middle[0]) * facing[0] + (q[2] - middle[2]) * facing[2]));
  return middle.map((value, a) => round(value + facing[a] * (front + EYE_LIGHT_OFFSET)));
};
const eyeLights = [eyeLight(leftEye), eyeLight(rightEye)].sort((a, b) => a[2] - b[2]);

// Self-shadow boxes in the body's own frame (turned back by the body's yaw about PLACE), shrunk to keep faces lit.
const bodyYaw = (BODY_TURN * Math.PI) / 180;
const local = (q) => rotate([q[0] - PLACE[0], q[1] - PLACE[1], q[2] - PLACE[2]], -bodyYaw);
const box = (prefix) => {
  const points = parts.filter((entry) => entry.name.includes(`:${prefix}`)).flatMap((entry) => entry.world.map(local));
  assert.ok(points.length > 0, `Missing the ${prefix} part`);
  return [
    [0, 1, 2].map((a) => round(Math.min(...points.map((q) => q[a])) + SHADOW_INSET)),
    [0, 1, 2].map((a) => round(Math.max(...points.map((q) => q[a])) - SHADOW_INSET)),
  ];
};

const node = fresh
  .createNode(NAME)
  .addChild(bodyNode)
  .addChild(eyesNode)
  .setExtras({
    asset_group: '01_TV',
    supplied_asset: 'toy-robot',
    source_title: sourceInfo.title,
    source_author: sourceInfo.author,
    source_license: sourceInfo.license,
    source_url: sourceInfo.source,
    removed: ['normal map', 'metal/roughness map', 'clear coat'],
    light: {
      eyes: eyeLights,
      facing: facing.map(round),
      color: TV_LAMP_LIGHT.color,
      glow: EYE_GLOW,
      frame: { origin: PLACE, yaw: round(bodyYaw) },
      head: box(SHADOW_PARTS.head),
      body: box(SHADOW_PARTS.body),
    },
  });
fresh.createScene().addChild(node);

const count = (mesh) => {
  const p = mesh.listPrimitives()[0];
  return [p.getAttribute('POSITION').getCount(), p.getIndices().getCount() / 3];
};
const [bodyVertices, bodyTriangles] = count(bodyNode.getMesh());
const [eyeVertices, eyeTriangles] = count(eyesNode.getMesh());
const totalBytes = await publishTvProp(fresh, NAME, 'toy-robot');
console.log(
  `Published the toy robot: ${sourceVertices} vertices / ${sourceTriangles} triangles -> ` +
    `${bodyVertices + eyeVertices} / ${bodyTriangles + eyeTriangles}; colour map ${sourceImage.length} B PNG -> ` +
    `${image.length} B WebP ${TEXTURE.size}²; eyes ${eyeLights.map((q) => q.join(', ')).join(' / ')}. ` +
    `${totalBytes} bytes total.`,
);
