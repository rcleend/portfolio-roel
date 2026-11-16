import { DESK_PRINTS } from '../deskArt';
import type { Facing, MeshBuilder, Rgb, Ring, Vec3 } from '../kit/builder';
import { eased, face, lerp, lid, mix, mottled, outline, segments, skin, srgb, type Tone, tint, turned } from './form';
import type { PropSink } from './types';

/** The desktop set's mouldings: aged ivory ABS, a warmer rear, a recess grey. */
export const IVORY: Rgb = srgb('d0c8b4');
export const REAR: Rgb = srgb('b6ac94');
export const RECESS: Rgb = srgb('777265');
export const RUBBER: Rgb = srgb('343732');

/** The desk's top, which the set stands on. */
export const DESK_TOP = 0.785;

/** A moulding's colour, a little uneven: slow blotches of age and a faint yellowing that wanders. */
export const aged = (color: Rgb, point: Vec3, seed = 0): Rgb => {
  const worn = mottled(color, point, 0.035, 0.06, seed);
  const yellow = mottled([1, 1, 1], point, 0.03, 0.17, seed + 9)[0];
  return [worn[0], worn[1] * (0.99 + 0.01 * yellow), worn[2] * (0.94 + 0.06 * yellow)];
};

/** The monitor's middle, the plane of its face, and the heights its bezel and its glass are centred on. */
const X = -1.34;
const FACE = -1.66;
const CENTRE = 1.063;
const GLASS = 1.071;

/** A point of the monitor: across from its middle, up from the floor, and back from its face. */
const at = (across: number, up: number, back: number): Vec3 => [X + across, up, FACE - back];

/**
 * The CRT monitor (the modelled room's measurements): a thick bezel plate with a
 * rounded rim and a deep eased recess down to the glass, a seam, the shell stepping in and tapering back to the tube's
 * neck, a louvred skirt under it on a tilt cradle and a swivel foot, and under the chin a shelf with six adjusters and
 * the power key. It faces +z; its glass is roomSpec.ts › PC_SPEC's (the aperture is 0.356 m × 0.284 m).
 */
