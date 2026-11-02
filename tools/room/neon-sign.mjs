// Publish the neon "R" sign on the left-hand end of the TV cabinet into room.glb, preserving every other asset.
// node tools/room/neon-sign.mjs
//
// Reference: "Neon Open Sign" by Logan S. (CC-BY-4.0, https://sketchfab.com/3d-models/neon-open-sign-2efad97b50f34220b2df92fe99c8a2ad):
// a blue neon tube bent into a rounded rectangle, open by a short gap near its top-left corner, around a red "Open",
// glass tubes only (no backing). The sign is rebuilt here rather than cut from that mesh: the same blue border and
// red tube, at the reference's proportions (below, measured on a straight-on render of it, in units of the letters'
// height), around a single "R" bent from one continuous tube. Both are swept circles with round end caps.
// Like the opal lamp (tv-lamp.mjs) it is light, not a baked surface: both tubes are `_BAKED_UNLIT` colours the runtime
// pushes past white (`light.*.glow`), and the finish lights the room from them (src/room/atmosphere/neonSign.ts),
// with the plane and extents of each tube in the node's extras so the asset is the only place they are defined.
// Mapless and unlit like the lamp's parts, the tubes add no shader program of their own.
import assert from 'node:assert/strict';
import { Document } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';
import { publishTvProp } from './publish-tv-prop.mjs';

const NAME = 'TV neon sign';

/** The reference's proportions, in letter heights (the letters' outer height, tube included). */
const REFERENCE = {
  tube: 0.1, // tube diameter
  letterWidth: 0.72, // the reference's P, the letter an R is built on, outer width
  margin: [0.3, 0.34], // border's outer edge to the letters' outer edge, across (0.35 on the wider word) and up
  corner: 0.26, // border's outer corner radius
  gap: [-0.33, -0.09], // the border's opening near its top-left: its end caps' centres, from the sign's middle
};

/** The room (docs/ROOM.md › Original TV geometry contract): cabinet top, the wall behind it and the set's height. */
const CABINET_TOP = 0.486;
const WALL_X = 2.8;
const TV_MIDDLE = (0.491 + 1.071) / 2;
/** Leaning back against the wall, far enough left of the set (z −0.62 to −0.02) to stand clear of it in the TV view. */
const LEAN = (10 * Math.PI) / 180;
const RIGHT_EDGE_Z = -0.78;

/** The R's top reaches halfway up the set: the letters' height that puts it there, standing on the cabinet. */
const H = REFERENCE.margin[1] * 2 + 1; // the sign's outer height in letter heights
const tubeCenters = H - REFERENCE.tube; // bottom tube's centre to the top tube's
const letterTop = H - REFERENCE.margin[1] - REFERENCE.tube; // bottom tube's centre to the R's top tube's centre
const LETTER = (TV_MIDDLE - CABINET_TOP) / (REFERENCE.tube + letterTop * Math.cos(LEAN));
const R = (REFERENCE.tube * LETTER) / 2; // tube radius

const COLORS = {
  // Neon's own orange-red and a mercury-argon blue tube, linear. The finish turns `glow` × these into light.
  letter: { color: [1, 0.1, 0.035], glow: 2.6 },
  border: { color: [0.05, 0.24, 1], glow: 2.6 },
};

// ---- The tubes' centrelines, in the sign's plane (metres, x right, y up, origin at the sign's middle).

/**
 * A polyline whose interior corners are rounded with the given radii (`[x, y, radius]`), sampled every 12° along each
 * bend. Straight runs need only their ends.
 */
function rounded(points) {
  const out = [points[0].slice(0, 2)];
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py, radius] = points[i];
    const a = normal2([px - points[i - 1][0], py - points[i - 1][1]]);
    const b = normal2([points[i + 1][0] - px, points[i + 1][1] - py]);
    const turn = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
    if (!radius || turn < 1e-6) {
      out.push([px, py]);
      continue;
    }
    const tangent = radius * Math.tan(turn / 2);
    assert.ok(
      tangent <= Math.hypot(px - points[i - 1][0], py - points[i - 1][1]) + 1e-9 &&
        tangent <= Math.hypot(points[i + 1][0] - px, points[i + 1][1] - py) + 1e-9,
      `Bend ${i} does not fit its runs`,
    );
    const side = Math.sign(a[0] * b[1] - a[1] * b[0]); // +1 turning left
    const start = [px - a[0] * tangent, py - a[1] * tangent];
    const center = [start[0] - a[1] * radius * side, start[1] + a[0] * radius * side];
    const from = Math.atan2(start[1] - center[1], start[0] - center[0]);
    const steps = Math.max(2, Math.ceil(turn / ((12 * Math.PI) / 180)));
    for (let s = 0; s <= steps; s++) {
      const angle = from + side * turn * (s / steps);
      out.push([center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius]);
    }
  }
  out.push(points.at(-1).slice(0, 2));
  return out;
}

