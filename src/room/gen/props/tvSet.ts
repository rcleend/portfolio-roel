import { ART } from '../art';
import type { MeshBuilder, Rgb, Ring, Vec3 } from '../kit/builder';
import { TV_SPEC } from '../roomSpec';
import {
  clamp01,
  lerp,
  mix,
  mottled,
  outline,
  patch,
  segments,
  skin,
  slab,
  smooth,
  type Tone,
  tint,
  turned,
} from './form';
import type { Prop, PropSink } from './types';

/**
 * The CRT television set, facing -x on the cabinet top, around the glass (roomSpec.ts › TV_SPEC; docs/ROOM.md › TV
 * geometry contract), to the measurements of the set the room was first modelled with. Slate ABS in two mouldings: a
 * front shell whose face is crowned across and tucks under at the chin, with a steep lip down to the glass and a soft
 * shoulder into the sides, and behind a seam the rear cover, a tray with the tube's hood, the chassis' drum and the
 * neck's housing on it. It stands on a plinth with a bowed toe and four pads. On the chin: the power lamp's body, the
 * keys, the remote's window, the wordmark's badge and the front jacks in their well; in each side, the speakers'
 * louvres. The legends and the wordmark are a print (art.ts); the wordmark is the site's own, not a maker's.
 * It builds to the tier's detail (docs/ROOM.md › The generated room › The TV set).
 */

/** The set's middle across, and the plane its face is on there. */
const MIDDLE = -0.32;
const FRONT = 2.1542;
/** The front shell: half its width, its top, and its underside at the corners (the chin hangs lower between them). */
const HALF = 0.305;
const TOP = 1.0756;
const UNDER = 0.5328;
const SEAM = 2.3731;
const BASE_Y = 0.486;
const AXIS: Vec3 = [2.3, 0.8, MIDDLE];
/** The lip's opening at the glass (tv/tvModel.ts › TV_SCREEN_APERTURE over the glass's square). */
const APERTURE = { half: 0.2576, y0: 0.6371, y1: 1.034, radius: 0.007 };
/**
 * The lip: how far behind the face's plane its inner ring is (behind the glass's rim everywhere), how much wider than
 * the aperture it is where it meets the face, and the radius of that edge.
 */
const LIP = { depth: 0.0273, grow: 0.008, edge: 0.0016 };
/** The shoulder between the face and the sides: how far in from the outline it starts, and how deep it is. */
const SHOULDER = { inset: 0.02, depth: 0.017 };
/** The jacks' well in the chin: its middle, half the distance between its end jacks, its radius and its depth. */
const WELL = { across: 0.092, up: 0.5551, pitch: 0.0226, radius: 0.0117, depth: 0.009, reach: 0.047 };
/** The row the keys, the lamp and the remote's window are on. */
const KEYS = 0.5535;

const ABS: Rgb = [0.012, 0.012, 0.014];
const LIP_ABS: Rgb = [0.011, 0.011, 0.013];
const REAR: Rgb = [0.0105, 0.0105, 0.0122];
const RECESS: Rgb = [0.0055, 0.0055, 0.0065];
const KEY: Rgb = [0.015, 0.015, 0.018];
const RUBBER: Rgb = [0.006, 0.006, 0.0065];
const NICKEL: Rgb = [0.3, 0.29, 0.27];
const BRASS: Rgb = [0.5, 0.42, 0.25];

type Pair = readonly [number, number];
/** A point of the set: across from its middle (the viewer's right is +), up from the floor, back from the face's plane. */
const at = (across: number, up: number, back: number): Vec3 => [FRONT + back, up, MIDDLE + across];

/** The face is not flat: it is crowned across (5 mm back at its sides) and leans back under the keys. */
const crown = (across: number): number => Math.sqrt(1.6e-5 + (0.03 * across) ** 2) - 0.004;
const tuck = (up: number): number => 0.0025 * Math.min(1.2, Math.max(0, (0.61 - up) / 0.08)) ** 2;
const face = (across: number, up: number): number => crown(across) + tuck(up);
/** The chin's bottom edge hangs lowest at the middle: a smile, 16 mm deep. */
const smile = (across: number): number => 0.0157 * Math.max(0, 1 - (across / 0.275) ** 2) ** 1.3;

const plastic: Tone = (point) => mottled(ABS, point, 0.05, 0.13, 3);
const rearPlastic: Tone = (point) => mottled(REAR, point, 0.05, 0.16, 11);

/** Where a loop's straight sides are cut (the same places on every loop, so a skin's lines run straight). */
interface Cuts {
  readonly across: readonly number[];
  readonly up: readonly number[];
  readonly corner: number;
}
/** The face's cuts, and which of a loop's points the jacks' well lies between on its bottom side. */
interface FaceCuts extends Cuts {
  readonly well: readonly [from: number, to: number];
}

