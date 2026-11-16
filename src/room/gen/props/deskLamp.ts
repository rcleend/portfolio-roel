import { basis, type MeshBuilder, normalize, place, type Rgb, type Ring, spline, sub, type Vec3 } from '../kit/builder';
import { circle, lerp, mottled, segments, skin, slab, type Tone, tint, turned } from './form';
import { DESK_TOP } from './monitor';
import type { PropSink } from './types';

/**
 * Stove enamel: navy on the shade and the arms, a grey hammer finish on the cast foot; bright zinc for springs, pins
 * and screws; the cable's rubber.
 */
const ENAMEL: Rgb = [0.036, 0.045, 0.082];
const CAST: Rgb = [0.21, 0.215, 0.235];
const ZINC: Rgb = [0.34, 0.34, 0.35];
const RUBBER: Rgb = [0.02, 0.02, 0.022];

/** The plane the arm swings in, and the points of its linkage in that plane (x, y). */
const Z = -2.035;
const FOOT: readonly [number, number] = [-2.045, DESK_TOP];
const POST: readonly [number, number] = [-2.097, 0.819];
const SHOULDER: readonly [number, number] = [-2.092, 0.872];
const ELBOW: readonly [number, number] = [-2.168, 1.088];
const WRIST: readonly [number, number] = [-1.992, 1.222];
/** The shade's axis (it hangs plumb) and the height of its mouth. */
const HEAD = -1.909;
const MOUTH = 1.12;

const enamel: Tone = (point) => mottled(ENAMEL, point, 0.1, 0.03, 41);
const cast: Tone = (point) => mottled(CAST, point, 0.09, 0.006, 44);
const zinc: Tone = (point) => mottled(ZINC, point, 0.12, 0.004, 42);

/**
 * The desk lamp, a spring-balanced arm lamp in black enamel (the shipped one's pose and measurements): a weighted
 * foot with a dished top, a post with its wing screw, two arms of paired bars on a shoulder, an elbow and a wrist,
 * four coil springs on cross pins, the flex looping over elbow and wrist, and a bell shade with a rolled rim, lit
 * inside, over its bulb.
 */
