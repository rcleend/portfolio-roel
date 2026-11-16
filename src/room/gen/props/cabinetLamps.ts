import {
  add,
  basis,
  dot,
  length,
  type MeshBuilder,
  normalize,
  place,
  type Rgb,
  type Ring,
  scale,
  spline,
  sub,
  type Vec3,
} from '../kit/builder';
import { BULB_SPEC as BULB, TV_LAMP_SPEC as TV_LAMP } from '../roomSpec';
import { circle, lid, mottled, noise3, segments, skin, smooth, type Tone, tint, turned } from './form';
import { FLOOR, type Prop } from './types';

/**
 * The opal desk lamp on the cabinet's right-hand end: a round metal foot and the globe, which is light (its mesh is
 * drawn as an emitter, and the bake renders its light from the globe's centre).
 */
export const opalLamp: Prop = {
  name: 'opal-lamp',
  budget: 1900,
  build(sink) {
    const [x, , z] = TV_LAMP.center;
    const metal: Rgb = [0.05, 0.05, 0.055];
    sink.mesh('props').lathe(
      [x, 0.486, z],
      [0, 1, 0],
      [
        [0.064, 0],
        [0.064, 0.01],
        [0.052, 0.026],
        [0.034, 0.034],
        [0.03, 0.045],
        [0, 0.045],
      ],
      32,
      metal,
    );
    sink.mesh('globe').sphere(TV_LAMP.center, TV_LAMP.radius, 40, [1, 1, 1]);
  },
};

/** The supports' nickel wire and the bulb's nickel cap; cast concrete, the socket's matte black powder coat. */
const WIRE: Rgb = [0.3, 0.27, 0.22];
const NICKEL: Rgb = [0.2, 0.2, 0.2];
const CONCRETE: Rgb = [0.27, 0.262, 0.25];
const POWDER: Rgb = [0.022, 0.022, 0.025];
/** The flex's grey cloth, the switch's pale grey body and the dark mark on its rocker. */
const FLEX: Rgb = [0.085, 0.085, 0.09];
const SWITCH: Rgb = [0.27, 0.265, 0.255];
const MARK: Rgb = [0.05, 0.05, 0.05];
/** Where the flex leaves the base: how far from the lamp's axis, and how high over the cabinet top. */
const EXIT: readonly [number, number] = [0.0422, 0.0085];

/**
 * The glass as light added to the frame (GeneratedRoom draws the `bulb` mesh as a film, like the lava lamp's bottle):
 * clear glass shows only what it reflects. Its own faint sheen, the filament's glow in it, what its limbs gather
 * towards the room, and the window's glint on its shoulder.
 */
const FILM: Rgb = [0.005, 0.005, 0.0065];
const FILM_GLOW: Rgb = [0.05, 0.021, 0.006];
const FILM_LIMB: Rgb = [0.07, 0.048, 0.028];
const FILM_GLINT: Rgb = [0.1, 0.13, 0.18];
/** From the lamp towards the eye in the TV view, and towards the window. */
const TO_EYE: Vec3 = normalize([-0.91, 0.1, 0.39]);
const TO_WINDOW: Vec3 = normalize([-0.92, 0.27, -0.37]);

/** Where the glass leaves its cap, as a height over the cabinet top, and the flex's radius (metres). */
const SEAL = 0.108;
const FLEX_RADIUS = 0.0026;

/**
 * The bare-bulb lamp on the cabinet's left-hand end, dimmed, forward of the set's flank so the room's overview sees it
 * past the set: a lamp of today, a cast concrete cylinder with a smooth matte black socket (`lampBase`), and in it a
 * clear pear-shaped bulb whose filament is a cage: a zigzag strung up and down between the hooks of two glass buttons
 * on the stem, the old carbon-lamp winding the decorative bulbs sold now copy. A grey cloth flex leaves the base's
 * back, lies across the top through a small inline switch and drops behind the cabinet.
 *
 * The filament is light (the `filament` mesh, drawn as an emitter where the bake puts the lamp's light); the glass,
 * its stem and buttons are a film of light (the `bulb` mesh); everything else is baked with the room.
 */
