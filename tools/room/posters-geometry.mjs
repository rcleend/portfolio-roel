// The posters' geometry contract, shared by the node stage (posters.mjs) and `pnpm verify:room`: which surface a
// shipped triangle lies on, the keep-outs and surface bounds it must respect, the sheets' declared overlaps, and how
// far an overhang's sheet-edge vertex sits from its card. It re-derives these from the committed layout.json and the
// emitted geometry, independently of the Blender stage's own validator (tools/room/posters.py `validate`).

/** The captain's eleven topics: every one is on the walls, and nothing else is. */
export const POSTERS_TOPICS = [
  'Avatar',
  'Call of Duty 4',
  'Green Day',
  'Guitar Hero III',
  'LEGO Star Wars',
  'Oblivion',
  'RATM',
  'Radiohead',
  'RuneScape',
  'SSX 3',
  'Star Wars',
];

/** How far off its surface anything may stand: a cork piece's pin head is the furthest (27 mm). */
export const POSTERS_MAX_OFFSET = 0.03;
/** Below the 16-bit position quantization of a 5.6 m node (≈ 0.09 mm), two things touch rather than overlap. */
const EPSILON = 1e-4;

/** glTF Y-up → Blender Z-up, the layout's frame: (x, y, z) → (x, -z, y). */
export const toBlender = ([x, y, z]) => [x, -z, y];

/**
 * A Blender point's coordinates on the layout's two surfaces: back (a: x, b: z, off: in front of the wall) and
 * slope (a: y, b: metres down from the ridge, off: inward along the slope's normal).
 */
export function surfaceCoordinates(room, [x, y, z]) {
  const [rx, rz] = room.ridge;
  const [dx, , dz] = room.slopeDir;
  return {
    back: { a: x, b: z, off: room.backY - y },
    // The inward normal is the slope direction turned a quarter towards the room: (dz, 0, -dx) = (-0.603, 0, -0.797).
    slope: { a: y, b: (x - rx) * dx + (z - rz) * dz, off: (x - rx) * dz - (z - rz) * dx },
  };
}

/** Whether a surface point lies inside that surface's polygon (the back wall is cut by the slope above the ridge). */
export function onSurface(room, surface, a, b) {
  if (surface === 'back') {
    const [rx, rz] = room.ridge;
    const top = a <= rx ? rz : rz - (a - rx) * (-room.slopeDir[2] / room.slopeDir[0]);
    return a >= -2.8 - EPSILON && a <= 2.8 + EPSILON && b >= -EPSILON && b <= top + EPSILON;
  }
  return a >= -2.4 - EPSILON && a <= 2.4 + EPSILON && b >= -EPSILON && b <= room.slopeLength + EPSILON;
}

/** Whether two convex 2D polygons share more than an edge (separating-axis test with a touching tolerance). */
export function convexOverlap(p, q) {
  for (const poly of [p, q]) {
    for (let i = 0; i < poly.length; i++) {
      const [x0, y0] = poly[i];
      const [x1, y1] = poly[(i + 1) % poly.length];
      const length = Math.hypot(x1 - x0, y1 - y0);
      if (length < 1e-12) continue;
      const axis = [(y1 - y0) / length, (x0 - x1) / length];
      const project = (points) => points.map(([x, y]) => x * axis[0] + y * axis[1]);
      const a = project(p);
      const b = project(q);
      if (Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b)) <= EPSILON) return false;
    }
  }
  return true;
}

/** An axis-aligned box [a0, b0, a1, b1] as a polygon. */
export const boxPolygon = ([a0, b0, a1, b1]) => [
  [a0, b0],
  [a1, b0],
  [a1, b1],
  [a0, b1],
];

/** A layout item's sheet on its surface (tools/room/posters.py `rect`: on the slope a sheet's right is -y). */
export function sheetPolygon(item) {
  const t = (item.rot * Math.PI) / 180;
  const sign = item.surface === 'slope' ? -1 : 1;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([su, sv]) => {
    const u = (su * item.w) / 2;
    const v = (sv * item.h) / 2;
    return [item.a + sign * (u * Math.cos(t) - v * Math.sin(t)), item.b + sign * (u * Math.sin(t) + v * Math.cos(t))];
  });
}

/**
 * The layout's data contract: the eleven topics and nothing else, unique keys, and on each surface only the declared
 * overlaps, each on distinct layers (cork pieces among themselves on distinct layers). Returns the violations.
 */