export function deskLamp(sink: PropSink): void {
  const b = sink.mesh('desk');
  const { detail } = sink;

  // The foot: a flange, the weight with a chamfered shoulder, and a dish sunk in its top.
  turned(
    b,
    [FOOT[0], FOOT[1], Z],
    [0, 1, 0],
    [1, 0, 0],
    [
      [0.0895, 0.0003],
      [0.0913, 0.0018],
      [0.0913, 0.0098],
      [0.0888, 0.0112],
      [0.0888, 0.0282],
      [0.0872, 0.0322],
      [0.0838, 0.034],
      [0.0502, 0.034],
      [0.0478, 0.0326],
      [0.0468, 0.0296],
      [0.044, 0.029],
      [0, 0.029],
    ],
    segments(36, detail, 14),
    (point, ring) => tint(cast(point, 0, 0), ring >= 8 ? 0.82 : ring === 7 ? 1.12 : 1),
    0,
    0,
    (_, ring) => (ring >= 9 ? 0.7 : 1),
  );
  // The post, off centre, and the wing screw that holds the arm's swivel.
  turned(
    b,
    [POST[0], POST[1] - 0.002, Z],
    [0, 1, 0],
    [1, 0, 0],
    [
      [0.0125, 0],
      [0.0125, 0.004],
      [0.01, 0.005],
      [0.01, 0.03],
    ],
    segments(16, detail, 8),
    cast,
  );
  turned(
    b,
    [POST[0] - 0.01, 0.8335, Z],
    [-1, 0, 0],
    [0, 1, 0],
    [
      [0.0022, 0],
      [0.0022, 0.008],
      [0.0045, 0.0085],
      [0.0045, 0.0112],
      [0, 0.0116],
    ],
    8,
    zinc,
  );
  b.box([POST[0] - 0.0212, 0.8265, Z - 0.0012], [POST[0] - 0.0185, 0.8405, Z + 0.0012], ZINC, 1);

  // The shoulder block the lower arm pivots on, the elbow's plates and the wrist's.
  slab(b, [SHOULDER[0] - 0.02, 0.846, Z - 0.0115], [SHOULDER[0] + 0.021, 0.884, Z + 0.0115], 2, 0.006, enamel, {
    corner: 2,
    ease: 0.002,
  });
  for (const side of [-1, 1]) {
    const z0 = Z + side * 0.0085;
    plate(b, hexagon(ELBOW, 0.023, 0.35), z0 - 0.0016, z0 + 0.0016, enamel);
    plate(
      b,
      [
        [WRIST[0] - 0.016, WRIST[1] + 0.012],
        [WRIST[0] - 0.02, WRIST[1] - 0.006],
        [WRIST[0] + 0.004, WRIST[1] - 0.024],
        [WRIST[0] + 0.02, WRIST[1] - 0.021],
        [WRIST[0] + 0.021, WRIST[1] - 0.004],
      ],
      z0 - 0.0016,
      z0 + 0.0016,
      enamel,
    );
  }
  // Each arm is a pair of bars, one over the other, between the plates.
  const pair = (from: readonly [number, number], to: readonly [number, number], start: number, end: number): void => {
    const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
    const length = Math.hypot(dx, dy);
    const [ux, uy] = [dx / length, dy / length];
    for (const offset of [-0.0072, 0.0072]) {
      const origin: Vec3 = [from[0] + ux * start - uy * offset, from[1] + uy * start + ux * offset, Z];
      b.placed(place(origin, 0, 0, Math.atan2(dy, dx)), () =>
        slab(b, [0, -0.0042, -0.0055], [length - start - end, 0.0042, 0.0055], 0, 0.0016, enamel, {
          corner: 1,
          cuts: [segments(5, detail, 2), 1, 1],
          ease: 0.0012,
        }),
      );
    }
  };
  pair(SHOULDER, ELBOW, -0.004, 0.002);
  pair(ELBOW, WRIST, 0.004, 0.002);

  // Pivot bolts through shoulder, elbow and wrist, and the springs on their cross pins.
  const bolt = (at: readonly [number, number], half: number, radius = 0.0048): void => {
    for (const side of [-1, 1])
      turned(
        b,
        [at[0], at[1], Z + side * half],
        [0, 0, side],
        [1, 0, 0],
        [
          [radius, 0],
          [radius, 0.0018],
          [radius * 0.6, 0.003],
          [0, 0.0031],
        ],
        segments(8, detail, 6),
        zinc,
      );
  };
  bolt(SHOULDER, 0.0115);
  bolt(ELBOW, 0.0101);
  bolt([WRIST[0] + 0.008, WRIST[1] - 0.011], 0.0101);
  const pin = (at: readonly [number, number]): void => {
    b.cylinder([at[0], at[1], Z - 0.0205], [at[0], at[1], Z + 0.0205], 0.002, 0.002, 6, tint(ZINC, 0.8), 1, false);
    bolt(at, 0.0205, 0.0034);
  };
  const springs: readonly (readonly [readonly [number, number], readonly [number, number]])[] = [
    [
      [-2.0635, 0.8905],
      [-2.118, 0.9655],
    ],
    [
      [-2.1425, 1.1035],
      [-2.079, 1.1335],
    ],
  ];
  for (const [from, to] of springs) {
    pin(from);
    pin(to);
    for (const side of [-1, 1]) coil(b, [from[0], from[1], Z + side * 0.016], [to[0], to[1], Z + side * 0.016], detail);
  }

  // The flex: out of the lower arm, over the elbow, and from the upper arm over the wrist into the shade's side.
  const flex = (points: readonly Vec3[]): void =>
    b.tube(spline(points, segments(4, detail, 2)), 0.0019, segments(5, detail, 4), RUBBER, 0.8);
  flex([
    [-2.181, 1.064, Z],
    [-2.196, 1.084, Z],
    [-2.19, 1.108, Z],
    [-2.171, 1.118, Z],
    [-2.152, 1.11, Z],
    [-2.141, 1.103, Z],
  ]);
  flex([
    [-2.018, 1.207, Z],
    [-2.012, 1.228, Z],
    [-2.002, 1.253, Z],
    [-1.984, 1.263, Z],
    [-1.964, 1.254, Z],
    [-1.948, 1.245, Z],
    [-1.94, 1.243, Z],
  ]);

  // The neck from the wrist to the shade, and its zinc collar.
  turned(
    b,
    [WRIST[0] + 0.016, WRIST[1] - 0.012, Z],
    [1, -0.06, 0],
    [0, 1, 0],
    [
      [0.0085, 0],
      [0.0085, 0.006],
      [0.0068, 0.0075],
      [0.0068, 0.027],
      [0.012, 0.0285],
      [0.012, 0.034],
    ],
    segments(12, detail, 8),
    (point, ring) => (ring < 2 ? zinc(point, 0, 0) : enamel(point, 0, 0)),
  );

  // The shade: a domed cap with vent holes, the lampholder's sleeve, the bell and its rolled rim; inside, white enamel.
  const head: Vec3 = [HEAD, MOUTH, Z];
  const lit: Rgb = [3.4, 2.5, 1.35];
  const outside: readonly (readonly [number, number])[] = [
    [0, 0.165],
    [0.0085, 0.1644],
    [0.017, 0.1618],
    [0.0245, 0.1568],
    [0.0302, 0.149],
    [0.033, 0.139],
    [0.033, 0.079],
    [0.0338, 0.074],
    [0.0372, 0.0675],
    [0.0492, 0.0468],
    [0.0612, 0.0215],
    [0.0682, 0.0042],
    [0.0705, 0.0002],
    [0.0717, -0.0012],
    [0.0707, -0.0026],
    [0.069, -0.0012],
  ];
  const inside: readonly (readonly [number, number])[] = [
    [0.069, -0.0012],
    [0.0672, 0.004],
    [0.06, 0.0215],
    [0.0485, 0.046],
    [0.0345, 0.069],
    [0.031, 0.079],
    [0, 0.079],
  ];
  const shadeSegments = segments(32, detail, 16);
  turned(b, head, [0, 1, 0], [1, 0, 0], outside, shadeSegments, (point, ring) =>
    tint(enamel(point, 0, 0), ring >= 12 ? 1.7 : 1),
  );
  // The inside's rings run from the rim up to the lampholder: lit white enamel, brightest round the bulb.
  const inner = inside.map(([radius, height]) =>
    circle([HEAD, MOUTH + height, Z], [0, 1, 0], [1, 0, 0], radius, shadeSegments),
  );
  skin(b, inner, (_, ring) => tint(lit, lerp(0.45, 1, ring / (inside.length - 1))), {
    facing: { towards: [HEAD, MOUTH + 0.03, Z] },
    shade: () => 3,
  });
  if (detail >= 0.8)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + 0.3;
      const hole: Vec3 = [HEAD + Math.cos(angle) * 0.011, MOUTH + 0.1642, Z + Math.sin(angle) * 0.011];
      b.cap(circle(hole, [0, 1, 0], [1, 0, 0], 0.0022, 6), [0, 1, 0], [0.004, 0.004, 0.005], 0.2);
    }
  // The bulb: glass too bright to be anything but light, on its cap.
  b.sphere([HEAD, MOUTH - 0.0015, Z], 0.0288, segments(16, detail, 10), [46, 33, 15], 3);
  b.cylinder(
    [HEAD, MOUTH + 0.018, Z],
    [HEAD, MOUTH + 0.06, Z],
    0.015,
    0.014,
    segments(12, detail, 8),
    [1.6, 1.3, 0.9],
    2,
    false,
  );
}

