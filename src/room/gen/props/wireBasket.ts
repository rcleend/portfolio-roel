import { type MeshBuilder, type Rgb, type Ring, sub, type Vec3 } from '../kit/builder';
import { circle, lerp3, mix, mottled, segments, skin, smooth, type Tone, turned } from './form';
import { FLOOR } from './types';

/** The basket's enamel, and the paler steel where a rim's paint has rubbed thin. */
const WIRE: Rgb = [0.13, 0.165, 0.25];
const WORN: Rgb = [0.25, 0.28, 0.36];

/** Its wall: twenty-four wires leaning out from the pan to the rim, 26 cm across at the boards and 32 cm at the top. */
const WIRES = 24;
const TOP = 0.3435;
const lean = (y: number): number => 0.13 + (y - 0.0234) * 0.0937;
/** Half the gauge of the wires and hoops (5.6 mm), and of the heavier rim. */
const GAUGE = 0.0028;
const RIM = 0.0042;
/** The hoops round the wires: their heights, how far each hangs out of level, and where its ends were butted. */
const HOOPS: readonly (readonly [number, number, number])[] = [
  [0.0935, 0.0011, 2.2],
  [0.1935, -0.0012, 4.1],
  [0.3035, 0.0009, 0.7],
];

const TAU = Math.PI * 2;
/** The sections of a butt weld: how far each stands from its middle (in reaches), and how far the wire swells there. */
const WELD: readonly (readonly [number, number])[] = [
  [-1, 1.04],
  [-0.45, 1.2],
  [0, 1.26],
  [0.45, 1.2],
  [1, 1.04],
];

/**
 * The wire wastepaper basket (the modelled room's measure: 24 wires, three hoops, a rim, a solid base): a pressed
 * steel pan with a rolled lip standing on the boards, the wires welded round its outside and cut off just clear of the
 * floor, three hoops welded round the wires, and a heavier rim the wires' ends are welded inside. It has been kicked:
 * the rim is a little out of round, and no hoop hangs quite level. All of it one dark blue enamel.
 */