export const bulbLamp: Prop = {
  name: 'bulb-lamp',
  budget: 5400,
  build(sink) {
    const b = sink.mesh('props');
    const { detail } = sink;
    const fine = detail >= 0.8;
    const o = BULB.origin;
    const up: Vec3 = [0, 1, 0];
    const side: Vec3 = [1, 0, 0];
    const at = (x: number, y: number, z: number): Vec3 => [o[0] + x, o[1] + y, o[2] + z];
    lampBase(b, detail);
    // The bulb's cap, a finger of it standing out of the socket: plain nickel, and the rim the glass is cemented in.
    turned(
      b,
      o,
      up,
      side,
      [
        [0.0133, 0.0975],
        [0.0133, 0.1062],
        [0.0128, SEAL],
        [0.0085, SEAL],
      ],
      segments(16, detail, 10),
      (point, ring) => (ring >= 2 ? ([0.03, 0.027, 0.024] as Rgb) : mottled(NICKEL, point, 0.1, 0.006, 61)),
      0,
      2,
      (_, ring) => (ring >= 2 ? 0.5 : 1),
    );

    // The glass. Its ball is a sphere about a point a little over the cage's middle; the neck flares out of the cap
    // into it. (radius, height) rows, from the seal to the crown.
    const middle = BULB.filament[1] - o[1];
    const [ball, radius, neck] = [middle + 0.002, 0.0335, 0.0126];
    const join = 1.95;
    const [joinR, joinY] = [radius * Math.sin(join), ball + radius * Math.cos(join)];
    const neckRows = segments(8, detail, 5);
    const ballRows = segments(12, detail, 7);
    const glass: (readonly [number, number])[] = [];
    for (let i = 0; i < neckRows; i++) {
      const t = i / neckRows;
      // A cubic from the seal, where the glass stands straight up, to the ball, which it meets along its tangent.
      const [h00, h10, h01, h11] = [
        2 * t ** 3 - 3 * t ** 2 + 1,
        t ** 3 - 2 * t ** 2 + t,
        -2 * t ** 3 + 3 * t ** 2,
        t ** 3 - t ** 2,
      ];
      const reach = 0.062;
      glass.push([
        h00 * neck + h10 * 0.004 * reach + h01 * joinR + h11 * -Math.cos(join) * reach,
        h00 * SEAL + h10 * reach + h01 * joinY + h11 * Math.sin(join) * reach,
      ]);
    }
    for (let i = 0; i <= ballRows; i++) {
      const angle = join * (1 - i / ballRows);
      glass.push([radius * Math.sin(angle), ball + radius * Math.cos(angle)]);
    }
    const film = sink.mesh('bulb');
    const sides = segments(24, detail, 12);
    const rings = glass.map(([r, y]) => circle(at(0, y, 0), up, side, r, sides));
    /** The glass's outward normal at a ring and a point round it. */
    const outward = (ring: number, point: Vec3): Vec3 => {
      const [r0, y0] = glass[Math.max(0, ring - 1)] as readonly [number, number];
      const [r1, y1] = glass[Math.min(glass.length - 1, ring + 1)] as readonly [number, number];
      const radial = normalize([point[0] - o[0], 0, point[2] - o[2]]);
      const flat = length([point[0] - o[0], 0, point[2] - o[2]]) < 1e-6;
      return flat ? up : normalize([radial[0] * (y1 - y0), -(r1 - r0), radial[2] * (y1 - y0)]);
    };
    const mirrored = normalize(add(TO_EYE, TO_WINDOW));
    skin(
      film,
      rings,
      (point, ring) => {
        const n = outward(ring, point);
        const y = point[1] - o[1];
        // The filament's glow in the glass, strongest round the cage; nothing of it down the neck.
        const glow = Math.exp(-(((y - middle) / 0.03) ** 2));
        // What the glass gathers at its limbs as the room's eye sees it; from anywhere else, a streak up its side.
        const limb = (1 - Math.abs(dot(n, TO_EYE))) ** 3;
        const glint = Math.max(0, dot(n, mirrored)) ** 160;
        // The neck is thicker glass over the cement: a little brighter there.
        const thick = 1 + 1.5 * smooth(SEAL + 0.022, SEAL, y);
        return [
          FILM[0] * thick + FILM_GLOW[0] * glow + FILM_LIMB[0] * limb + FILM_GLINT[0] * glint,
          FILM[1] * thick + FILM_GLOW[1] * glow + FILM_LIMB[1] * limb + FILM_GLINT[1] * glint,
          FILM[2] * thick + FILM_GLOW[2] * glow + FILM_LIMB[2] * limb + FILM_GLINT[2] * glint,
        ];
      },
      { facing: { from: at(0, SEAL + 0.004, 0) } },
    );

    // Inside it: the stem, a glass tube pinched shut over the lead wires, the rod that rises from the pinch, and the
    // two buttons the supports are set in. Glass in the filament's light, so film as well.
    const cage = { low: middle - 0.018, high: middle + 0.018, lowRadius: 0.0125, highRadius: 0.0112 };
    const stemTone: Tone = (point) => {
      const lit = 0.12 + 0.88 * smooth(SEAL + 0.012, cage.low - 0.004, point[1] - o[1]);
      return [0.05 * lit, 0.026 * lit, 0.009 * lit];
    };
    turned(
      film,
      o,
      up,
      side,
      [
        [0.0074, SEAL + 0.0005],
        [0.0068, SEAL + 0.008],
        [0.0048, SEAL + 0.024],
        [0.0036, SEAL + 0.034],
        [0.003, SEAL + 0.038],
        [0.0017, SEAL + 0.041],
        [0.0016, cage.low - 0.0024],
        [0.0033, cage.low - 0.0012],
        [0.0036, cage.low],
        [0.0033, cage.low + 0.0012],
        [0.0015, cage.low + 0.0024],
        [0.0014, cage.high - 0.0022],
        [0.0031, cage.high - 0.001],
        [0.0034, cage.high],
        [0.003, cage.high + 0.0012],
        [0, cage.high + 0.002],
      ],
      segments(8, detail, 6),
      stemTone,
    );

    // The cage: five hooks below, four above between them, the filament strung up and down from one to the next. The
    // gap in it faces the wall, where the two lead wires come up from the pinch.
    const hook = (index: number, upper: boolean): Vec3 => {
      const angle = ((upper ? 72 : 36) + index * 72) * (Math.PI / 180);
      const r = upper ? cage.highRadius : cage.lowRadius;
      return at(Math.cos(angle) * r, upper ? cage.high : cage.low, Math.sin(angle) * r);
    };
    const filament: Vec3[] = [];
    for (let i = 0; i < 5; i++) {
      filament.push(hook(i, false));
      if (i < 4) filament.push(hook(i, true));
    }
    const strand = fine ? 0.0005 : 0.00062;
    sink.mesh('filament').tube(filament, strand, fine ? 4 : 3, [1, 1, 1], 1);
    const wire = fine ? 0.00036 : 0.00045;
    // The supports: a spoke from its button out to each hook the leads do not hold, bent up into an eye at its end.
    for (let i = 0; i < 4; i++) {
      const tip = hook(i, true);
      b.tube(
        [at(0, cage.high, 0), [tip[0], tip[1] - 0.0008, tip[2]], [tip[0], tip[1] + 0.0009, tip[2]]],
        wire,
        3,
        WIRE,
        1,
        false,
      );
    }
    for (let i = 1; i < 4; i++) {
      const tip = hook(i, false);
      b.tube(
        [at(0, cage.low, 0), [tip[0], tip[1] + 0.0008, tip[2]], [tip[0], tip[1] - 0.0009, tip[2]]],
        wire,
        3,
        WIRE,
        1,
        false,
      );
    }
    // The leads: out of the pinch, up past the lower button and out to the filament's two ends.
    for (const index of [0, 4]) {
      const tip = hook(index, false);
      const across = index === 0 ? 1 : -1;
      b.tube(
        spline(
          [
            at(0.0004, SEAL + 0.036, across * 0.0022),
            at(0.0012, SEAL + 0.043, across * 0.0034),
            [o[0] + (tip[0] - o[0]) * 0.45, tip[1] - 0.0075, o[2] + (tip[2] - o[2]) * 0.5],
            [o[0] + (tip[0] - o[0]) * 0.9, tip[1] - 0.0028, o[2] + (tip[2] - o[2]) * 0.92],
            tip,
          ],
          fine ? 4 : 2,
        ),
        wire * 1.25,
        3,
        WIRE,
        1,
        false,
      );
    }

    flexAndSwitch(b, detail);
  },
};