/** A regular hexagon about `centre`, turned by `turn` radians. */
function hexagon(centre: readonly [number, number], radius: number, turn: number): [number, number][] {
  return Array.from({ length: 6 }, (_, i): [number, number] => {
    const angle = turn + (i / 6) * Math.PI * 2;
    return [centre[0] + Math.cos(angle) * radius, centre[1] + Math.sin(angle) * radius];
  });
}

/** A flat plate in the arm's plane: an outline (x, y) between two depths, its rim eased. */
function plate(
  b: MeshBuilder,
  points: readonly (readonly [number, number])[],
  z0: number,
  z1: number,
  tone: Tone,
): void {
  b.extrude(points, z0, z1, tone([points[0]?.[0] ?? 0, points[0]?.[1] ?? 0, z0], 0, 0), { bevel: 0.0006, steps: 1 });
}

/**
 * A coil spring from `a` to `b`: a ribbon wound round a dark core, so the turns stand apart and each catches the
 * light. On a phone, a sleeve whose turns are only a change of tone.
 */
function coil(b: MeshBuilder, a: Vec3, c: Vec3, detail: number): void {
  const axis = normalize(sub(c, a));
  const [side, up] = basis(axis);
  const length = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  const radius = 0.0036;
  const dark = tint(ZINC, 0.12);
  if (detail < 0.8) {
    const bands = 10;
    for (let i = 0; i < bands; i++) {
      const [p, q] = [
        [
          a[0] + axis[0] * ((length * i) / bands),
          a[1] + axis[1] * ((length * i) / bands),
          a[2] + axis[2] * ((length * i) / bands),
        ] as Vec3,
        [
          a[0] + axis[0] * ((length * (i + 1)) / bands),
          a[1] + axis[1] * ((length * (i + 1)) / bands),
          a[2] + axis[2] * ((length * (i + 1)) / bands),
        ] as Vec3,
      ];
      b.cylinder(p, q, radius, radius, 6, i % 2 ? tint(ZINC, 0.45) : ZINC, 1, false);
    }
    return;
  }
  b.cylinder(a, c, radius * 0.62, radius * 0.62, 6, dark, 0.3, false);
  const turns = Math.round(length / 0.0036);
  const around = 7;
  const steps = turns * around;
  const wire = 0.0011;
  const edge = (shift: number): Ring =>
    Array.from({ length: steps + 1 }, (_, i): Vec3 => {
      const along = (i / steps) * (length - wire * 2) + wire + shift;
      const angle = (i / around) * Math.PI * 2;
      const [cos, sin] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
      return [
        a[0] + axis[0] * along + side[0] * cos + up[0] * sin,
        a[1] + axis[1] * along + side[1] * cos + up[1] * sin,
        a[2] + axis[2] * along + side[2] * cos + up[2] * sin,
      ];
    });
  // Wound so the ribbon's outside is what shows.
  const wound: Ring[] = [edge(-wire / 2), edge(wire / 2)];
  skin(b, wound, (point) => mottled(ZINC, point, 0.15, 0.002, 43), {
    facing: { from: [a[0] + axis[0] * wire, a[1] + axis[1] * wire, a[2] + axis[2] * wire] },
    closed: false,
  });
}
