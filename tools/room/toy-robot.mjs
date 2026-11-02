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
 * The eyes' unlit colour (the lamp's) × this, over the eye discs `EYE_DISC` paints into the colour map: a white-hot
 * core at the lamp's colour, which only just reaches the finish's bloom, falling off round to a dim warm glass rim
 * below it. Brighter eyes bloom into a square around the head, as the set's small power light does; the runtime draws
 * a small round glow over each eye instead (toyRobot.ts).
 */
const EYE_GLOW = 1.1;
/** The disc's brightness from its centre (0) to its rim (1): a tight core over a soft round falloff. */
const EYE_DISC = { rim: 0.2, core: 0.42 };
/** Each eye's beam, aimed this far below the head's facing (degrees): a toy's eyes look down at the desk in front. */
const EYE_AIM_DOWN = 35;
/**
 * The night room's ambient light baked into the colour map, as the bake gives every other surface: occlusion by the
 * robot itself and the cabinet top it stands on within `range` metres (`rays` fixed directions per vertex), and a
 * little more light from above than from below.
 */
const AMBIENT = { rays: 48, range: 0.06, below: 0.55 };
/** The feet (the parts below this height on the cabinet, metres) are toned to a darker gunmetal than the source's pale grey. */
const FEET = { height: 0.034, tone: 0.45 };
const TEXTURE = { size: 512, quality: 88 };
const SIMPLIFY = { body: 0.12, eyes: 0.3, error: 0.01, weights: [0.3, 0.3, 0.3, 1, 1] };
/**
 * How far in front of each eye's glass front its light sits: behind it, at the bulb, so neither the glass nor the face
 * it is set in takes the eye's own light.
 */
const EYE_LIGHT_OFFSET = -0.002;
/** Self-shadow boxes are measured from these parts and shrunk by this much, so their own faces stay lit. */
const SHADOW_PARTS = { body: ['pCube12'], legs: ['pCube13', 'pCube14', 'pCube15', 'pCube16'] };
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

const toLinear = (value) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (value) => {
  const c = Math.min(Math.max(value, 0), 1);
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
};

/** A bounding-volume tree over a mesh's triangles, for the ambient bake's rays. */
function triangleTree(mesh) {
  const p = mesh.world;
  const t = mesh.indices;
  const count = t.length / 3;
  const bounds = new Float64Array(count * 6);
  const centres = new Float64Array(count * 3);
  for (let k = 0; k < count; k++)
    for (let a = 0; a < 3; a++) {
      const values = [p[t[k * 3]][a], p[t[k * 3 + 1]][a], p[t[k * 3 + 2]][a]];
      bounds[k * 6 + a] = Math.min(...values);
      bounds[k * 6 + 3 + a] = Math.max(...values);
      centres[k * 3 + a] = (bounds[k * 6 + a] + bounds[k * 6 + 3 + a]) / 2;
    }
  const build = (items) => {
    const low = [Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity];
    for (const k of items)
      for (let a = 0; a < 3; a++) {
        low[a] = Math.min(low[a], bounds[k * 6 + a]);
        high[a] = Math.max(high[a], bounds[k * 6 + 3 + a]);
      }
    if (items.length <= 6) return { low, high, items };
    const axis = [0, 1, 2].reduce((best, a) => (high[a] - low[a] > high[best] - low[best] ? a : best), 0);
    const sorted = [...items].sort((x, y) => centres[x * 3 + axis] - centres[y * 3 + axis]);
    const half = sorted.length >> 1;
    return { low, high, children: [build(sorted.slice(0, half)), build(sorted.slice(half))] };
  };
  return build([...Array(count).keys()]);
}