/**
 * The lamp's base, of today: a cast concrete cylinder, 84 mm across and 62 high, on a cork pad, its top edge eased and
 * its top dished a little towards a smooth matte black socket the bulb's cap sinks into, up to 103 mm over the cabinet
 * top (the glass leaves its cap at `SEAL`). Concrete is its grain: on the top tier the drum is cut fine enough to
 * carry it, a speck a vertex.
 */
function lampBase(b: MeshBuilder, detail: number): void {
  const o = BULB.origin;
  const up: Vec3 = [0, 1, 0];
  const side: Vec3 = [1, 0, 0];
  const fine = detail >= 0.8;
  const around = segments(36, detail, 16);
  const drum = fine ? 48 : around;
  const courses = fine ? 11 : segments(8, detail, 4);
  const wall = Array.from({ length: courses }, (_, i) => 0.0045 + ((0.0585 - 0.0045) * i) / (courses - 1));
  const cast: readonly (readonly [number, number])[] = [
    [0.039, 0.0003],
    [0.039, 0.0018],
    [0.0405, 0.0018],
    [0.0418, 0.0026],
    ...wall.map((y): [number, number] => [0.0422, y]),
    [0.0414, 0.0607],
    [0.0396, 0.0618],
    [0.037, 0.062],
    [0.0325, 0.0618],
    [0.0282, 0.0615],
    [0.0245, 0.0613],
    [0.0222, 0.0613],
  ];
  turned(
    b,
    o,
    up,
    side,
    cast,
    drum,
    (point, ring) => {
      // The cork pad under it.
      if (ring < 2) return [0.1, 0.066, 0.04];
      // Blotches from the pour, the sand's grain, and here and there a pore the vibrating did not close.
      const grain = 0.84 + 0.32 * noise3(point[0] * 420, point[1] * 420, point[2] * 420, 7);
      const pore = fine && noise3(point[0] * 610, point[1] * 610, point[2] * 610, 9) > 0.8 ? 0.52 : 1;
      return tint(mottled(CONCRETE, point, 0.2, 0.016, 62), grain * pore);
    },
    0,
    2,
    (_, ring) => (ring <= 2 ? 0.5 : 1),
  );
  // The socket: a plain sleeve out of the concrete, its rim, and the well the cap stands in.
  const socket: readonly (readonly [number, number])[] = [
    [0.0222, 0.0611],
    [0.0212, 0.0624],
    [0.0212, 0.08],
    [0.0212, 0.1002],
    [0.0206, 0.1022],
    [0.0192, 0.103],
    [0.0152, 0.103],
    [0.0152, 0.0985],
  ];
  turned(
    b,
    o,
    up,
    side,
    socket,
    around,
    (point) => mottled(POWDER, point, 0.1, 0.012, 62),
    0,
    2,
    (_, ring) => (ring >= socket.length - 2 ? 0.35 : 1),
  );
}

