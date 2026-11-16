import {
  BACK_Y,
  CORKBOARD,
  CORKBOARD_SKIRT,
  type Corner,
  ITEMS,
  type PosterItem,
  RIDGE,
  SKIRT,
  type SkirtSide,
  SLOPE_DIR,
  SLOPE_NORMAL,
  type Surface,
  TAPE_IN,
  TAPE_SIZE,
  type TapeSpot,
} from './layout';

/*
 * The walls' geometry and the atlas's plan, from the layout alone: each sheet's card (with a sub-grid that carries a
 * curled corner), the tape that overhangs its edges and ramps down to the wall, the corkboard and its push pins, and a
 * few centimetres of contact shadow around every piece (the skirts). Pure numbers: the lazy wall hands them to three
 * through the posterKit.
 */

/** The 2K atlas; the 1K tier halves it each way under the same coordinates. */
export const ATLAS_WIDTH = 2048;
export const ATLAS_HEIGHT = 1024;
/** Texels kept clear around every island at the 2K tier, filled with the island's own edge. */
export const GUTTER = 4;

/** Layer n's card sits CARD_BASE + CARD_STEP · n off its surface; cork pieces sit on the cork. */
const CARD_BASE = 0.001;
const CARD_STEP = 0.00075;
const CORK_FACE = 0.0185;
const CORK_STEP = 0.0005;
/** A tape overhang lies this far over what is under it, ramping down from the card within OVERHANG_RAMP. */
const TAPE_LIFT = 0.0003;
const OVERHANG_RAMP = 0.004;
/** A lifted tape's free end rises this far, in proportion to how far it overhangs the sheet. */
const TAPE_FREE_LIFT = 0.006;
/** A curled corner lifts the paper within CURL_REACH · min(w, h) of the corner, quadratically, on a sub-grid. */
const CURL_REACH = 0.28;
const CURL_STEPS = 4;
const SKIRT_LIFT = 0.0001;
/** The corkboard's face (its frame's front) stands this far off the wall. */
export const CORK_DEPTH = 0.018;
export const PIN_RADIUS = 0.0055;
const PIN_HEIGHT = 0.007;
const PIN_SIDES = 8;
/** Texels per centimetre of a tape strip's own island: the densest sheet's, so no strip is softer than its paper. */
const TAPE_DENSITY = 8.5;

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface TapeFrame {
  readonly spot: TapeSpot;
  /** Centre, in the sheet's frame (metres, u right, v up), and the strip's angle in radians. */
  readonly u: number;
  readonly v: number;
  readonly angle: number;
  readonly lifted: boolean;
  readonly hidden: boolean;
}

export interface TapeIsland {
  readonly item: PosterItem;
  readonly tape: TapeFrame;
  readonly rect: Rect;
}

/** Where everything is painted, in 2K texels from the atlas's top-left. */
export interface AtlasPlan {
  readonly cards: ReadonlyMap<string, Rect>;
  readonly tapes: readonly TapeIsland[];
  readonly cork: Rect;
  /** The corkboard's frame seen edge-on: four cells along x (bottom, right, top, left). */
  readonly wood: Rect;
  /** One cell per push pin along x. */
  readonly pins: Rect;
  /** The skirts' ramp: white along its top rows, the contact shadow along its bottom ones. */
  readonly shade: Rect;
}

export const PIN_CELL = 12;
export const WOOD_CELL = 8;
/** Rows of the shade island above and below the ramp, so no mip level reads past its ends. */
export const SHADE_MARGIN = 8;

const CORNERS: Readonly<Record<Corner, readonly [number, number]>> = {
  BL: [-1, -1],
  BR: [1, -1],
  TR: [1, 1],
  TL: [-1, 1],
};

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** The strips of masking tape an item hangs from, in its own frame. */
export function tapesOf(item: PosterItem): TapeFrame[] {
  const { w, h } = item;
  const diagonal = Math.hypot(w, h) / 2;
  const slant = Math.atan2(w, h);
  return item.tapes.map((spot) => {
    const flags = { lifted: item.lifted?.includes(spot) ?? false, hidden: item.hidden?.includes(spot) ?? false };
    if (spot === 'ML' || spot === 'MR') {
      const side = spot === 'ML' ? -1 : 1;
      return { spot, u: side * (w / 2 - TAPE_IN), v: 0, angle: side < 0 ? Math.PI : 0, ...flags };
    }
    const [su, sv] = CORNERS[spot];
    // Across the corner's diagonal, TAPE_IN along it onto the sheet.
    const angle = sv < 0 ? su * slant : su * (Math.PI - slant);
    return {
      spot,
      u: su * (w / 2) * (1 - TAPE_IN / diagonal),
      v: sv * (h / 2) * (1 - TAPE_IN / diagonal),
      angle,
      ...flags,
    };
  });
}