export function monitor(sink: PropSink): void {
  const b = sink.mesh('desk');
  const { detail } = sink;
  const span = (p: readonly number[], q: readonly number[]): number =>
    Math.hypot((q[0] as number) - (p[0] as number), (q[3] as number) - (p[3] as number));
  /**
   * A skin over a run of sections. A section is half its width, half its height, its centre's height, how far back
   * it is, its corner radius, how dark it is and how much of the rear's warmer plastic it is. Edges are eased (`ease`
   * says into how many pieces, by section), and long faces cut into bands of `band` metres so the light baked at
   * their vertices can change across them.
   */
  const housing = (
    run: readonly number[][],
    counts: readonly [number, number, number],
    ease: (index: number) => number,
    band: number,
    facing: Facing,
    lidSteps = 0,
  ): void => {
    const rounded = eased(run, 0.0032, ease, span);
    const sections: number[][] = [];
    rounded.forEach((section, i) => {
      const next = rounded[i + 1];
      sections.push(section);
      if (!next) return;
      const pieces = Math.max(1, Math.round(span(section, next) / band));
      for (let k = 1; k < pieces; k++)
        sections.push(section.map((value, c) => lerp(value, next[c] as number, k / pieces)));
    });
    const rings = sections.map(
      (s): Ring =>
        outline(s[0] as number, s[1] as number, s[4] as number, ...counts).map(([a, c]) =>
          at(a, (s[2] as number) + c, s[3] as number),
        ),
    );
    const plastic: Tone = (point, ring) => {
      const s = sections[ring] as number[];
      return tint(aged(mix(IVORY, REAR, s[6] as number), point), s[5] as number);
    };
    // What a recess gathers of the room's ambient light: the mask and the seam see little of it.
    const sheltered = (_: Vec3, ring: number): number => 0.35 + 0.65 * ((sections[ring] as number[])[5] as number);
    skin(b, rings, plastic, { facing, shade: sheltered });
    if (lidSteps)
      lid(b, rings[rings.length - 1] as Ring, lidSteps, (point) => aged(REAR, point), { along: [0, 0, -1] });
  };
  // The bezel plate: from the glass's own rectangle, just in front of its rim, up the recess, over the face and its
  // rounded rim, along its side, and in behind it to the seam.
  housing(
    [
      [0.178, 0.142, GLASS, 0.0186, 0.012, 0.3, 0],
      [0.1812, 0.1452, GLASS, 0.0095, 0.0135, 0.62, 0],
      [0.184, 0.148, GLASS, 0.001, 0.015, 0.94, 0],
      [0.2265, 0.2015, CENTRE, 0, 0.0105, 1, 0],
      [0.23, 0.205, CENTRE, 0.0045, 0.012, 1, 0],
      [0.23, 0.205, CENTRE, 0.04, 0.012, 1, 0],
      [0.226, 0.201, CENTRE, 0.0403, 0.012, 0.3, 0.5],
    ],
    [segments(6, detail, 3), segments(12, detail, 4), segments(10, detail, 4)],
    (i) => (i >= 2 && i <= 4 ? segments(2, detail, 1) : 0),
    lerp(0.07, 0.03, detail),
    { along: [0, 0, 1] },
  );
  // The shell: out of the seam, a collar, a step in, the long taper to the tube's neck, and its back.
  housing(
    [
      [0.2275, 0.2025, CENTRE, 0.039, 0.012, 0.34, 1],
      [0.2275, 0.2025, CENTRE, 0.0422, 0.012, 0.34, 1],
      [0.2275, 0.2025, CENTRE, 0.0436, 0.012, 1, 1],
      [0.2275, 0.2025, CENTRE, 0.052, 0.012, 1, 1],
      [0.2175, 0.1925, CENTRE, 0.065, 0.012, 1, 1],
      [0.171, 0.1455, CENTRE + 0.009, 0.145, 0.012, 1, 1],
      [0.151, 0.1285, CENTRE - 0.001, 0.418, 0.012, 1, 1],
      [0.147, 0.1245, CENTRE - 0.001, 0.425, 0.01, 1, 1],
    ],
    [segments(4, detail, 2), segments(7, detail, 3), segments(6, detail, 3)],
    (i) => (i >= 3 && i <= 6 ? 1 : 0),
    lerp(0.1, 0.05, detail),
    { from: at(0, CENTRE, 0.2) },
    segments(3, detail, 2),
  );

  // The rear's cooling slits, and the two fine lines moulded across the face.
  const slits = Math.round(lerp(7, 14, detail));
  for (let i = 0; i < slits; i++) {
    const x = -0.102 + (i * 0.2015) / (slits - 1);
    b.box(at(x - 0.0015, 1.079, 0.4257), at(x + 0.0015, 1.137, 0.425), tint(RECESS, 0.5), 0.4, ['+z']);
  }
  for (const y of [1.247, 0.894]) {
    b.box(at(-0.2105, y - 0.0005, 0.0002), at(0.2105, y + 0.0005, -0.0003), tint(RECESS, 0.75), 0.6, ['-z']);
    b.box(at(-0.2105, y - 0.0011, 0.0002), at(0.2105, y - 0.0005, -0.0003), tint(IVORY, 1.12), 1, ['-z']);
  }
  // The badge, blank, on the chin.
  b.roundedBox(at(-0.006, 0.8785, 0.001), at(0.006, 0.8845, -0.0012), 0.001, tint(IVORY, 1.06), 1, 2, 2);

  skirt(b, detail);
  // The tilt cradle and the swivel foot it turns on.
  b.roundedBox(at(-0.1175, 0.811, 0.269), at(0.1175, 0.868, 0.091), 0.009, aged(REAR, at(0, 0.84, 0.18)), 0.8, 1, 3);
  const foot: Vec3 = at(0, DESK_TOP, 0.2);
  const footTone: Tone = (point, ring) =>
    ring < 2 ? RUBBER : point[1] > DESK_TOP + 0.0245 ? tint(RECESS, 0.9) : aged(IVORY, point, 3);
  turned(
    b,
    foot,
    [0, 1, 0],
    [1, 0, 0],
    [
      [0.1315, 0.0002],
      [0.1325, 0.0036],
      [0.1375, 0.0037],
      [0.139, 0.006],
      [0.139, 0.0205],
      [0.1365, 0.0235],
      [0.099, 0.0242],
      [0.099, 0.032],
      [0.09, 0.0325],
    ],
    segments(44, detail, 18),
    footTone,
    0.0016,
    1,
    (point) => (point[1] > DESK_TOP + 0.0245 ? 0.5 : 1),
  );

  // Under the chin: the control shelf, six adjusters, the power key and its lamp.
  b.roundedBox(at(-0.176, 0.848, 0.042), at(0.176, 0.862, 0.012), 0.003, tint(RECESS, 0.9), 0.6, 2, 2);
  const round = segments(14, detail, 8);
  for (const offset of [-0.145, -0.114, -0.083, -0.052, 0.064, 0.094]) {
    const key: Tone = (point) => aged(tint(IVORY, 1.03), point, 5);
    turned(
      b,
      at(offset, 0.8605, 0.0085),
      [0, 0, 1],
      [1, 0, 0],
      [
        [0.0083, 0],
        [0.0083, 0.0086],
        [0.0074, 0.0098],
        [0.004, 0.0103],
        [0, 0.0104],
      ],
      round,
      key,
      0.0007,
      1,
    );
  }
  b.roundedBox(
    at(0.128, 0.853, 0.004),
    at(0.154, 0.861, -0.0018),
    0.0016,
    aged(tint(IVORY, 1.03), at(0.14, 0.857, 0), 5),
    1,
    2,
    2,
  );
  // A fine dark line across the power key (its mark), and the lamp: a print, lit whatever the room's light.
  b.box(at(0.1395, 0.8548, -0.0018), at(0.1425, 0.8592, -0.002), tint(RECESS, 0.7), 1, ['-z']);
  sink.decal({
    origin: at(0.1735, 0.8595, -0.0004),
    u: [0.007, 0, 0],
    v: [0, 0.007, 0],
    art: DESK_PRINTS.lamp,
    tint: [0.4, 0.8, 0.36],
  });
}