/**
 * A rounded rectangle about the set's middle as (across, up) pairs, counter-clockwise seen from the front, from its
 * bottom side's left end: its sides cut at `cuts`, its corners superellipse arcs of `extent` (power 2 is a circle's).
 * Two loops cut alike match point for point, whatever their sizes and corners.
 */
function loop(half: number, y0: number, y1: number, extent: number, power: number, cuts: Cuts): Pair[] {
  const points: Pair[] = [];
  const a = half - extent;
  const arc = (ca: number, cy: number, start: number): void => {
    for (let i = 1; i < cuts.corner; i++) {
      const angle = start + (i / cuts.corner) * (Math.PI / 2);
      const [c, s] = [Math.cos(angle), Math.sin(angle)];
      points.push([
        ca + Math.sign(c) * Math.abs(c) ** (2 / power) * extent,
        cy + Math.sign(s) * Math.abs(s) ** (2 / power) * extent,
      ]);
    }
  };
  const [across, up] = [cuts.across, cuts.up];
  points.push([-a, y0], ...across.map((z): Pair => [z, y0]), [a, y0]);
  arc(a, y0 + extent, -Math.PI / 2);
  points.push([half, y0 + extent], ...up.map((y): Pair => [half, y]), [half, y1 - extent]);
  arc(a, y1 - extent, 0);
  points.push([a, y1], ...[...across].reverse().map((z): Pair => [z, y1]), [-a, y1]);
  arc(-a, y1 - extent, Math.PI / 2);
  points.push([-half, y1 - extent], ...[...up].reverse().map((y): Pair => [-half, y]), [-half, y0 + extent]);
  arc(-a, y0 + extent, Math.PI);
  return points;
}

/** Joins two loops of any lengths that both go round `centre` counter-clockwise seen from the front: a collar. */
function collar(b: MeshBuilder, outer: Ring, inner: Ring, centre: Vec3, tone: Tone): void {
  const round = (ring: Ring): { point: Vec3; angle: number }[] => {
    const tagged = ring.map((point) => ({ point, angle: Math.atan2(point[1] - centre[1], point[2] - centre[2]) }));
    let first = 0;
    tagged.forEach((each, i) => {
      if (each.angle < (tagged[first] as { angle: number }).angle) first = i;
    });
    const turned = [...tagged.slice(first), ...tagged.slice(0, first)];
    const start = turned[0] as { point: Vec3; angle: number };
    return [...turned, { point: start.point, angle: start.angle + Math.PI * 2 }];
  };
  const [o, n] = [round(outer), round(inner)];
  const emit = (p: Vec3, q: Vec3, r: Vec3): void =>
    b.gradient(p, q, r, [tone(p, 0, 0), tone(q, 0, 0), tone(r, 0, 0)], [1, 1, 1]);
  let [i, j] = [0, 0];
  while (i + 1 < o.length || j + 1 < n.length) {
    const [oi, nj] = [o[i] as { point: Vec3 }, n[j] as { point: Vec3 }];
    const outerNext = o[i + 1];
    const innerNext = n[j + 1];
    if (outerNext && (!innerNext || outerNext.angle <= innerNext.angle)) {
      emit(oi.point, outerNext.point, nj.point);
      i++;
    } else if (innerNext) {
      emit(oi.point, innerNext.point, nj.point);
      j++;
    }
  }
}

export const tvSet: Prop = {
  name: 'tv-set',
  budget: 12000,
  build(sink) {
    const b = sink.mesh('tv');
    shell(sink, b);
    louvres(sink, b);
    chin(sink, b);
    plinth(sink, b);
    rear(sink, b);
  },
};

/** Where the chin's straight lines are cut: the well's block is whole columns of the face's skin. */
function cutsAt(detail: number): FaceCuts {
  const fine = detail >= 0.8;
  const [from, to] = [WELL.across - WELL.reach, WELL.across + WELL.reach];
  const across: number[] = [];
  const left = segments(8, detail, 4);
  for (let i = 0; i <= left; i++) across.push(lerp(-0.235, from, i / left));
  if (fine) across.push(WELL.across);
  const right = segments(3, detail, 1);
  for (let i = 0; i <= right; i++) across.push(lerp(to, 0.235, i / right));
  const rows = segments(10, detail, 5);
  const up = Array.from({ length: rows + 1 }, (_, i) => lerp(0.66, 1.01, i / rows));
  // A loop's bottom side starts with its own end, then these.
  const well = [1 + left, 1 + left + (fine ? 2 : 1)] as const;
  return { across, up, corner: segments(8, detail, 5), well };
}