/** Up to the next even texel, so the 1K tier halves every island exactly and none is softer than its density. */
const even = (n: number): number => 2 * Math.ceil(n / 2 - 1e-9);

/** A card's island in 2K texels. */
export function cardSize(item: { readonly w: number; readonly h: number; readonly density: number }): [number, number] {
  return [even(item.w * 100 * item.density), even(item.h * 100 * item.density)];
}

interface Skyline {
  x: number;
  y: number;
  w: number;
}

/** Bottom-left skyline packing, tallest first; each rectangle keeps GUTTER clear on every side. */
function pack(sizes: readonly (readonly [key: string, w: number, h: number])[]): Map<string, Rect> {
  let skyline: Skyline[] = [{ x: 0, y: 0, w: ATLAS_WIDTH }];
  const placed = new Map<string, Rect>();
  for (const [key, cw, ch] of [...sizes].sort((p, q) => q[2] - p[2] || q[1] - p[1])) {
    const w = cw + 2 * GUTTER;
    const h = ch + 2 * GUTTER;
    let best: { x: number; y: number } | null = null;
    for (let i = 0; i < skyline.length; i++) {
      const x = (skyline[i] as Skyline).x;
      if (x + w > ATLAS_WIDTH) break;
      let y = 0;
      for (let j = i, left = w; left > 0 && j < skyline.length; j++) {
        const segment = skyline[j] as Skyline;
        y = Math.max(y, segment.y);
        left -= segment.w;
      }
      if (y + h <= ATLAS_HEIGHT && (!best || y < best.y)) best = { x, y };
    }
    if (!best) throw new Error(`The posters' atlas has no room for ${key}`);
    placed.set(key, { x: best.x + GUTTER, y: best.y + GUTTER, w: cw, h: ch });
    const end = best.x + w;
    const next: Skyline[] = [{ x: best.x, y: best.y + h, w }];
    for (const s of skyline) {
      if (s.x < best.x) next.push({ x: s.x, y: s.y, w: Math.min(s.w, best.x - s.x) });
      if (s.x + s.w > end) next.push({ x: Math.max(s.x, end), y: s.y, w: s.x + s.w - Math.max(s.x, end) });
    }
    skyline = next.sort((p, q) => p.x - q.x);
  }
  return placed;
}

let plan: AtlasPlan | null = null;

/** The atlas's plan (the same on every call). */
export function atlasPlan(): AtlasPlan {
  if (plan) return plan;
  const overhanging = ITEMS.flatMap((item) =>
    tapesOf(item)
      .filter((tape) => !tape.hidden)
      .map((tape) => ({ item, tape })),
  );
  const [tapeW, tapeH] = [even(TAPE_SIZE[0] * 100 * TAPE_DENSITY), even(TAPE_SIZE[1] * 100 * TAPE_DENSITY)];
  const cellW = tapeW + 2 * GUTTER;
  const cellH = tapeH + 2 * GUTTER;
  const columns = 12;
  const rows = Math.ceil(overhanging.length / columns);
  const cork = cardSize(CORKBOARD);
  const pinCount = ITEMS.filter((item) => item.cork).length;
  const placed = pack([
    ...ITEMS.map((item) => [item.key, ...cardSize(item)] as const),
    ['cork', ...cork],
    ['tapes', columns * cellW - 2 * GUTTER, rows * cellH - 2 * GUTTER],
    ['wood', 4 * WOOD_CELL, WOOD_CELL],
    ['pins', pinCount * PIN_CELL, PIN_CELL],
    ['shade', 16, 32 + 2 * SHADE_MARGIN],
  ]);
  const rect = (key: string): Rect => placed.get(key) as Rect;
  const block = rect('tapes');
  plan = {
    cards: placed,
    tapes: overhanging.map(({ item, tape }, index) => ({
      item,
      tape,
      rect: {
        x: block.x + (index % columns) * cellW,
        y: block.y + Math.floor(index / columns) * cellH,
        w: tapeW,
        h: tapeH,
      },
    })),
    cork: rect('cork'),
    wood: rect('wood'),
    pins: rect('pins'),
    shade: rect('shade'),
  };
  return plan;
}