/** A round cord along `path`, each point of it in `tone` (its ring along the path, its place round it). */
function cord(b: MeshBuilder, path: readonly Vec3[], radius: number, sides: number, tone: Tone): void {
  const n = path.length;
  const tangent = (i: number): Vec3 =>
    normalize(sub(path[Math.min(n - 1, i + 1)] as Vec3, path[Math.max(0, i - 1)] as Vec3));
  let across = basis(tangent(0))[0];
  const rings: Ring[] = [];
  for (let i = 0; i < n; i++) {
    const t = tangent(i);
    // The last ring's side, laid into this ring's plane: the cord does not twist.
    const laid = sub(across, scale(t, dot(across, t)));
    across = length(laid) > 1e-6 ? normalize(laid) : basis(t)[0];
    rings.push(circle(path[i] as Vec3, t, across, radius, sides));
  }
  skin(b, rings, tone, { facing: { from: path[0] as Vec3 } });
}

/**
 * The flex and its switch. A grey cloth cord out of a grommet low in the base's back, across the top on the set's
 * side, through a small inline rocker switch (a pale grey capsule in two halves with a fine seam, a rocker in its well
 * with a dark mark, a sleeve where the cord enters each end), over the top's back edge and down behind the cabinet to
 * the boards.
 */
function flexAndSwitch(b: MeshBuilder, detail: number): void {
  const o = BULB.origin;
  const lie = o[1] + FLEX_RADIUS + 0.0002;
  /** The way the cord leaves the base: backwards and towards the set. */
  const out: Vec3 = normalize([0.6, 0, 0.8]);
  const from = (reach: number, y: number): Vec3 => [o[0] + out[0] * reach, y, o[2] + out[2] * reach];
  /** The switch: its middle on the top, behind the lamp on the set's side, and the way its length runs (to the wall). */
  const middle: Vec3 = [o[0] + 0.16, o[1], o[2] + 0.09];
  const run: Vec3 = normalize([0.97, 0, 0.24]);
  const [half, sleeve] = [0.031, 0.0065];
  const end = (sign: number, reach: number, y: number): Vec3 => [
    middle[0] + run[0] * sign * reach,
    y,
    middle[2] + run[2] * sign * reach,
  ];
  // A cloth flex shows its weave, faintly.
  const braid: Tone = (point, ring, index) =>
    tint(mottled(FLEX, point, 0.08, 0.008, 63), (ring + index) % 2 === 0 ? 1.08 : 0.93);
  const [exit, high] = [EXIT[0], o[1] + EXIT[1]];
  const steps = segments(4, detail, 2);
  const sides = segments(6, detail, 4);
  /** The top's back edge (cabinet.ts), where the cord goes over. */
  const edge = 2.69;
  /** A lying cord rests on the top: a spline through resting points dips under them where it starts to climb. */
  const rest = (path: Vec3[]): Vec3[] =>
    path.map((point): Vec3 => (point[0] < edge + FLEX_RADIUS && point[1] < lie ? [point[0], lie, point[2]] : point));
  // The rubber grommet in the base's back, where the cord comes out.
  b.cylinder(
    from(exit - 0.002, high),
    from(exit + 0.0022, high - 0.0002),
    0.0043,
    0.0039,
    segments(10, detail, 6),
    [0.02, 0.018, 0.016],
    0.8,
  );
  // From the base to the switch: out of the foot band, down onto the top, and round to the switch's end.
  cord(
    b,
    spline(
      [
        from(exit - 0.005, high),
        from(exit + 0.007, high - 0.0008),
        from(exit + 0.023, lie),
        [o[0] + 0.078, lie, o[2] + 0.077],
        end(-1, half + sleeve + 0.012, lie),
        end(-1, half + 0.002, o[1] + 0.0085),
      ],
      steps,
    ).map((point, i, path) => (i < steps * 2 ? point : (rest(path)[i] as Vec3))),
    FLEX_RADIUS,
    sides,
    braid,
  );
  // From the switch on to the top's back edge and over it,
  const over: Vec3 = [edge + 0.0075, o[1] - 0.012, o[2] + 0.13];
  cord(
    b,
    rest(
      spline(
        [
          end(1, half + 0.002, o[1] + 0.0085),
          end(1, half + sleeve + 0.012, lie),
          [edge - 0.06, lie, o[2] + 0.118],
          [edge - 0.014, lie, o[2] + 0.125],
          [edge, lie, o[2] + 0.128],
          over,
        ],
        steps,
      ),
    ),
    FLEX_RADIUS,
    sides,
    braid,
  );
  // and down behind the cabinet, between its back and the skirting, then a little way along the boards: seen only
  // from the cabinet's end, so in few lengths.
  cord(
    b,
    spline(
      [
        over,
        [edge + 0.0085, o[1] - 0.09, o[2] + 0.13],
        [edge + 0.01, 0.2, o[2] + 0.122],
        [edge + 0.013, 0.05, o[2] + 0.112],
        [edge + 0.022, FLOOR + FLEX_RADIUS, o[2] + 0.08],
        [edge + 0.032, FLOOR + FLEX_RADIUS, o[2] + 0.01],
      ],
      2,
    ).map((point): Vec3 => [point[0], Math.max(point[1], FLOOR + FLEX_RADIUS + 0.0002), point[2]]),
    FLEX_RADIUS,
    4,
    braid,
  );

  // The switch, built along +x and turned to its run.
  b.placed(place(middle, Math.atan2(-run[2], run[0])), () => {
    const shell: Tone = (point) => mottled(SWITCH, point, 0.08, 0.012, 64);
    const [width, height, seam] = [0.0128, 0.0172, 0.0086];
    const count = segments(8, detail, 4);
    /** The body's outline at a height: two half circles joined by its straight sides, drawn in by `inset`. */
    const outline = (y: number, inset: number): Ring => {
      const r = width - inset;
      const straight = half - width;
      const ring: Vec3[] = [];
      for (const sign of [1, -1])
        for (let i = 0; i <= count; i++) {
          const angle = (-0.5 + i / count) * Math.PI;
          ring.push([sign * (straight + Math.cos(angle) * r), y, sign * Math.sin(angle) * r]);
        }
      return ring;
    };
    const centre: Vec3 = [0, height / 2, 0];
    // The lower half, the seam (a groove a millimetre deep) and the upper half, its top edge rounded over.
    const rows: readonly (readonly [number, number])[] = [
      [0.0003, 0.0016],
      [0.0018, 0],
      [seam - 0.0004, 0],
      [seam - 0.0002, 0.0009],
      [seam + 0.0002, 0.0009],
      [seam + 0.0004, 0],
      [height - 0.0034, 0],
      [height - 0.0012, 0.0012],
      [height, 0.0036],
    ];
    const body = rows.map(([y, inset]) => outline(y, inset));
    skin(b, body, shell, {
      facing: { from: centre },
      shade: (_, ring) => (ring === 3 || ring === 4 ? 0.5 : 1),
    });
    lid(b, body[body.length - 1] as Ring, 1, shell, { along: [0, 1, 0] });
    // The rocker in its well: the well's floor, and the key, one end pressed home and the other standing up.
    const [keyHalf, keyWide] = [0.0085, 0.0058];
    b.box(
      [-keyHalf - 0.0008, height, -keyWide - 0.0008],
      [keyHalf + 0.0008, height + 0.0002, keyWide + 0.0008],
      tint(SWITCH, 0.35),
    );
    const key: Rgb = tint(SWITCH, 1.25);
    const section = (x: number, top: number): Ring => [
      [x, height + 0.0002, -keyWide],
      [x, height + 0.0002, keyWide],
      [x, height + top, keyWide * 0.94],
      [x, height + top, -keyWide * 0.94],
    ];
    b.skin([section(-keyHalf, 0.0007), section(-0.001, 0.0019), section(keyHalf, 0.0036)], key);
    // The mark on the end that is up: an ivory dot.
    if (detail >= 0.55)
      b.lathe(
        [keyHalf - 0.003, height + 0.0031, 0],
        normalize([-0.2, 1, 0]),
        [
          [0.0011, 0],
          [0.0009, 0.0003],
          [0, 0.0003],
        ],
        6,
        MARK,
      );
    // The sleeves the cord enters by.
    for (const sign of [-1, 1]) {
      b.cylinder(
        [sign * (half - 0.001), 0.0085, 0],
        [sign * (half + sleeve), 0.0085 - 0.0012, 0],
        0.0048,
        0.0036,
        segments(8, detail, 5),
        tint(SWITCH, 0.8),
        0.9,
        false,
      );
    }
  });
}