/**
 * The front shell and the rear cover's tray, one skin: from the lip's inner ring behind the glass, up the lip, over its
 * edge onto the face, across the face and its shoulder, along the sides, round the rear edge into the seam's groove,
 * and over the tray's collar onto its back.
 */
function shell(sink: PropSink, b: MeshBuilder): void {
  const { detail } = sink;
  const fine = detail >= 0.8;
  const cuts = cutsAt(detail);
  const grown = (by: number): Pair[] =>
    loop(APERTURE.half + by, APERTURE.y0 - by, APERTURE.y1 + by, APERTURE.radius + by, 2, cuts);
  // The casing's outline `inset` from its full size, its bottom side hanging in the chin's smile.
  const cased = (inset: number): Pair[] =>
    loop(HALF - inset, UNDER + inset, TOP - inset, 0.06 - inset, 4.2, cuts).map(
      ([a, y]): Pair => [a, y - smile(a) * (1 - smooth(UNDER + inset, UNDER + inset + 0.07, y))],
    );

  const rings: Ring[] = [];
  const paints: ((point: Vec3) => Rgb)[] = [];
  const shades: number[] = [];
  const add = (
    pairs: readonly Pair[],
    back: (pair: Pair, index: number) => number,
    paint: (point: Vec3) => Rgb,
    shade = 1,
  ): number => {
    rings.push(pairs.map((pair, i) => at(pair[0], pair[1], back(pair, i))));
    paints.push(paint);
    shades.push(shade);
    return rings.length - 1;
  };
  const abs = (point: Vec3): Rgb => plastic(point, 0, 0);
  const lip = (point: Vec3): Rgb => mottled(LIP_ABS, point, 0.04, 0.13, 3);

  // The lip: its wall leans 18° from the tube's axis, and turns onto the face over a small radius.
  const inner = grown(LIP.grow + LIP.edge);
  const flat = inner.map(([a, y]) => face(a, y));
  const lean = (72 * Math.PI) / 180;
  const wall = { grow: LIP.grow + LIP.edge * (1 - Math.sin(lean)), back: LIP.edge * (1 - Math.cos(lean)) };
  add(grown(0), () => LIP.depth, lip, 0.55);
  if (fine) add(grown(wall.grow * 0.45), (_, i) => lerp(LIP.depth, (flat[i] as number) + wall.back, 0.45), lip, 0.72);
  add(grown(wall.grow), (_, i) => (flat[i] as number) + wall.back, lip, 0.88);
  const turns = segments(3, detail, 2);
  for (let j = 1; j <= turns; j++) {
    const angle = lean * (1 - j / turns);
    add(
      grown(LIP.grow + LIP.edge * (1 - Math.sin(angle))),
      (_, i) => (flat[i] as number) + LIP.edge * (1 - Math.cos(angle)),
      (point) => mix(lip(point), abs(point), j / turns),
      lerp(0.88, 1, j / turns),
    );
  }
  // The face, out to where its shoulder begins. The row half way down the chin is the well's block's top.
  const outer = cased(SHOULDER.inset);
  let blockTop = 0;
  for (const t of fine ? [0.25, 0.5, 0.75] : [0.5]) {
    const row = add(
      inner.map((p, i): Pair => [lerp(p[0], (outer[i] as Pair)[0], t), lerp(p[1], (outer[i] as Pair)[1], t)]),
      (p) => face(p[0], p[1]),
      abs,
    );
    if (t === 0.5) blockTop = row;
  }
  const faceOut = add(outer, (p) => face(p[0], p[1]), abs);
  // The shoulder: a quarter of an ellipse from the face round to the sides, a touch lighter where it turns (its
  // satin catches whatever light there is).
  const edge = outer.map(([a, y]) => face(a, y));
  const rounds = segments(4, detail, 3);
  for (let j = 1; j <= rounds; j++) {
    const angle = (j / rounds) * (Math.PI / 2);
    const sheen = 1 + 0.22 * Math.sin(angle * 2);
    add(
      cased(SHOULDER.inset * (1 - Math.sin(angle))),
      (_, i) => lerp(edge[i] as number, SHOULDER.depth, 1 - Math.cos(angle)),
      (point) => tint(abs(point), sheen),
    );
  }
  // The sides, the top and the underside, back to the rear edge and round it.
  const roll = 0.0037;
  const rearEdge = SEAM - FRONT - roll;
  const bands = segments(6, detail, 3);
  for (let j = 1; j <= bands; j++) add(cased(0), () => lerp(SHOULDER.depth, rearEdge, j / bands), abs);
  const rolls = 2;
  for (let j = 1; j <= rolls; j++) {
    const angle = (j / rolls) * (Math.PI / 2);
    add(cased(0.0032 * (1 - Math.cos(angle))), () => rearEdge + roll * Math.sin(angle), abs);
  }
  // The seam: a groove a millimetre wide between the two mouldings, then the rear cover's collar and its rounded
  // edge onto the tray's back.
  const dark = (point: Vec3): Rgb => tint(abs(point), 0.4);
  const rearTone = (point: Vec3): Rgb => rearPlastic(point, 0, 0);
  const groove = SEAM - FRONT;
  add(cased(0.0046), () => groove, dark, 0.35);
  add(cased(0.0046), () => groove + 0.0012, dark, 0.35);
  add(cased(0.003), () => groove + 0.0012, rearTone, 0.8);
  const collarEnd = 2.3809 - FRONT;
  add(cased(0.003), () => collarEnd, rearTone);
  const eases = 2;
  for (let j = 1; j <= eases; j++) {
    const angle = (j / eases) * (Math.PI / 2);
    add(cased(0.003 + 0.008 * (1 - Math.cos(angle))), () => collarEnd + 0.0079 * Math.sin(angle), rearTone);
  }
  // The tray's back, in towards its middle (most of it is behind the drum and the hood).
  const last = rings[rings.length - 1] as Ring;
  const hub: Vec3 = [(last[0] as Vec3)[0], 0.8, MIDDLE];
  for (const t of [fine ? 0.12 : 0.16, 1]) {
    rings.push(last.map((p): Vec3 => [p[0], lerp(p[1], hub[1], t), lerp(p[2], hub[2], t)]));
    paints.push(rearTone);
    shades.push(1);
  }

  const tone =
    (first: number): Tone =>
    (point, ring) =>
      (paints[first + ring] as (point: Vec3) => Rgb)(point);
  const shade =
    (first: number) =>
    (_: Vec3, ring: number): number =>
      shades[first + ring] as number;
  // The lip looks in at the picture and out at the room: towards a point in front of the glass's middle.
  skin(b, rings.slice(0, blockTop + 1), tone(0), {
    facing: { towards: [1.6, (APERTURE.y0 + APERTURE.y1) / 2, MIDDLE] },
    shade: shade(0),
  });
  // The chin's lower half, but for the columns the jacks' well is cut into.
  const [c0, c1] = cuts.well;
  const lower = rings.slice(blockTop, faceOut + 1);
  skin(
    b,
    lower.map((ring) => [...ring.slice(c1), ...ring.slice(0, c0 + 1)]),
    tone(blockTop),
    { facing: { along: [-1, 0, 0] }, closed: false, shade: shade(blockTop) },
  );
  skin(b, rings.slice(faceOut), tone(faceOut), { facing: { from: AXIS }, shade: shade(faceOut) });

  // The well: the block's rim, a collar in to the well's own, and down its wall to its floor.
  const block: Vec3[] = [];
  const [top, bottom] = [lower[0] as Ring, lower[lower.length - 1] as Ring];
  for (let i = c0; i <= c1; i++) block.push(bottom[i] as Vec3);
  for (let r = lower.length - 2; r >= 1; r--) block.push((lower[r] as Ring)[c1] as Vec3);
  for (let i = c1; i >= c0; i--) block.push(top[i] as Vec3);
  for (let r = 1; r <= lower.length - 2; r++) block.push((lower[r] as Ring)[c0] as Vec3);
  const half = segments(16, detail, 9);
  const rim = (radius: number, depth: number | null): Ring => {
    const points: Vec3[] = [];
    for (const side of [1, -1])
      for (let j = 0; j < half; j++) {
        const angle = (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (j / (half - 1)) * Math.PI;
        const [a, y] = [WELL.across + side * WELL.pitch + Math.cos(angle) * radius, WELL.up + Math.sin(angle) * radius];
        points.push(at(a, y, depth === null ? face(a, y) : depth));
      }
    return points;
  };
  const floor = face(WELL.across, WELL.up) + WELL.depth;
  const mouth = rim(WELL.radius + 0.0006, null);
  collar(b, block, mouth, at(WELL.across, WELL.up, 0), plastic);
  const walls = [
    mouth,
    rim(WELL.radius + 0.0002, face(WELL.across, WELL.up) + 0.0002),
    rim(WELL.radius, face(WELL.across, WELL.up) + 0.0008),
    rim(WELL.radius - 0.0005, floor),
    rim(WELL.radius * 0.45, floor),
    rim(0, floor),
  ];
  skin(b, walls, (point, ring) => (ring === 0 ? abs(point) : ring < 3 ? tint(abs(point), 0.8) : tint(RECESS, 1.2)), {
    facing: { along: [-1, 0, 0] },
    shade: (_, ring) => [1, 0.9, 0.75, 0.4, 0.5, 0.5][ring] as number,
  });
}

/**
 * The speakers' louvres, a field of fine slots moulded into each side near the front: each a dark slot over the
 * lighter lip it is cut above. On a phone, half as many and twice as tall.
 */
function louvres(sink: PropSink, b: MeshBuilder): void {
  const fine = sink.detail >= 0.8;
  const [x0, x1] = [FRONT + 0.034, FRONT + 0.098];
  const [low, high] = [0.672, 0.984];
  const count = fine ? 34 : 17;
  const pitch = (high - low) / count;
  const [slot, edge] = [pitch * 0.36, pitch * 0.1];
  for (const side of [-1, 1]) {
    const z = MIDDLE + side * (HALF + 0.00025);
    const strip = (y0: number, y1: number, color: Rgb, shade: number): void => {
      const corners: [Vec3, Vec3, Vec3, Vec3] = [
        [x0, y0, z],
        [x1, y0, z],
        [x1, y1, z],
        [x0, y1, z],
      ];
      const [p, q, r, t] = side > 0 ? corners : [corners[1], corners[0], corners[3], corners[2]];
      b.quad(p, q, r, t, color, shade);
    };
    for (let i = 0; i < count; i++) {
      const y = low + (i + 0.5) * pitch;
      strip(y - slot / 2, y + slot / 2, RECESS, 0.35);
      strip(y - slot / 2 - edge, y - slot / 2, tint(ABS, 1.3), 1);
    }
  }
}

/** What stands on the chin: the lamp's body, the keys, the remote's window, the badge, the jacks and the prints. */
function chin(sink: PropSink, b: MeshBuilder): void {
  const { detail } = sink;
  const fine = detail >= 0.8;
  const out: Vec3 = [-1, 0, 0];
  const up: Vec3 = [0, 1, 0];
  const key: Tone = (point) => mottled(KEY, point, 0.04, 0.02, 5);

  // POWER, then VOLUME - +, CHANNEL - +, ACTION, TV/VIDEO: round keys through the face, each in its own dark gap.
  const button = (across: number, radius: number, proud: number, dome: number, count: number): void => {
    const profile: [number, number][] = [
      [radius + 0.0011, 0.0001],
      [radius + 0.00015, 0.0001],
      [radius, 0.00035],
      [radius, proud - 0.0005],
      [radius - 0.0006, proud],
      ...(fine ? ([[radius * 0.55, proud + dome * 0.72]] as [number, number][]) : []),
      [0, proud + dome],
    ];
    turned(
      b,
      at(across, KEYS, face(across, KEYS)),
      out,
      up,
      profile,
      count,
      (point, ring) => (ring < 2 ? RECESS : key(point, 0, 0)),
      0,
      2,
      (_, ring) => (ring < 2 ? 0.4 : 1),
    );
  };
  button(-0.148, 0.0082, 0.0016, 0.0012, segments(20, detail, 12));
  for (const z of [-0.444, -0.43, -0.412, -0.398, -0.374, -0.358])
    button(z - MIDDLE, 0.005, 0.0013, 0.0005, segments(14, detail, 10));

  // The power lamp's own body, a 5 mm lamp through the face: PowerLed's lens is its lit tip (TV_SPEC.led).
  const lamp = { across: TV_SPEC.led[2] - MIDDLE, up: TV_SPEC.led[1] };
  const foot = face(lamp.across, lamp.up);
  const length = FRONT + foot - (TV_SPEC.led[0] + 0.0011);
  turned(
    b,
    at(lamp.across, lamp.up, foot),
    out,
    up,
    [
      [0.0042, 0.0001],
      [0.0028, 0.0001],
      [0.0027, 0.0004],
      [0.0027, length - 0.0012],
      [0.0021, length - 0.0003],
      [0.0011, length],
      [0, length],
    ],
    segments(12, detail, 6),
    (_, ring) => (ring < 2 ? RECESS : [0.05, 0.006, 0.005]),
    0,
    2,
    (_, ring) => (ring < 2 ? 0.4 : 1),
  );

  // The remote's window: smoked red plastic, flush in a fine gap.
  const pane = { a0: -0.014, a1: 0.044, y0: 0.5435, y1: 0.5635 };
  const sill = face(0.015, KEYS);
  const x = (back: number): number => FRONT + sill + back;
  slab(
    b,
    [x(-0.00015), pane.y0 - 0.0007, MIDDLE + pane.a0 - 0.0007],
    [x(0.001), pane.y1 + 0.0007, MIDDLE + pane.a1 + 0.0007],
    0,
    0.0031,
    () => RECESS,
    { ease: 0, open: 1, shade: () => 0.4 },
  );
  slab(
    b,
    [x(-0.0005), pane.y0, MIDDLE + pane.a0],
    [x(0.001), pane.y1, MIDDLE + pane.a1],
    0,
    0.0025,
    (point) => mottled([0.016, 0.0045, 0.006], point, 0.05, 0.02, 9),
    { ease: 0.0004, open: 1, cuts: [1, 1, fine ? 3 : 1] },
  );

  // The wordmark's badge, a low plate the print is on: with the lamp's tip, where the set's box ends (TV_SPEC).
  const badge = FRONT + face(0, 0.5975) - 0.0009;
  slab(
    b,
    [badge, 0.5908, MIDDLE - 0.031],
    [badge + 0.0016, 0.6042, MIDDLE + 0.031],
    0,
    0.0026,
    (point) => tint(plastic(point, 0, 0), 0.82),
    { ease: 0.0005, open: 1, cuts: [1, 1, fine ? 3 : 1] },
  );

  // The front jacks, video, left and right, standing on the well's floor to just under the face.
  const floor = face(WELL.across, WELL.up) + WELL.depth;
  const depth = WELL.depth;
  const jack = (across: number, color: Rgb): void => {
    const insulator = tint(color, 0.7);
    const sections: [number, number, Rgb, number][] = fine
      ? [
          [0.007, 0, color, 0.5],
          [0.007, depth - 0.0026, color, 0.9],
          [0.0064, depth - 0.002, color, 1],
          [0.005, depth - 0.002, color, 1],
          [0.0046, depth - 0.002, NICKEL, 0.9],
          [0.0046, depth - 0.0008, NICKEL, 1],
          [0.0042, depth - 0.0005, NICKEL, 1],
          [0.0035, depth - 0.0006, NICKEL, 1],
          [0.0034, depth - 0.0062, NICKEL, 0.3],
          [0.0017, depth - 0.0062, insulator, 0.3],
          [0.0017, depth - 0.002, BRASS, 0.7],
          [0.0012, depth - 0.0016, BRASS, 0.8],
          [0.0009, depth - 0.003, [0.02, 0.016, 0.01], 0.3],
          [0, depth - 0.003, [0.02, 0.016, 0.01], 0.3],
        ]
      : [
          [0.007, 0, color, 0.5],
          [0.0066, depth - 0.002, color, 1],
          [0.0048, depth - 0.002, color, 1],
          [0.0044, depth - 0.0006, NICKEL, 1],
          [0.0034, depth - 0.0006, NICKEL, 1],
          [0.0032, depth - 0.004, insulator, 0.3],
          [0, depth - 0.004, BRASS, 0.5],
        ];
    turned(
      b,
      at(across, WELL.up, floor),
      out,
      up,
      sections.map(([radius, height]): [number, number] => [radius, height]),
      segments(18, detail, 8),
      (_, ring) => (sections[ring] as [number, number, Rgb, number])[2],
      0,
      2,
      (_, ring) => (sections[ring] as [number, number, Rgb, number])[3],
    );
  };
  jack(WELL.across - WELL.pitch, [0.62, 0.42, 0.03]);
  jack(WELL.across, [0.55, 0.55, 0.55]);
  jack(WELL.across + WELL.pitch, [0.55, 0.035, 0.035]);

  // The prints, 0.30 m of the chin from z = -0.48, laid on the crowned face in strips cut between the words; the
  // wordmark's strip is on its badge.
  const [left, top, width, height] = ART.legends;
  const [low, high] = [0.5722, 0.6097];
  const edges = [-0.48, -0.421, -0.386, -0.351, -0.289, -0.18];
  for (let i = 0; i + 1 < edges.length; i++) {
    const [z0, z1] = [edges[i] as number, edges[i + 1] as number];
    const [p0, p1] = [Math.round(((z0 + 0.48) / 0.3) * width), Math.round(((z1 + 0.48) / 0.3) * width)];
    const onBadge = z0 < MIDDLE && z1 > MIDDLE;
    const lift = 0.0004;
    const corner = (z: number, y: number): Vec3 =>
      onBadge ? [badge - 0.0002, y, z] : at(z - MIDDLE, y, face(z - MIDDLE, y) - lift);
    const origin = corner(z0, low);
    const [right, above] = [corner(z1, low), corner(z0, high)];
    sink.decal({
      origin,
      u: [right[0] - origin[0], 0, z1 - z0],
      v: [above[0] - origin[0], high - low, 0],
      art: [left + p0, top, p1 - p0, height],
      tint: [0.36, 0.36, 0.4],
    });
  }
}

/** The plinth the set stands on: a block set back under the body, its toe bowed forward to the face, on four pads. */
function plinth(sink: PropSink, b: MeshBuilder): void {
  const { detail } = sink;
  const [x0, x1, half] = [2.188, 2.3895, 0.266];
  const [bottom, top] = [BASE_Y + 0.0018, 0.541];
  const tone: Tone = (point) => tint(plastic(point, 0, 0), 0.9);
  const counts = [segments(3, detail, 2), segments(4, detail, 2), segments(8, detail, 3)] as const;
  const hoop = (y: number, inset: number): Ring =>
    outline((x1 - x0) / 2 - inset, half - inset, 0.009, ...counts).map(
      ([p, q]): Vec3 => [(x0 + x1) / 2 + p, y, MIDDLE + q],
    );
  // In the body's shadow at its top, in the cabinet top's light at its foot.
  skin(b, [hoop(bottom, 0.0012), hoop(bottom + 0.0014, 0), hoop(0.512, 0), hoop(top, 0)], tone, {
    facing: { from: [2.29, 0.51, MIDDLE] },
    shade: (_, ring) => [0.85, 0.85, 0.6, 0.4][ring] as number,
  });
  // The toe: a low step in front of the block, bowed forward to the face's own plane at the middle.
  const reach = 0.21;
  const front = (across: number): number => 2.19 - 0.0355 * Math.max(0, 1 - (across / reach) ** 2) ** 1.5;
  const columns = segments(22, detail, 10);
  const profile = (across: number): Pair[] => {
    const f = front(across);
    return [
      [f + 0.0012, bottom],
      [f, bottom + 0.0016],
      [f, 0.4965],
      [f + 0.0012, 0.4996],
      [f + 0.004, 0.5012],
      [Math.max(f + 0.004, x0 + 0.001), 0.5046],
    ];
  };
  patch(
    b,
    columns,
    5,
    (u, v) => {
      const across = lerp(-reach, reach, u);
      const [x, y] = profile(across)[Math.round(v * 5)] as Pair;
      return [x, y, MIDDLE + across];
    },
    tone,
    { facing: { along: [-1, 0.3, 0] }, shade: (point) => (point[1] > 0.499 ? 0.55 : 0.85) },
  );
  // Four rubber pads: the plinth clears the cabinet top by two millimetres.
  for (const x of [x0 + 0.002, x1 - 0.03])
    for (const side of [-1, 1]) {
      const [near, far] = [side * (half - 0.05), side * (half - 0.002)];
      slab(
        b,
        [x, BASE_Y, MIDDLE + Math.min(near, far)],
        [x + 0.026, bottom + 0.0008, MIDDLE + Math.max(near, far)],
        1,
        0.004,
        () => RUBBER,
        { ease: 0, open: 1, shade: () => 0.6 },
      );
    }
}

/** The tube's hood on the tray: how high its ridge is, half its width and how square its section is, by depth. */
const HOOD: readonly (readonly [x: number, top: number, half: number, power: number])[] = [
  [2.3755, 1.0724, 0.235, 5],
  [2.3888, 1.0683, 0.228, 4.5],
  [2.405, 1.058, 0.205, 3.6],
  [2.42, 1.045, 0.185, 3],
  [2.435, 1.033, 0.17, 2.7],
  [2.45, 1.02, 0.155, 2.5],
  [2.465, 1.0034, 0.134, 2.3],
  [2.48, 0.985, 0.11, 2.2],
  [2.4925, 0.9643, 0.075, 2.1],
  [2.503, 0.945, 0.04, 2],
  [2.5095, 0.934, 0.004, 2],
];
const HOOD_FOOT = 0.885;

function hoodAt(x: number): readonly [top: number, half: number, power: number] {
  let i = 0;
  while (i + 2 < HOOD.length && ((HOOD[i + 1] as readonly number[])[0] as number) <= x) i++;
  const [p, q] = [HOOD[i] as readonly number[], HOOD[i + 1] as readonly number[]];
  const t = clamp01((x - (p[0] as number)) / ((q[0] as number) - (p[0] as number)));
  return [
    lerp(p[1] as number, q[1] as number, t),
    lerp(p[2] as number, q[2] as number, t),
    lerp(p[3] as number, q[3] as number, t),
  ];
}

/** The hood's surface over a point of the tray. */
function hoodUp(x: number, across: number): number {
  const [top, half, power] = hoodAt(x);
  return HOOD_FOOT + (top - HOOD_FOOT) * Math.max(0, 1 - Math.abs(across / half) ** power) ** (1 / power);
}

/**
 * The rear cover on its tray: the chassis' drum, round in plan, its roof rising to a ridge and its neck housing
 * standing furthest back; and the tube's hood sloping down onto it from the tray's top edge, with the cooling slots.
 * (The connectors are on the wall under the neck, which faces the room's wall 14 cm away: nothing sees them, so
 * nothing is built there.)
 */
function rear(sink: PropSink, b: MeshBuilder): void {
  const { detail } = sink;
  const fine = detail >= 0.8;
  const tone = rearPlastic;
  const start = 2.389;
  const width = (x: number): number =>
    x > 2.6512
      ? lerp(0.0544, 0.043, (x - 2.6511) / 0.0059)
      : 0.2615 * Math.sqrt(Math.max(0, 1 - ((Math.max(x, start) - start) / 0.268) ** 2));
  const counts = [segments(4, detail, 2), segments(8, detail, 3), segments(4, detail, 2)] as const;
  const hoop = (x: number): Ring => {
    const w = width(x);
    // The neck's housing rounds over at its back.
    const drop = x > 2.633 ? 0.024 - Math.sqrt(Math.max(0, 0.024 ** 2 - (x - 2.633) ** 2)) : 0;
    const shoulder = 0.902 - 0.1 * (x - start) - drop;
    const ridge = (x < 2.509 ? 0.934 : 0.934 - 0.363 * (x - 2.509)) - drop;
    // Under the neck the drum's wall steps up; the neck's underside slopes up from there to its back.
    const under =
      x < 2.506
        ? 0.534 + Math.max(0, x - 2.415) * 0.24
        : x < 2.52
          ? lerp(0.665, 0.676, (x - 2.507) / 0.013)
          : 0.676 + 0.497 * (x - 2.52);
    const [mid, half] = [(shoulder + under) / 2, (shoulder - under) / 2];
    return outline(w, half, Math.min(0.022, w * 0.5, half * 0.5), ...counts).map(
      ([a, c]): Vec3 => [
        x,
        mid + c + (c > 0 ? (ridge - shoulder) * Math.cos((Math.PI / 2) * clamp01(Math.abs(a) / w)) ** 2 : 0),
        MIDDLE + a,
      ],
    );
  };
  const stations = fine
    ? [2.387, 2.42, 2.45, 2.48, 2.5055, 2.507, 2.52, 2.55, 2.58, 2.605, 2.625, 2.64, 2.6511, 2.6555, 2.657]
    : [2.387, 2.45, 2.5055, 2.507, 2.52, 2.58, 2.625, 2.6511, 2.657];
  const drum = stations.map(hoop);
  const back = drum[drum.length - 1] as Ring;
  const centre: Vec3 = [2.657, 0.8, MIDDLE];
  skin(b, [...drum, back.map((p): Vec3 => [p[0], lerp(p[1], centre[1], 1), MIDDLE])], tone, {
    facing: { from: [2.5, 0.78, MIDDLE] },
  });

  // The hood, an arch from the tray's top edge down to the drum's ridge.
  const across = segments(22, detail, 10);
  const depths = HOOD.map((row) => row[0]).filter((_, i) => fine || i % 2 === 0);
  const arches = depths.map((x): Ring => {
    const [top, half, power] = hoodAt(x);
    return Array.from({ length: across + 1 }, (_, j): Vec3 => {
      const angle = Math.PI * (1 - j / across);
      const [c, s] = [Math.cos(angle), Math.sin(angle)];
      return [
        x,
        HOOD_FOOT + (top - HOOD_FOOT) * Math.abs(s) ** (2 / power),
        MIDDLE + Math.sign(c) * Math.abs(c) ** (2 / power) * half,
      ];
    });
  });
  skin(b, arches, tone, { facing: { from: [2.42, 0.85, MIDDLE] }, closed: false });
  // The cooling slots down the hood's slope.
  const slots = fine ? 21 : 11;
  const [from, to, reach] = [2.4, 2.447, 0.15];
  const slotHalf = fine ? 0.0021 : 0.0034;
  for (let i = 0; i < slots; i++) {
    const a = lerp(-reach, reach, i / (slots - 1));
    patch(
      b,
      1,
      fine ? 3 : 2,
      (u, v) => {
        const x = lerp(from, to, v);
        const z = a + (u - 0.5) * 2 * slotHalf;
        // Proud of the hood's skin by a hair, along the slope's own normal.
        return [x + 0.0005, hoodUp(x, z) + 0.0009, MIDDLE + z];
      },
      () => RECESS,
      { facing: { along: [0.5, 1, 0] }, shade: () => 0.3 },
    );
  }
}