// ---------------------------------------------------------------- surfaces

type Point = readonly [number, number];

function rotate(u: number, v: number, degrees: number): [number, number] {
  const t = radians(degrees);
  return [u * Math.cos(t) - v * Math.sin(t), u * Math.sin(t) + v * Math.cos(t)];
}

interface Placed {
  readonly surface: Surface;
  readonly a: number;
  readonly b: number;
  readonly w: number;
  readonly h: number;
  readonly rot: number;
}

/** Sheet-local (u right, v up) → surface (a, b). On the slope a sheet's right is −y and its up the ridge. */
export function toSurface(item: Placed, u: number, v: number): [number, number] {
  const [ur, vr] = rotate(u, v, item.rot);
  return item.surface === 'slope' ? [item.a - ur, item.b - vr] : [item.a + ur, item.b + vr];
}

/** Surface (a, b) → the sheet's own (u, v). */
export function fromSurface(item: Placed, a: number, b: number): [number, number] {
  const [du, dv] = item.surface === 'back' ? [a - item.a, b - item.b] : [item.a - a, item.b - b];
  return rotate(du, dv, -item.rot);
}

/** Surface coordinates plus `lift` metres along the normal → the room's space (three.js: y up, the back wall at −z). */
export function surfacePoint(surface: Surface, a: number, b: number, lift: number): [number, number, number] {
  if (surface === 'back') return [a, b, lift - BACK_Y];
  return [
    RIDGE[0] + SLOPE_DIR[0] * b + SLOPE_NORMAL[0] * lift,
    RIDGE[1] + SLOPE_DIR[1] * b + SLOPE_NORMAL[1] * lift,
    -a,
  ];
}

/** A point of a sheet in the room's space. */
export function sheetPoint(item: Placed, u: number, v: number, lift: number): [number, number, number] {
  const [a, b] = toSurface(item, u, v);
  return surfacePoint(item.surface, a, b, lift);
}

export function cardOffset(item: PosterItem): number {
  return item.cork ? CORK_FACE + CORK_STEP * (item.layer - 10) : CARD_BASE + CARD_STEP * item.layer;
}

/** How far the item's curled corners lift its paper at a sheet-local point; also beyond the edge, for its tape. */
export function curlLift(item: PosterItem, u: number, v: number): number {
  let lift = 0;
  const reach = CURL_REACH * Math.min(item.w, item.h);
  for (const [spot, amount] of Object.entries(item.curl ?? {}) as [Corner, number][]) {
    const [cu, cv] = CORNERS[spot];
    const t = Math.max(0, 1 - Math.hypot(u - (cu * item.w) / 2, v - (cv * item.h) / 2) / reach);
    lift += amount * t * t;
  }
  return lift;
}

/** The height over the surface of whatever lies under `item` at a surface point: a lower card or the bare wall. */
function underOffset(item: PosterItem, a: number, b: number): number {
  let layer = -1;
  for (const other of ITEMS) {
    if (other.surface !== item.surface || other.cork || other.layer >= item.layer) continue;
    const [u, v] = fromSurface(other, a, b);
    if (Math.abs(u) <= other.w / 2 && Math.abs(v) <= other.h / 2) layer = Math.max(layer, other.layer);
  }
  return layer < 0 ? 0 : CARD_BASE + CARD_STEP * layer;
}