export function wireBasket(b: MeshBuilder, centre: Vec3, detail: number): void {
  const fine = detail >= 0.8;
  // Round wire needs ten sides to shade smooth (the builder creases at 38°); further off it is a square on its edge.
  const sides = fine ? 10 : detail >= 0.55 ? 6 : 4;
  const turn = 0.11;
  /** How far out of round the wall is at a height: the pan holds its foot true, the rim has given. */
  const oval = (angle: number, y: number): number => 1 + 0.012 * (y / TOP) * Math.cos(2 * (angle - 0.6));
  /** A point `out` metres outside the wires' own line, at an angle round the basket and a height over the room. */
  const wall = (angle: number, y: number, out = 0): Vec3 => {
    const r = lean(y) * oval(angle, y) + out;
    return [centre[0] + Math.cos(angle) * r, y, centre[2] + Math.sin(angle) * r];
  };
  const radial = (angle: number): Vec3 => [Math.cos(angle), 0, Math.sin(angle)];
  const tangent = (angle: number): Vec3 => [-Math.sin(angle), 0, Math.cos(angle)];
  /** Less of the room's light reaches down inside the wires. */
  const sunk = (point: Vec3): number => 0.72 + 0.28 * smooth(0.02, 0.2, point[1]);
  const paint: Tone = (point) => mottled(WIRE, point, 0.08, 0.035, 91);

  // The pan: its wall follows the wires' lean, its lip is rolled inwards, its floor lies under the lowest sheet.
  const round = fine ? 36 : segments(48, detail, 24);
  const pan: [number, number][] = fine
    ? [
        [0.1242, FLOOR],
        [0.1262, FLOOR + 0.0026],
        [0.1281, 0.0282],
        [0.1279, 0.0304],
        [0.1265, 0.0319],
        [0.1246, 0.0316],
        [0.1235, 0.0299],
        [0.1238, 0.0274],
        [0.1232, 0.0215],
        [0.1195, 0.0183],
        [0, 0.018],
      ]
    : [
        [0.1255, FLOOR],
        [0.1281, 0.0288],
        [0.1262, 0.0316],
        [0.1236, 0.029],
        [0.1232, 0.0205],
        [0, 0.018],
      ];
  turned(
    b,
    [centre[0], 0, centre[2]],
    [0, 1, 0],
    [1, 0, 0],
    pan,
    round,
    (point) => {
      const out = Math.hypot(point[0] - centre[0], point[2] - centre[2]);
      // Paint wears first on the lip's crown.
      const crown = smooth(0.0296, 0.0316, point[1]) * 0.35;
      return mix(mottled(WIRE, point, 0.08, 0.05, 92), WORN, out > 0.124 ? crown : 0);
    },
    0,
    2,
    (point) => {
      const out = Math.hypot(point[0] - centre[0], point[2] - centre[2]);
      // Inside the lip it is a well, darkest in the middle under the paper.
      return out < 0.124 && point[1] < 0.028 ? 0.3 + 0.25 * smooth(0.05, 0.123, out) : 0.9;
    },
  );

  // The wires: each a straight run from just over the boards to the rim, its cut end tucked in under the rim's widest.
  const foot = FLOOR + 0.003;
  const head = TOP - 0.0006;
  // Cut once between two hoops, so the light baked at its vertices can change up the wire.
  const cuts = fine ? [0, 0.42, 1] : [0, 1];
  for (let i = 0; i < WIRES; i++) {
    const angle = turn + (i / WIRES) * Math.PI * 2;
    const [low, high] = [wall(angle, foot), wall(angle, head)];
    const axis = sub(high, low);
    const rings = cuts.map((t): Ring => circle(lerp3(low, high, t), axis, radial(angle), GAUGE, sides));
    skin(b, rings, paint, { facing: { from: lerp3(low, high, (cuts[1] as number) / 2) }, shade: sunk });
    b.cap(rings[rings.length - 1] as Ring, axis, mix(WIRE, WORN, 0.5), 1);
  }

  /**
   * A ring of wire round the basket, `out` outside the wires' line: its height wanders by `tilt` as it goes round, and
   * at `phase` its two ends are butted and welded, a low swelling the grinder left.
   */
  const hoop = (y: number, tilt: number, phase: number, out: number, gauge: number, count: number, worn: number) => {
    const at = (angle: number): Vec3 => wall(angle, y + tilt * Math.cos(angle - phase), out);
    /** An angle as it falls round the hoop from `turn`, 0–2π. */
    const round = (angle: number): number => (((angle - turn) % TAU) + TAU) % TAU;
    const reach = 0.04;
    let stations: (readonly [number, number])[] = Array.from({ length: count }, (_, k) => [(k / count) * TAU, 1]);
    if (fine) {
      // The weld has sections of its own; the hoop's nearest ones make way for them.
      const from = round(phase);
      const apart = (angle: number): number => Math.abs(((angle - from + TAU * 1.5) % TAU) - Math.PI);
      stations = [
        ...stations.filter(([angle]) => apart(angle) > reach * 1.6),
        ...WELD.map(([along, swell]) => [round(phase + along * reach), swell] as const),
      ].sort((p, q) => p[0] - q[0]);
    }
    const rings = stations.map(
      ([angle, swell]): Ring =>
        circle(at(turn + angle), tangent(turn + angle), radial(turn + angle), gauge * swell, sides),
    );
    rings.push(rings[0] as Ring);
    const between = ((stations[0] as readonly [number, number])[0] + (stations[1] as readonly [number, number])[0]) / 2;
    skin(
      b,
      rings,
      (point, _, index) => {
        // The side of the wire that faces up is the side hands and paper rub.
        const up = Math.max(0, Math.sin((index / sides) * Math.PI * 2));
        return mix(paint(point, 0, 0), WORN, worn * up * up);
      },
      { facing: { from: at(turn + between) }, shade: sunk },
    );
  };
  // The hoops lie against the wires' outside, sunk a millimetre into them where they are welded.
  for (const [y, tilt, phase] of HOOPS)
    hoop(y, tilt, phase, 2 * GAUGE - 0.0012, GAUGE, fine ? 32 : segments(40, detail, 20), 0.12);
  // The rim, outside the wires' ends and over them.
  hoop(TOP, 0.0008, 5.3, 0.003, RIM, fine ? 40 : segments(48, detail, 24), 0.42);
}