/** Distance along `d` from `o` to the nearest triangle of `tree` within `limit`, or `limit`. */
function castRay(mesh, tree, o, d, limit) {
  const p = mesh.world;
  const t = mesh.indices;
  const inverse = d.map((value) => 1 / (Math.abs(value) < 1e-12 ? 1e-12 : value));
  let nearest = limit;
  const stack = [tree];
  while (stack.length) {
    const node = stack.pop();
    let enter = 0;
    let leave = nearest;
    for (let a = 0; a < 3; a++) {
      let near = (node.low[a] - o[a]) * inverse[a];
      let far = (node.high[a] - o[a]) * inverse[a];
      if (near > far) [near, far] = [far, near];
      enter = Math.max(enter, near);
      leave = Math.min(leave, far);
    }
    if (enter > leave) continue;
    if (node.children) {
      stack.push(...node.children);
      continue;
    }
    for (const k of node.items) {
      const a = p[t[k * 3]];
      const b = p[t[k * 3 + 1]];
      const c = p[t[k * 3 + 2]];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const q = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
      const det = e1[0] * q[0] + e1[1] * q[1] + e1[2] * q[2];
      if (Math.abs(det) < 1e-12) continue;
      const s = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
      const u = (s[0] * q[0] + s[1] * q[1] + s[2] * q[2]) / det;
      if (u < 0 || u > 1) continue;
      const r = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
      const v = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / det;
      if (v < 0 || u + v > 1) continue;
      const distance = (e2[0] * r[0] + e2[1] * r[1] + e2[2] * r[2]) / det;
      if (distance > 1e-4 && distance < nearest) nearest = distance;
    }
  }
  return nearest;
}

/**
 * Bakes the night room's ambient light into the colour map (`pixels`, RGB) over the body's UV islands, texel by texel:
 * the share of `AMBIENT.rays` fixed, cosine-weighted directions from the texel's place on the robot that reach
 * `AMBIENT.range` without meeting the robot or the cabinet top (closer hits shade more), times a little less light
 * from below; spread a few texels past the islands' edges and multiplied in linear light. The parts' islands do not
 * overlap, so each texel is one place on the robot.
 */