/** Clips a convex polygon to n·p ≥ d (`beyond`) or n·p ≤ d. */
function halfPlane(polygon: readonly Point[], nx: number, ny: number, d: number, beyond: boolean): Point[] {
  const out: Point[] = [];
  const sign = beyond ? 1 : -1;
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length] as Point;
    const fp = sign * (nx * p[0] + ny * p[1] - d);
    const fq = sign * (nx * q[0] + ny * q[1] - d);
    if (fp >= 0) out.push(p);
    if (fp >= 0 !== fq >= 0) {
      const t = fp / (fp - fq);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  });
  return out;
}

function area(polygon: readonly Point[]): number {
  let sum = 0;
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length] as Point;
    sum += p[0] * q[1] - q[0] * p[1];
  });
  return Math.abs(sum) / 2;
}

/** The strip's four corners in its sheet's frame. */
export function tapeOutline(tape: TapeFrame): Point[] {
  const [du, dv] = [Math.cos(tape.angle), Math.sin(tape.angle)];
  const [halfL, halfW] = [TAPE_SIZE[0] / 2, TAPE_SIZE[1] / 2];
  return (
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const
  ).map(([sl, sw]) => [tape.u + du * sl * halfL - dv * sw * halfW, tape.v + dv * sl * halfL + du * sw * halfW]);
}

// ---------------------------------------------------------------- meshes

export interface WallMesh {
  readonly positions: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint16Array;
}

export interface DecorBox {
  readonly key: string;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface WallGeometry {
  /** The cards, the tape, the corkboard and its pins: ascending by layer. */
  readonly cards: WallMesh;
  /** The contact shadows, multiplied onto the wall. */
  readonly skirts: WallMesh;
  /** Per piece, the box of everything it draws, in the room's space. */
  readonly boxes: readonly DecorBox[];
}

class MeshBuilder {
  readonly positions: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];
  readonly #boxes: Map<string, { min: [number, number, number]; max: [number, number, number] }>;

  constructor(boxes: Map<string, { min: [number, number, number]; max: [number, number, number] }>) {
    this.#boxes = boxes;
  }

  /** Adds a vertex (an atlas position in 2K texels) and returns its index. */
  vertex(key: string, point: readonly [number, number, number], px: number, py: number): number {
    this.positions.push(...point);
    this.uvs.push(px / ATLAS_WIDTH, py / ATLAS_HEIGHT);
    let box = this.#boxes.get(key);
    if (!box) {
      box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      this.#boxes.set(key, box);
    }
    for (let axis = 0; axis < 3; axis++) {
      box.min[axis] = Math.min(box.min[axis] as number, point[axis] as number);
      box.max[axis] = Math.max(box.max[axis] as number, point[axis] as number);
    }
    return this.positions.length / 3 - 1;
  }

  fan(vertices: readonly number[]): void {
    for (let i = 1; i < vertices.length - 1; i++) {
      this.indices.push(vertices[0] as number, vertices[i] as number, vertices[i + 1] as number);
    }
  }

  mesh(): WallMesh {
    return {
      positions: Float32Array.from(this.positions),
      uvs: Float32Array.from(this.uvs),
      indices: Uint16Array.from(this.indices),
    };
  }
}

function cardGrid(item: PosterItem): [number[], number[]] {
  const { w, h } = item;
  const us = new Set([-w / 2, w / 2]);
  const vs = new Set([-h / 2, h / 2]);
  const reach = CURL_REACH * Math.min(w, h);
  for (const spot of Object.keys(item.curl ?? {}) as Corner[]) {
    const [cu, cv] = CORNERS[spot];
    for (let k = 1; k <= CURL_STEPS; k++) {
      us.add(cu * (w / 2 - (reach * k) / CURL_STEPS));
      vs.add(cv * (h / 2 - (reach * k) / CURL_STEPS));
    }
  }
  const ascending = (p: number, q: number): number => p - q;
  return [[...us].sort(ascending), [...vs].sort(ascending)];
}

function card(out: MeshBuilder, item: PosterItem, rect: Rect): void {
  const [us, vs] = cardGrid(item);
  const offset = cardOffset(item);
  const start = out.positions.length / 3;
  for (const v of vs) {
    for (const u of us) {
      out.vertex(
        item.key,
        sheetPoint(item, u, v, offset + curlLift(item, u, v)),
        rect.x + (u / item.w + 0.5) * rect.w,
        rect.y + (0.5 - v / item.h) * rect.h,
      );
    }
  }
  const n = us.length;
  for (let j = 0; j < vs.length - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = start + j * n + i;
      out.fan([a, a + 1, a + n + 1, a + n]);
    }
  }
}