/**
 * The cooling skirt under the shell: a block whose long sides are louvres, eighteen fins a side standing proud of a
 * dark inner wall between a top and a bottom rail. Its top follows the shell's underside and is sunk into it.
 */
function skirt(b: MeshBuilder, detail: number): void {
  const [x, y0, y1] = [0.1605, 0.8675, 0.9225];
  const [front, back] = [0.075, 0.393];
  const [low, high] = [0.8765, 0.9195];
  const inner = x - 0.0026;
  const body: Tone = (point) => aged(REAR, point, 2);
  const dark = tint(RECESS, 0.42);
  // The shell's underside rises towards the back; the block's top is sunk two millimetres into it all the way.
  const top = (depth: number): number => lerp(0.9285, 0.936, (depth - 0.145) / 0.248);
  const cuts = Math.max(3, Math.round(lerp(4, 8, detail)));
  const fins = detail >= 0.8 ? 18 : 9;
  const post = 0.004;
  const pitch = (back - front - post * 2) / fins;
  const gap = detail >= 0.8 ? 0.0024 : 0.0038;
  for (const side of [-1, 1]) {
    const out: Vec3 = [side, 0, 0];
    const [a, c] = side < 0 ? [-x, -inner] : [inner, x];
    // The louvres' dark inner wall, and over it the block's own side, up into the shell.
    face(
      b,
      [
        at(side * inner, y0, front),
        at(side * inner, y0, back),
        at(side * inner, y1, back),
        at(side * inner, y1, front),
      ],
      out,
      dark,
      cuts,
      1,
      0.45,
    );
    face(
      b,
      [
        at(side * inner, y1, front),
        at(side * inner, y1, back),
        at(side * inner, top(back), back),
        at(side * inner, top(front), front),
      ],
      out,
      body,
      cuts,
      1,
    );
    // The rails, the end posts, and the fins between them: on a phone, half as many and twice as wide.
    b.beam(at(a, y0, back), at(c, low, front), aged(REAR, at(side * x, y0, 0.2), 2), 0.9, 0.08);
    b.beam(at(a, high, back), at(c, y1, front), aged(REAR, at(side * x, y1, 0.2), 2), 0.9, 0.08);
    b.box(at(a, low, front + post), at(c, high, front), aged(REAR, at(side * x, 0.9, front), 2), 1, ['+y', '-y']);
    b.box(at(a, low, back), at(c, high, back - post), aged(REAR, at(side * x, 0.9, back), 2), 1, ['+y', '-y']);
    for (let i = 0; i < fins; i++) {
      const d0 = front + post + i * pitch + gap / 2;
      const d1 = d0 + pitch - gap;
      b.box(at(a, low, d1), at(c, high, d0), aged(REAR, at(side * x, 0.9, d0), 2), 1, [
        side < 0 ? '+x' : '-x',
        '+y',
        '-y',
      ]);
    }
  }
  // Its ends, its underside, and its top where it stands out from under the shell.
  face(
    b,
    [at(-inner, y0, front), at(inner, y0, front), at(inner, top(front), front), at(-inner, top(front), front)],
    [0, 0, 1],
    body,
    4,
    1,
    0.8,
  );
  face(
    b,
    [at(-inner, y0, back), at(inner, y0, back), at(inner, top(back), back), at(-inner, top(back), back)],
    [0, 0, -1],
    body,
    4,
    1,
    0.8,
  );
  face(
    b,
    [at(-inner, y0, front), at(inner, y0, front), at(inner, y0, back), at(-inner, y0, back)],
    [0, -1, 0],
    body,
    2,
    cuts,
    0.6,
  );
  face(
    b,
    [
      at(-inner, top(front), front),
      at(inner, top(front), front),
      at(inner, top(back), back),
      at(-inner, top(back), back),
    ],
    [0, 1, 0],
    body,
    2,
    cuts,
  );
}