function normal2([x, y]) {
  const length = Math.hypot(x, y);
  return [x / length, y / length];
}

const L = LETTER;
/** The R's centreline box: its outer width and height less the tube. */
const rx = (REFERENCE.letterWidth - REFERENCE.tube) / 2;
const ry = (1 - REFERENCE.tube) / 2;
const bowl = 0.47 / 2; // the bowl's radius: from the top down to just below the middle, as on the reference's P
/**
 * One continuous tube, as a glassblower bends it: up the stem, along the top, round the bowl and back to just short of
 * the stem, then sharply down the leg.
 */
const letter = rounded([
  [-rx, -ry],
  [-rx, ry, 0.08],
  [rx, ry, bowl],
  [rx, ry - 2 * bowl, bowl],
  [-rx + REFERENCE.tube, ry - 2 * bowl, 0.04],
  [rx, -ry],
]).map(([x, y]) => [x * L, y * L]);

const bx = REFERENCE.letterWidth / 2 + REFERENCE.margin[0] - REFERENCE.tube / 2;
const by = H / 2 - REFERENCE.tube / 2;
const bc = REFERENCE.corner - REFERENCE.tube / 2;
/** The border, from the gap's right-hand end clockwise round to its left-hand end. */
const border = rounded([
  [REFERENCE.gap[1], by],
  [bx, by, bc],
  [bx, -by, bc],
  [-bx, -by, bc],
  [-bx, by, bc],
  [REFERENCE.gap[0], by],
]).map(([x, y]) => [x * L, y * L]);

// ---- Placed in the room: x right is +z (the TV view looks along +x), y up leans back towards the wall.

const U = [0, 0, 1];
const V = [Math.sin(LEAN), Math.cos(LEAN), 0];
const N = [-Math.cos(LEAN), Math.sin(LEAN), 0]; // the sign's front, U × V
// The bottom tube rests on the cabinet; the top tube touches the wall.
const halfCenters = (tubeCenters * L) / 2;
const middle = [WALL_X - R - halfCenters * V[0], CABINET_TOP + R + halfCenters * V[1], RIGHT_EDGE_Z - (bx * L + R)];
const place = ([x, y]) => [0, 1, 2].map((axis) => middle[axis] + U[axis] * x + V[axis] * y);

/** A circle of `R` swept along a centreline in the sign's plane, closed by hemispherical caps. */
function tube(centreline) {
  const SIDES = 12;
  const CAP_RINGS = 3;
  const positions = [];
  const normals = [];
  const indices = [];
  const ring = (center, across, along, scale, offset) => {
    // `across` lies in the sign's plane, perpendicular to the path; N is the other side of the tube.
    for (let s = 0; s < SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2;
      const n = [0, 1, 2].map(
        (axis) => (across[axis] * Math.cos(a) + N[axis] * Math.sin(a)) * scale + along[axis] * offset,
      );
      normals.push(n);
      positions.push([0, 1, 2].map((axis) => center[axis] + n[axis] * R));
    }
  };
  const link = (first, second) => {
    for (let s = 0; s < SIDES; s++) {
      const a = first + s;
      const b = first + ((s + 1) % SIDES);
      const c = second + s;
      const d = second + ((s + 1) % SIDES);
      indices.push(a, b, c, b, d, c);
    }
  };
  const directions = centreline.map((_, i) => {
    const before = centreline[Math.max(i - 1, 0)];
    const after = centreline[Math.min(i + 1, centreline.length - 1)];
    const [dx, dy] = normal2([after[0] - before[0], after[1] - before[1]]);
    return [dx, dy];
  });
  const world = (vector) => [0, 1, 2].map((axis) => U[axis] * vector[0] + V[axis] * vector[1]);
  const cap = (index, sign) => {
    // From the tube's end outwards: rings narrowing to the pole, a hemisphere of `R`.
    const along = world(directions[index]).map((value) => value * sign);
    const across = world([-directions[index][1], directions[index][0]]);
    const center = place(centreline[index]);
    const rings = [];
    for (let k = 0; k <= CAP_RINGS; k++) {
      const angle = (k / (CAP_RINGS + 1)) * (Math.PI / 2);
      rings.push(positions.length);
      ring(center, across, along, Math.cos(angle), Math.sin(angle));
    }
    const pole = positions.length;
    positions.push(center.map((value, axis) => value + along[axis] * R));
    normals.push(along);
    return { rings, pole };
  };
  const body = centreline.map((point, i) => {
    const start = positions.length;
    ring(place(point), world([-directions[i][1], directions[i][0]]), [0, 0, 0], 1, 0);
    return start;
  });
  for (let i = 0; i + 1 < body.length; i++) link(body[i], body[i + 1]);
  for (const [index, sign] of [
    [0, -1],
    [centreline.length - 1, 1],
  ]) {
    const { rings, pole } = cap(index, sign);
    // The cap's first ring sits on the body's end ring; going outwards keeps the winding of the body's direction.
    for (let k = 0; k + 1 < rings.length; k++)
      if (sign > 0) link(rings[k], rings[k + 1]);
      else link(rings[k + 1], rings[k]);
    const last = rings.at(-1);
    for (let s = 0; s < SIDES; s++) {
      const a = last + s;
      const b = last + ((s + 1) % SIDES);
      indices.push(...(sign > 0 ? [a, b, pole] : [b, a, pole]));
    }
  }
  return { positions, normals, indices };
}