function bakeAmbient(pixels, mesh) {
  const size = TEXTURE.size;
  const t = mesh.indices;
  const tree = triangleTree(mesh);
  const directions = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < AMBIENT.rays; i++) {
    const u = (i + 0.5) / AMBIENT.rays;
    const r = Math.sqrt(u);
    directions.push([r * Math.cos(i * golden), r * Math.sin(i * golden), Math.sqrt(1 - u)]);
  }
  // Rays leave around the triangle's own face (a smoothed normal would send some into the robot); the smoothed normal
  // only weighs the light from above.
  const ambient = (origin, face, normal) => {
    const n = face;
    const helper = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const tangent = [
      helper[1] * n[2] - helper[2] * n[1],
      helper[2] * n[0] - helper[0] * n[2],
      helper[0] * n[1] - helper[1] * n[0],
    ];
    const tangentLength = Math.hypot(...tangent);
    const x = tangent.map((value) => value / tangentLength);
    const y = [n[1] * x[2] - n[2] * x[1], n[2] * x[0] - n[0] * x[2], n[0] * x[1] - n[1] * x[0]];
    const o = origin.map((value, a) => value + n[a] * 2e-4);
    let open = 0;
    for (const [a, b, c] of directions) {
      const d = [0, 1, 2].map((k) => x[k] * a + y[k] * b + n[k] * c);
      const floor = d[1] < 0 ? (PLACE[1] - o[1]) / d[1] : Infinity;
      open += castRay(mesh, tree, o, d, Math.min(floor, AMBIENT.range)) / AMBIENT.range;
    }
    const up = normal[1] / Math.hypot(...normal);
    return (open / AMBIENT.rays) * (1 - (1 - AMBIENT.below) * (1 - up) * 0.5);
  };
  // Each texel a triangle covers, at its place on the robot; texels no triangle covers stay unset.
  const map = new Float32Array(size * size).fill(-1);
  for (let k = 0; k < t.length; k += 3) {
    const corners = [t[k], t[k + 1], t[k + 2]];
    const [a, b, c] = corners.map((index) => mesh.uvs[index].map((value) => value * size));
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(area) < 1e-9) continue;
    const [pa, pb, pc] = corners.map((index) => mesh.world[index]);
    const e1 = [0, 1, 2].map((axis) => pb[axis] - pa[axis]);
    const e2 = [0, 1, 2].map((axis) => pc[axis] - pa[axis]);
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const crossLength = Math.hypot(...cross);
    if (crossLength < 1e-12) continue;
    let face = cross.map((value) => value / crossLength);
    const tone = Math.max(pa[1], pb[1], pc[1]) < PLACE[1] + FEET.height ? FEET.tone : 1;
    // The winding may disagree with the shading normals; the face points the way they do.
    const shading = corners.reduce(
      (sum, index) => sum.map((value, axis) => value + mesh.normals[index][axis]),
      [0, 0, 0],
    );
    if (face[0] * shading[0] + face[1] * shading[1] + face[2] * shading[2] < 0) face = face.map((value) => -value);
    const top = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const bottom = Math.min(size, Math.ceil(Math.max(a[1], b[1], c[1])));
    const left = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const right = Math.min(size, Math.ceil(Math.max(a[0], b[0], c[0])));
    for (let py = top; py < bottom; py++)
      for (let px = left; px < right; px++) {
        const x = px + 0.5;
        const y = py + 0.5;
        const wa = ((b[0] - x) * (c[1] - y) - (c[0] - x) * (b[1] - y)) / area;
        const wb = ((c[0] - x) * (a[1] - y) - (a[0] - x) * (c[1] - y)) / area;
        const wc = 1 - wa - wb;
        if (wa < -0.01 || wb < -0.01 || wc < -0.01) continue;
        const weights = [wa, wb, wc];
        const blend = (attribute) =>
          [0, 1, 2].map((axis) => corners.reduce((sum, index, i) => sum + attribute[index][axis] * weights[i], 0));
        // Where folded UVs cover a texel twice, the more open place wins (the other is usually inside the robot).
        map[py * size + px] = Math.max(
          map[py * size + px],
          tone * ambient(blend(mesh.world), face, blend(mesh.normals)),
        );
      }
  }
  // Spread past the islands' edges, so filtering at a seam never reaches an unshaded texel.
  for (let pass = 0; pass < 4; pass++) {
    const previous = map.slice();
    for (let i = 0; i < map.length; i++) {
      if (previous[i] >= 0) continue;
      let sum = 0;
      let count = 0;
      for (const offset of [-1, 1, -size, size]) {
        const j = i + offset;
        if (j >= 0 && j < map.length && previous[j] >= 0) {
          sum += previous[j];
          count++;
        }
      }
      if (count) map[i] = sum / count;
    }
  }
  for (let i = 0; i < map.length; i++) {
    if (map[i] < 0) continue;
    for (let channel = 0; channel < 3; channel++)
      pixels[i * 3 + channel] = toSrgb(toLinear(pixels[i * 3 + channel]) * map[i]);
  }
}

/**
 * Paints each eye's disc in the colour map (where the eye's UVs fall) as lit glass: white at a tight core, falling off
 * round to `EYE_DISC.rim` at the disc's edge. The runtime tints it with the lamp's colour and its glow.
 */
function paintEyes(pixels, eyePart) {
  const size = TEXTURE.size;
  const uvs = eyePart.uvs.map(([u, v]) => [u * size, v * size]);
  // The two discs: split the eye's UVs at their middle along their wider spread.
  const low = [0, 1].map((a) => Math.min(...uvs.map((q) => q[a])));
  const high = [0, 1].map((a) => Math.max(...uvs.map((q) => q[a])));
  const axis = high[0] - low[0] > high[1] - low[1] ? 0 : 1;
  const middle = (low[axis] + high[axis]) / 2;
  for (const side of [-1, 1]) {
    const disc = uvs.filter((q) => (q[axis] - middle) * side > 0);
    const dLow = [0, 1].map((a) => Math.min(...disc.map((q) => q[a])));
    const dHigh = [0, 1].map((a) => Math.max(...disc.map((q) => q[a])));
    const center = [0, 1].map((a) => (dLow[a] + dHigh[a]) / 2);
    const radius = Math.max(dHigh[0] - dLow[0], dHigh[1] - dLow[1]) / 2;
    for (let py = Math.floor(center[1] - radius - 2); py <= Math.ceil(center[1] + radius + 2); py++)
      for (let px = Math.floor(center[0] - radius - 2); px <= Math.ceil(center[0] + radius + 2); px++) {
        const r = Math.hypot(px + 0.5 - center[0], py + 0.5 - center[1]) / radius;
        if (r > 1.15) continue;
        const glow = EYE_DISC.rim + (1 - EYE_DISC.rim) * Math.exp(-((r / EYE_DISC.core) ** 2));
        const value = toSrgb(glow);
        for (let channel = 0; channel < 3; channel++) pixels[(py * size + px) * 3 + channel] = value;
      }
  }
}