/** A tape's overhang: the strip beyond its sheet's edges, from the card's height down to what lies under it. */
function overhang(out: MeshBuilder, { item, tape, rect }: TapeIsland): void {
  const offset = cardOffset(item);
  const [du, dv] = [Math.cos(tape.angle), Math.sin(tape.angle)];
  const [length, width] = TAPE_SIZE;
  const height = (u: number, v: number): number => {
    const [a, b] = toSurface(item, u, v);
    const beyond = Math.max(Math.abs(u) - item.w / 2, Math.abs(v) - item.h / 2, 0);
    const ramp = Math.min(1, beyond / OVERHANG_RAMP);
    const lift = tape.lifted ? TAPE_FREE_LIFT * Math.min(1, beyond / (length / 2)) : 0;
    return offset + (underOffset(item, a, b) + TAPE_LIFT - offset) * ramp + curlLift(item, u, v) + lift;
  };
  let rest = tapeOutline(tape);
  for (const [nx, ny, d] of [
    [1, 0, item.w / 2],
    [-1, 0, item.w / 2],
    [0, 1, item.h / 2],
    [0, -1, item.h / 2],
  ] as const) {
    const piece = halfPlane(rest, nx, ny, d, true);
    rest = halfPlane(rest, nx, ny, d, false);
    if (piece.length >= 3 && area(piece) > 1e-10) {
      for (const part of [
        halfPlane(piece, nx, ny, d + OVERHANG_RAMP, false),
        halfPlane(piece, nx, ny, d + OVERHANG_RAMP, true),
      ]) {
        if (part.length < 3 || area(part) < 1e-12) continue;
        out.fan(
          part.map(([u, v]) => {
            const s = (u - tape.u) * du + (v - tape.v) * dv;
            const t = (v - tape.v) * du - (u - tape.u) * dv;
            return out.vertex(
              item.key,
              sheetPoint(item, u, v, height(u, v)),
              rect.x + (s / length + 0.5) * rect.w,
              rect.y + (0.5 - t / width) * rect.h,
            );
          }),
        );
      }
    }
    if (rest.length < 3) break;
  }
}

const SKIRT_SIDES: Readonly<
  Record<SkirtSide, readonly [from: readonly [number, number], to: readonly [number, number]]>
> = {
  b: [CORNERS.BL, CORNERS.BR],
  t: [CORNERS.TR, CORNERS.TL],
  l: [CORNERS.TL, CORNERS.BL],
  r: [CORNERS.BR, CORNERS.TR],
};

interface Skirted extends Placed {
  readonly key: string;
  readonly skirt?: Readonly<Partial<Record<SkirtSide, number>>>;
}

/** Four trapezoids of contact shadow flat on the surface, mitred at the corners. */
function skirt(out: MeshBuilder, item: Skirted, shade: Rect): void {
  const width = (side: SkirtSide): number => item.skirt?.[side] ?? SKIRT;
  const x = shade.x + shade.w / 2;
  const outerRow = shade.y + SHADE_MARGIN / 2;
  const innerRow = shade.y + shade.h - SHADE_MARGIN / 2;
  for (const [from, to] of Object.values(SKIRT_SIDES)) {
    const corners = [from, to].map(([su, sv]) => {
      const inner: Point = [(su * item.w) / 2, (sv * item.h) / 2];
      const outer: Point = [inner[0] + su * width(su > 0 ? 'r' : 'l'), inner[1] + sv * width(sv > 0 ? 't' : 'b')];
      return { inner, outer };
    }) as [{ inner: Point; outer: Point }, { inner: Point; outer: Point }];
    out.fan([
      out.vertex(item.key, sheetPoint(item, ...corners[0].outer, SKIRT_LIFT), x, outerRow),
      out.vertex(item.key, sheetPoint(item, ...corners[1].outer, SKIRT_LIFT), x, outerRow),
      out.vertex(item.key, sheetPoint(item, ...corners[1].inner, SKIRT_LIFT), x, innerRow),
      out.vertex(item.key, sheetPoint(item, ...corners[0].inner, SKIRT_LIFT), x, innerRow),
    ]);
  }
}