function primitive(document, buffer, { positions, normals, indices }, material) {
  return document
    .createPrimitive()
    .setAttribute(
      'POSITION',
      document.createAccessor().setType('VEC3').setArray(new Float32Array(positions.flat())).setBuffer(buffer),
    )
    .setAttribute(
      'NORMAL',
      document.createAccessor().setType('VEC3').setArray(new Float32Array(normals.flat())).setBuffer(buffer),
    )
    .setIndices(document.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer))
    .setMaterial(material);
}

const fresh = new Document();
const buffer = fresh.createBuffer();
const unlit = fresh.createExtension(KHRMaterialsUnlit);
const material = (name, color) =>
  fresh
    .createMaterial(name)
    .setBaseColorFactor([...color, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(1)
    .setExtension('KHR_materials_unlit', unlit.createUnlit());
const part = (name, centreline, materialName, color) =>
  fresh
    .createNode(`${NAME} ${name}`)
    .setMesh(
      fresh
        .createMesh(`${NAME} ${name}`)
        .addPrimitive(primitive(fresh, buffer, tube(centreline), material(materialName, color))),
    );

const round = (value) => Math.round(value * 1e4) / 1e4;
const node = fresh
  .createNode(NAME)
  .addChild(part('border', border, '01_TV_neon_blue_BAKED_UNLIT', COLORS.border.color))
  .addChild(part('letter', letter, '01_TV_neon_red_BAKED_UNLIT', COLORS.letter.color))
  .setExtras({
    asset_group: '01_TV',
    supplied_asset: 'neon-sign',
    source_title: 'Neon Open Sign',
    source_author: 'Logan S. (https://sketchfab.com/Logan_S)',
    source_license: 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
    source_url: 'https://sketchfab.com/3d-models/neon-open-sign-2efad97b50f34220b2df92fe99c8a2ad',
    adaptation: 'rebuilt at the reference proportions; "Open" replaced by a single R',
    // The sign's plane: its middle, its right and up directions; each tube's centreline half extents in that plane.
    light: {
      center: middle.map(round),
      right: U,
      up: V.map(round),
      letter: { half: [round(rx * L), round(ry * L)], ...COLORS.letter },
      border: { half: [round(bx * L), round(by * L)], ...COLORS.border },
    },
  });
fresh.createScene().addChild(node);

const letterTopY = middle[1] + ry * L * V[1] + R;
assert.ok(Math.abs(letterTopY - TV_MIDDLE) < 0.002, `The R's top (${letterTopY}) is not halfway up the set`);
const totalBytes = await publishTvProp(fresh, NAME, 'neon-sign');
console.log(
  `Published the neon sign (${round(2 * (bx * L + R))} × ${round(2 * (by * L + R))} m, letter ${round(L)} m, tube ${round(2 * R)} m, middle ${middle.map(round).join(', ')}): ${totalBytes} bytes total.`,
);