const fresh = new Document();
const buffer = fresh.createBuffer();
const unlit = fresh.createExtension(KHRMaterialsUnlit);
fresh.createExtension(EXTTextureWebP).setRequired(true);
const sourceImage = sourceMaterial.getBaseColorTexture().getImage();
const eyes = parts.find((entry) => entry.name === EYES);
await MeshoptSimplifier.ready;
const body = decimate(merge(parts.filter((entry) => entry !== eyes)), SIMPLIFY.body, SIMPLIFY.error);
const eyeMesh = decimate(eyes, SIMPLIFY.eyes, SIMPLIFY.error);
const pixels = await sharp(sourceImage)
  .resize(TEXTURE.size, TEXTURE.size, { kernel: 'lanczos3' })
  .removeAlpha()
  .raw()
  .toBuffer();
bakeAmbient(pixels, body);
paintEyes(pixels, eyes);
const image = await sharp(pixels, { raw: { width: TEXTURE.size, height: TEXTURE.size, channels: 3 } })
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
  .setBaseColorTexture(texture)
  .setBaseColorFactor([...TV_LAMP_LIGHT.color, 1])
  .setMetallicFactor(0)
  .setRoughnessFactor(1)
  .setExtension('KHR_materials_unlit', unlit.createUnlit());

const bodyNode = fresh
  .createNode(`${NAME} body`)
  .setMesh(fresh.createMesh(`${NAME} body`).addPrimitive(primitive(fresh, buffer, [body], bodyMaterial, true)));
const eyesNode = fresh
  .createNode(`${NAME} eyes`)
  .setMesh(fresh.createMesh(`${NAME} eyes`).addPrimitive(primitive(fresh, buffer, [eyeMesh], eyeMaterial, true)));
const sourceVertices = parts.reduce((sum, entry) => sum + entry.world.length, 0);
const sourceTriangles = parts.reduce((sum, entry) => sum + entry.indices.length / 3, 0);
// The eyes: two glass discs, told apart by which side of the face they sit on. Each one's light sits on its glass,
// along the head's facing (perpendicular to the line between the eyes, away from the wall).
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
const down = (EYE_AIM_DOWN * Math.PI) / 180;
const aim = [facing[0] * Math.cos(down), -Math.sin(down), facing[2] * Math.cos(down)];

// Self-shadow boxes in the body's own frame (turned back by the body's yaw about PLACE), shrunk to keep faces lit.
const bodyYaw = (BODY_TURN * Math.PI) / 180;
const local = (q) => rotate([q[0] - PLACE[0], q[1] - PLACE[1], q[2] - PLACE[2]], -bodyYaw);
const box = (prefixes) => {
  const points = parts
    .filter((entry) => prefixes.some((prefix) => entry.name === `ToyRobot:${prefix}_ToyRobot_MAT_0`))
    .flatMap((entry) => entry.world.map(local));
  assert.ok(points.length > 0, `Missing the ${prefixes} parts`);
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
      aim: aim.map(round),
      color: TV_LAMP_LIGHT.color,
      glow: EYE_GLOW,
      frame: { origin: PLACE, yaw: round(bodyYaw) },
      body: box(SHADOW_PARTS.body),
      legs: box(SHADOW_PARTS.legs),
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