const BOARD: Skirted = { ...CORKBOARD, surface: 'back', rot: 0, skirt: CORKBOARD_SKIRT };

function corkboard(out: MeshBuilder, face: Rect, wood: Rect): void {
  const { w, h, key } = CORKBOARD;
  const corners: readonly Point[] = [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ];
  out.fan(
    corners.map(([u, v]) =>
      out.vertex(
        key,
        sheetPoint(BOARD, u, v, CORK_DEPTH),
        face.x + (u / w + 0.5) * face.w,
        face.y + (0.5 - v / h) * face.h,
      ),
    ),
  );
  // The frame's four sides (bottom, right, top, left), each on its own cell of wood.
  corners.forEach((from, side) => {
    const to = corners[(side + 1) % 4] as Point;
    const x = wood.x + (side + 0.5) * WOOD_CELL;
    const y = wood.y + wood.h / 2;
    out.fan(
      (
        [
          [from, 0],
          [to, 0],
          [to, CORK_DEPTH],
          [from, CORK_DEPTH],
        ] as const
      ).map(([[u, v], depth]) => out.vertex(key, sheetPoint(BOARD, u, v, depth), x, y)),
    );
  });
}

/** Where a cork piece's push pin stands, in its own frame. */
export function pinSpot(item: PosterItem): Point {
  return [0, 0.4 * item.h];
}

function pin(out: MeshBuilder, item: PosterItem, cell: Point): void {
  const [pu, pv] = pinSpot(item);
  const base = cardOffset(item);
  const [cx, cy] = cell;
  const top = out.vertex(item.key, sheetPoint(item, pu, pv, base + PIN_HEIGHT), cx, cy);
  const ring = (lift: number, texels: number): number[] =>
    Array.from({ length: PIN_SIDES }, (_, i) => {
      const [c, s] = [Math.cos((2 * Math.PI * i) / PIN_SIDES), Math.sin((2 * Math.PI * i) / PIN_SIDES)];
      return out.vertex(
        item.key,
        sheetPoint(item, pu + PIN_RADIUS * c, pv + PIN_RADIUS * s, lift),
        cx + texels * c,
        cy - texels * s,
      );
    });
  const head = ring(base + PIN_HEIGHT, 3);
  const foot = ring(base + 0.0005, 4.5);
  for (let i = 0; i < PIN_SIDES; i++) {
    const j = (i + 1) % PIN_SIDES;
    out.fan([top, head[i] as number, head[j] as number]);
    out.fan([foot[i] as number, foot[j] as number, head[j] as number, head[i] as number]);
  }
}

/** Everything the walls draw. */
export function wallGeometry(): WallGeometry {
  const atlas = atlasPlan();
  const boxes = new Map<string, { min: [number, number, number]; max: [number, number, number] }>();
  const cards = new MeshBuilder(boxes);
  const skirts = new MeshBuilder(boxes);
  const rect = (key: string): Rect => atlas.cards.get(key) as Rect;
  const byLayer = [...ITEMS].sort((p, q) => p.layer - q.layer);
  for (const item of byLayer.filter((each) => !each.cork)) {
    card(cards, item, rect(item.key));
    for (const tape of atlas.tapes) if (tape.item === item) overhang(cards, tape);
    skirt(skirts, item, atlas.shade);
  }
  corkboard(cards, atlas.cork, atlas.wood);
  skirt(skirts, BOARD, atlas.shade);
  const pinned = byLayer.filter((each) => each.cork);
  for (const item of pinned) card(cards, item, rect(item.key));
  pinned.forEach((item, index) => {
    pin(cards, item, [atlas.pins.x + (index + 0.5) * PIN_CELL, atlas.pins.y + PIN_CELL / 2]);
  });
  return {
    cards: cards.mesh(),
    skirts: skirts.mesh(),
    boxes: [...boxes].map(([key, { min, max }]) => ({ key, min, max })),
  };
}

/** The cork pieces in the order their pins' cells are painted. */
export function pinnedItems(): PosterItem[] {
  return [...ITEMS].sort((p, q) => p.layer - q.layer).filter((item) => item.cork);
}