export function layoutViolations(layout) {
  const bad = [];
  const topics = new Set(layout.items.map((item) => item.topic));
  const wanted = new Set(POSTERS_TOPICS);
  if (topics.size !== wanted.size || [...topics].some((topic) => !wanted.has(topic))) {
    bad.push(`topics ${[...topics].sort().join(', ')}`);
  }
  const keys = layout.items.map((item) => item.key);
  if (new Set(keys).size !== keys.length) bad.push('duplicate keys');
  const declared = new Set(layout.overlaps.map((pair) => [...pair].sort().join('+')));
  const groups = [layout.items.filter((item) => !item.cork), layout.items.filter((item) => item.cork)];
  for (const [g, group] of groups.entries()) {
    for (let i = 0; i < group.length; i++) {
      for (const q of group.slice(i + 1)) {
        const p = group[i];
        if (p.surface !== q.surface || !convexOverlap(sheetPolygon(p), sheetPolygon(q))) continue;
        const pair = [p.key, q.key].sort().join('+');
        if (g === 0 && !declared.has(pair)) bad.push(`undeclared overlap ${pair}`);
        if (p.layer === q.layer) bad.push(`same-layer overlap ${pair}`);
      }
    }
  }
  for (const pair of declared) {
    const [p, q] = pair.split('+').map((key) => layout.items.find((item) => item.key === key));
    if (!p || !q || !convexOverlap(sheetPolygon(p), sheetPolygon(q))) bad.push(`declared overlap ${pair} is not one`);
  }
  return bad;
}

/**
 * Where a shipped triangle (Blender points) stands: the surface it lies on within POSTERS_MAX_OFFSET, whether it
 * stays inside that surface, and the keep-outs it enters. A triangle on neither surface returns surface undefined.
 */
export function triangleOnSurface(layout, points) {
  const coordinates = points.map((point) => surfaceCoordinates(layout.room, point));
  const surface = ['back', 'slope'].find((name) =>
    coordinates.every((c) => c[name].off >= -EPSILON && c[name].off <= POSTERS_MAX_OFFSET),
  );
  if (!surface) return { surface };
  const polygon = coordinates.map((c) => [c[surface].a, c[surface].b]);
  const inside = polygon.every(([a, b]) => onSurface(layout.room, surface, a, b));
  const keepouts = Object.entries(layout.keepouts[surface] ?? {})
    .filter(([, box]) => convexOverlap(polygon, boxPolygon(box)))
    .map(([zone]) => zone);
  return { surface, inside, keepouts, offset: Math.max(...coordinates.map((c) => c[surface].off)) };
}

/** The distance from point p to triangle abc (3D; Ericson, Real-Time Collision Detection 5.1.5). */
export function pointTriangleDistance(p, a, b, c) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const along = (origin, u, s) => [origin[0] + u[0] * s, origin[1] + u[1] * s, origin[2] + u[2] * s];
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  let q;
  if (d1 <= 0 && d2 <= 0) q = a;
  else {
    const bp = sub(p, b);
    const d3 = dot(ab, bp);
    const d4 = dot(ac, bp);
    const cp = sub(p, c);
    const d5 = dot(ab, cp);
    const d6 = dot(ac, cp);
    const vc = d1 * d4 - d3 * d2;
    const vb = d5 * d2 - d1 * d6;
    const va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) q = b;
    else if (d6 >= 0 && d5 <= d6) q = c;
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) q = along(a, ab, d1 / (d1 - d3));
    else if (vb <= 0 && d2 >= 0 && d6 <= 0) q = along(a, ac, d2 / (d2 - d6));
    else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) q = along(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6)));
    else {
      const denominator = 1 / (va + vb + vc);
      q = along(along(a, ab, vb * denominator), ac, vc * denominator);
    }
  }
  return Math.hypot(...sub(p, q));
}

/**
 * The widest gap between an overhang's sheet-edge vertices and its own card (metres): the strip must start on the
 * card's surface, or it shows a step or a slit where it leaves the sheet. Reads the Blender stage's
 * posters-geometry.json pieces (Blender coordinates, per item).
 */
export function overhangJoinGap(pieces) {
  let worst = 0;
  for (const overhang of pieces.filter((piece) => piece.kind === 'overhang')) {
    const card = pieces.find((piece) => piece.kind === 'card' && piece.item === overhang.item);
    if (!card) throw new Error(`posters: ${overhang.island} has no card`);
    for (const index of overhang.edgeVertices) {
      const p = overhang.positions[index];
      const gap = Math.min(
        ...card.tris.map(([a, b, c]) => pointTriangleDistance(p, ...[a, b, c].map((k) => card.positions[k]))),
      );
      worst = Math.max(worst, gap);
    }
  }
  return worst;
}
