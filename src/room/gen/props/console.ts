import { ART, artUv } from '../art';
import { type MeshBuilder, place, type Rgb, type Ring, spline, type Vec3 } from '../kit/builder';
import type { Chart } from '../kit/charts';
import { MATERIAL } from '../materials';
import { FLOOR, GROUP, PAGE, type Prop, type PropSink } from './types';

/**
 * The game console on the floor in front of the cabinet, its two pads, their cables, a memory card and a game case.
 * A design of its own in the slim black class of its years: a ribbed deck overhanging a narrower base, the tray
 * across the right of the front, two pad ports and two card slots on the left, a red standby lamp. Its wordmark is
 * the room's own (art.ts). The front faces the room (-x).
 */
const FRONT = 1.848;
const BACK = 2.032;
const LEFT = -0.202;
const RIGHT = 0.102;
/** Heights are from the boards it stands on: its base rests on them. */
const TOP = FLOOR + 0.085;
const WAIST = FLOOR + 0.034;
const RIB = 0.0016;

const SHELL: Rgb = [0.016, 0.018, 0.04];
const RECESS: Rgb = [0.005, 0.005, 0.009];
const TRAY: Rgb = [0.022, 0.024, 0.048];
const PAD: Rgb = [0.024, 0.026, 0.048];
const RUBBER: Rgb = [0.012, 0.013, 0.022];
const CABLE: Rgb = [0.018, 0.019, 0.032];
const CASE: Rgb = [0.035, 0.04, 0.075];

/** The pad ports' middles along the front, and their height. */
const PORTS = [-0.157, -0.105] as const;
const PORT_Y = FLOOR + 0.05;
const CABLE_RADIUS = 0.003;

const plain = (color: Rgb, density: number): Omit<Chart, 'origin' | 'u' | 'v'> => ({
  page: PAGE.corner,
  group: GROUP.cabinet,
  material: MATERIAL.plain,
  params: [color[0], color[1], color[2], 0],
  density,
  shade: 1,
});

export const gameConsole: Prop = {
  name: 'game-console',
  budget: 1300,
  build(sink) {
    const b = sink.mesh('props');
    // The base, the shadow gap of the waist, and the deck over them.
    b.roundedBox(
      [FRONT + 0.013, FLOOR, LEFT + 0.011],
      [BACK - 0.007, WAIST - 0.004, RIGHT - 0.011],
      0.004,
      SHELL,
      0.8,
      1,
      2,
    );
    b.box([FRONT + 0.006, WAIST - 0.004, LEFT + 0.006], [BACK - 0.004, WAIST, RIGHT - 0.006], RECESS, 0.4, [
      '+y',
      '-y',
    ]);
    b.roundedBox([FRONT, WAIST, LEFT], [BACK, TOP - 0.0003, RIGHT], 0.0035, SHELL, 1, 1, 2);
    // The deck's top is a chart: the pad's and the card's shadows fall on it.
    sink.chart({
      ...plain(SHELL, 900),
      origin: [FRONT + 0.003, TOP, RIGHT - 0.003],
      u: [BACK - FRONT - 0.006, 0, 0],
      v: [0, 0, LEFT - RIGHT + 0.006],
    });
    // Ribs across the deck from the left end to the lid's panel.
    for (let i = 0; i < 14; i++) {
      const x = FRONT + 0.0085 + i * 0.0126;
      b.box([x, TOP, LEFT + 0.007], [x + 0.0062, TOP + RIB, -0.012], SHELL, 1, ['-y']);
    }
    // The lid's panel: a fine groove around it.
    b.box([FRONT + 0.007, TOP, -0.0035], [BACK - 0.007, TOP + 0.0004, -0.002], RECESS, 0.4, ['-y']);

    // The front. Two pad ports, each a dark socket in a raised surround.
    const face = FRONT - 0.0006;
    for (const z of PORTS) {
      b.box([face, PORT_Y - 0.0095, z - 0.0235], [FRONT + 0.001, PORT_Y + 0.0095, z + 0.0235], TRAY, 1, ['+x']);
      b.box([face - 0.0002, PORT_Y - 0.007, z - 0.021], [FRONT, PORT_Y + 0.007, z + 0.021], RECESS, 0.3, ['+x']);
    }
    // Two card slots beside them, their doors a shade lighter than the dark around them.
    for (const z of [-0.06, -0.022]) {
      b.box([face - 0.0002, FLOOR + 0.0445, z - 0.0165], [FRONT, FLOOR + 0.0555, z + 0.0165], RECESS, 0.35, ['+x']);
      b.box([face - 0.0005, FLOOR + 0.0465, z - 0.0145], [FRONT, FLOOR + 0.0535, z + 0.0145], TRAY, 0.8, ['+x']);
    }
    // The tray: a door a hair proud of the face over a dark gap.
    b.box([face - 0.0004, FLOOR + 0.0635, -0.082], [FRONT, FLOOR + 0.0775, 0.09], TRAY, 1, ['+x']);
    b.box([face, FLOOR + 0.0618, -0.083], [FRONT, FLOOR + 0.0635, 0.091], RECESS, 0.3, ['+x']);
    // Open and reset, round keys under the tray's right end.
    const keyY = FLOOR + 0.049;
    for (const z of [0.082, 0.066]) {
      b.cylinder([FRONT, keyY, z], [face - 0.0012, keyY, z], 0.0048, 0.0044, 10, TRAY, 1);
      b.cylinder([FRONT + 0.0002, keyY, z], [face, keyY, z], 0.006, 0.0058, 10, RECESS, 0.4);
    }
    // The standby lamp and the wordmark are prints: the lamp shines whatever the room's light.
    sink.decal({
      origin: [face - 0.0003, FLOOR + 0.045, 0.045],
      u: [0, 0, 0.008],
      v: [0, 0.008, 0],
      art: ART.consoleLamp,
      tint: [1, 1, 1],
    });
    sink.decal({
      origin: [FRONT + 0.012, TOP + 0.0003, 0.006],
      u: [0, 0, 0.085],
      v: [0.017, 0, 0],
      art: ART.consoleMark,
      tint: [0.17, 0.18, 0.26],
    });
    // The back: the fan's grille and the row of sockets, as dark recesses.
    b.box([BACK, FLOOR + 0.04, -0.14], [BACK + 0.0006, FLOOR + 0.079, -0.07], RECESS, 0.4, ['-x']);
    b.box([BACK, FLOOR + 0.04, -0.02], [BACK + 0.0006, FLOOR + 0.058, 0.08], RECESS, 0.4, ['-x']);

    // The memory card lying on the lid.
    b.placed(place([1.912, TOP, 0.04], -0.6), () => {
      b.roundedBox([-0.027, 0, -0.0215], [0.027, 0.0068, 0.0215], 0.002, [0.02, 0.02, 0.026], 1, 1, 1);
      b.box([-0.017, 0.0068, -0.017], [0.022, 0.0072, 0.017], [0.07, 0.075, 0.1], 1, ['-y']);
      b.box([-0.027, 0.001, -0.0185], [-0.0272, 0.0058, 0.0185], [0.3, 0.26, 0.14], 1, ['+x']);
    });
  },
};

/** Where each pad lies: its origin (between the lobes, on what it rests on) and its turn about +y. */
const ON_DECK = { origin: [1.927, TOP + RIB, -0.101] as Vec3, yaw: 0.736 };
const ON_FLOOR = { origin: [1.7466, FLOOR + 0.0004, -0.2239] as Vec3, yaw: -1.982 };

/** A point of a pad's own frame in the room's. */
const from = (pad: { origin: Vec3; yaw: number }, [x, y, z]: Vec3): Vec3 => [
  pad.origin[0] + Math.cos(pad.yaw) * x + Math.sin(pad.yaw) * z,
  pad.origin[1] + y,
  pad.origin[2] - Math.sin(pad.yaw) * x + Math.cos(pad.yaw) * z,
];

export const gamepads: Prop = {
  name: 'game-pads',
  budget: 4600,
  build(sink) {
    const b = sink.mesh('props');
    // What a pad lying on something keeps from the light: its underside, darkest where it touches.
    const under = ([, y]: Vec3): number => {
      const low = Math.min(1, Math.max(0, y / 0.03));
      return 0.45 + 0.55 * low * low * (3 - 2 * low);
    };
    for (const pad of [ON_DECK, ON_FLOOR])
      b.placed(place(pad.origin, pad.yaw), () => b.shaded(under, () => gamepad(b)));
  },
};

/**
 * A two-handled pad in its own frame: +x the player's right, +y out of its face, +z towards the player, resting on
 * y = 0. Each half is one moulded grip (a skin over superelliptic sections from the shoulder through the lobe and
 * down the handle); a bridge joins them, and the two sticks stand in their own wells behind it.
 */
function gamepad(b: MeshBuilder): void {
  for (const side of [-1, 1] as const) {
    b.skin(grip(side), PAD);
    // The stick's well, the stick's stem and its dished cap.
    const well: Vec3 = [side * 0.0245, 0.013, 0.027];
    b.lathe(
      well,
      [0, 1, 0],
      [
        [0.0185, 0],
        [0.0185, 0.026],
        [0.0165, 0.0305],
        [0.0115, 0.0325],
        [0.0085, 0.0312],
      ],
      12,
      PAD,
    );
    b.lathe(
      [well[0], 0.042, well[2]],
      [0, 1, 0],
      [
        [0.0085, 0.002],
        [0.0048, 0.004],
        [0.0045, 0.0125],
        [0.0098, 0.0135],
        [0.0106, 0.016],
        [0.0092, 0.0182],
        [0.005, 0.0176],
        [0, 0.017],
      ],
      12,
      RUBBER,
    );
    // The shoulder key over the grip's front end.
    b.roundedBox(
      [side * 0.046 - 0.0135, 0.034, -0.0415],
      [side * 0.046 + 0.0135, 0.0475, -0.024],
      0.006,
      RUBBER,
      1,
      1,
      1,
    );
  }
  b.roundedBox([-0.036, 0.013, -0.033], [0.036, 0.045, 0.018], 0.008, PAD, 1, 1, 2);
  // The cross key on the left lobe, in a shallow dish.
  const face = 0.0507;
  b.cylinder([-0.048, face - 0.001, 0.004], [-0.048, face + 0.0004, 0.004], 0.0128, 0.0128, 14, RUBBER, 0.6);
  b.box([-0.0585, face, 0.0005], [-0.0375, face + 0.0032, 0.0075], RUBBER, 1, ['-y']);
  b.box([-0.0515, face, -0.0065], [-0.0445, face + 0.0032, 0.0145], RUBBER, 1, ['-y']);
  // Four keys on the right lobe, each its own colour.
  const keys: readonly (readonly [number, number, Rgb])[] = [
    [0, -0.0095, [0.2, 0.14, 0.04]],
    [0.0095, 0, [0.04, 0.14, 0.15]],
    [0, 0.0095, [0.15, 0.15, 0.18]],
    [-0.0095, 0, [0.2, 0.05, 0.07]],
  ];
  for (const [dx, dz, color] of keys) {
    const [x, z] = [0.048 + dx, 0.004 + dz];
    b.cylinder([x, face - 0.001, z], [x, face + 0.003, z], 0.0043, 0.0039, 10, color, 1);
  }
  // Two small keys on the bridge, and the cable's boot at its front.
  for (const x of [-0.011, 0.005]) b.box([x, 0.045, -0.008], [x + 0.007, 0.0461, -0.0045], RUBBER, 1, ['-y']);
  b.cylinder(BOOT, [BOOT[0], BOOT[1], BOOT[2] - 0.01], 0.0042, 0.003, 8, RUBBER, 1, false);
}

/** Where the cable leaves a pad: the root of its boot, and the boot's end. */
const BOOT: Vec3 = [0.004, 0.03, -0.032];
const BOOT_END: Vec3 = [BOOT[0], BOOT[1], BOOT[2] - 0.01];

/** A grip's sections, front to handle tip: the middle, half the width, half the height, how square the top is. */
const GRIP: readonly (readonly [x: number, y: number, z: number, a: number, b: number, n: number])[] = [
  [0.045, 0.031, -0.028, 0.021, 0.014, 2.4],
  [0.046, 0.032, -0.012, 0.028, 0.018, 2.9],
  [0.048, 0.032, 0.004, 0.0305, 0.019, 3],
  [0.053, 0.029, 0.023, 0.027, 0.0185, 2.6],
  [0.06, 0.0225, 0.042, 0.0215, 0.0175, 2.2],
  [0.066, 0.0155, 0.059, 0.0175, 0.015, 2],
];
const GRIP_POINTS = 14;
const GRIP_STEPS = 3;

function grip(side: -1 | 1): Ring[] {
  // The sections' six numbers as two splines of three, so everything about a section changes smoothly along the grip.
  const middles = spline(
    GRIP.map(([x, y, z]): Vec3 => [x, y, z]),
    GRIP_STEPS,
  );
  const sizes = spline(
    GRIP.map(([, , , a, b, n]): Vec3 => [a, b, n]),
    GRIP_STEPS,
  );
  const tangent = (i: number): Vec3 => {
    const [p, q] = [middles[Math.max(0, i - 1)] as Vec3, middles[Math.min(middles.length - 1, i + 1)] as Vec3];
    const d: Vec3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const l = Math.hypot(d[0], d[1], d[2]);
    return [d[0] / l, d[1] / l, d[2] / l];
  };
  const ring = (middle: Vec3, t: Vec3, a: number, b: number, n: number): Ring => {
    // Across the grip, level; and up, square to both.
    const l = Math.hypot(t[2], t[0]);
    const across: Vec3 = [t[2] / l, 0, -t[0] / l];
    const up: Vec3 = [t[1] * across[2], t[2] * across[0] - t[0] * across[2], -t[1] * across[0]];
    return Array.from({ length: GRIP_POINTS }, (_, k): Vec3 => {
      const angle = ((k + 0.5) / GRIP_POINTS) * Math.PI * 2;
      const [c, s] = [Math.cos(angle), Math.sin(angle)];
      // Squarer over the face than under the palm.
      const power = 2 / (s > 0 ? n : 2);
      const u = Math.sign(c) * Math.abs(c) ** power * a;
      const v = Math.sign(s) * Math.abs(s) ** power * b;
      return [
        side * (middle[0] + across[0] * u + up[0] * v),
        middle[1] + across[1] * u + up[1] * v,
        middle[2] + across[2] * u + up[2] * v,
      ];
    });
  };
  // Each end is rounded off: three shrinking sections along the grip's own direction.
  const round = (index: number, direction: 1 | -1): Ring[] => {
    const [middle, t, size] = [middles[index] as Vec3, tangent(index), sizes[index] as Vec3];
    return [30, 60, 82].map((degrees) => {
      const angle = (degrees * Math.PI) / 180;
      const out = Math.sin(angle) * size[1] * direction;
      const shrink = Math.cos(angle);
      return ring(
        [middle[0] + t[0] * out, middle[1] + t[1] * out, middle[2] + t[2] * out],
        t,
        size[0] * shrink,
        size[1] * shrink,
        size[2],
      );
    });
  };
  const body = middles.map((middle, i) => {
    const size = sizes[i] as Vec3;
    return ring(middle, tangent(i), size[0], size[1], size[2]);
  });
  return [...round(0, -1).reverse(), ...body, ...round(middles.length - 1, 1)];
}

export const consoleCables: Prop = {
  name: 'console-cables',
  budget: 2200,
  build(sink) {
    const b = sink.mesh('props');
    const floor = FLOOR + CABLE_RADIUS + 0.0004;
    // Each cable ends in a plug standing out of its port, with a sleeve where the cable leaves it.
    const plugs = PORTS.map((z): Vec3 => {
      b.roundedBox(
        [FRONT - 0.024, PORT_Y - 0.006, z - 0.02],
        [FRONT + 0.0005, PORT_Y + 0.006, z + 0.02],
        0.003,
        PAD,
        1,
        0,
        1,
      );
      b.cylinder([FRONT - 0.024, PORT_Y, z], [FRONT - 0.034, PORT_Y, z], 0.0045, 0.0032, 8, RUBBER, 1, false);
      return [FRONT - 0.034, PORT_Y, z];
    }) as [Vec3, Vec3];

    // The floor pad's cable: out of its boot, down to the boards, a long loop to the right and back, up into the
    // first port.
    const loop: Vec3[] = [
      from(ON_FLOOR, BOOT_END),
      [1.802, 0.019, -0.198],
      [1.817, floor, -0.182],
      [1.822, floor, -0.155],
      [1.817, floor, -0.115],
      [1.8, floor, -0.06],
      [1.79, floor, 0],
      [1.8, floor, 0.06],
      [1.816, floor, 0.105],
      [1.8, floor, 0.129],
      [1.772, floor, 0.115],
      [1.752, floor, 0.06],
      [1.747, floor, -0.01],
      [1.76, floor, -0.07],
      [1.782, floor, -0.108],
      [1.792, 0.015, -0.133],
      [1.796, FLOOR + 0.034, -0.15],
      [1.805, PORT_Y, -0.156],
      plugs[0],
    ];
    const looped = spline(loop, 4);
    b.tube(looped, CABLE_RADIUS, 6, CABLE);

    // The deck pad's cable: two turns around the pad's middle, between its sticks, then over the deck's edge and
    // down into the second port.
    const wound: Vec3[] = [from(ON_DECK, BOOT)];
    const turns = 2;
    const steps = 18;
    for (let i = 0; i <= turns * steps; i++) {
      const angle = Math.PI - (i / steps) * Math.PI * 2;
      const [c, s] = [Math.cos(angle), Math.sin(angle)];
      const x = BOOT[0] - (i / (turns * steps)) * 0.0145;
      wound.push(
        from(ON_DECK, [
          x,
          0.0285 + Math.sign(s) * Math.abs(s) ** 0.5 * 0.021,
          0.006 + Math.sign(c) * Math.abs(c) ** 0.5 * 0.0475,
        ]),
      );
    }
    const end = wound[wound.length - 1] as Vec3;
    const drop = spline(
      [
        end,
        [end[0] - 0.006, end[1] + 0.017, end[2] - 0.006],
        [1.862, FLOOR + 0.136, -0.127],
        [1.834, FLOOR + 0.124, -0.119],
        [1.811, FLOOR + 0.098, -0.111],
        [1.803, FLOOR + 0.07, -0.106],
        [1.806, FLOOR + 0.054, -0.105],
        plugs[1],
      ],
      4,
    );
    b.tube([...wound, ...drop.slice(1)], CABLE_RADIUS, 6, CABLE);
    // The ferrite on each cable, a hand from its plug.
    for (const path of [looped, drop])
      b.cylinder(path[path.length - 13] as Vec3, path[path.length - 9] as Vec3, 0.0062, 0.0062, 8, RUBBER, 1);
  },
};

/** The game lying on the floor to the right of the console: a case as the cabinet's three, its cover the fourth. */
export const floorGame: Prop = {
  name: 'floor-game',
  budget: 160,
  build(sink) {
    floorCase(sink);
  },
};

function floorCase(sink: PropSink): void {
  const centre: Vec3 = [1.8, FLOOR, 0.52];
  const yaw = 0.7;
  const [tall, wide, thick] = [0.19, 0.135, 0.0145];
  const at = { origin: centre, yaw };
  // The case's own +x runs up the cover and +z to its right.
  sink
    .mesh('props')
    .placed(place(centre, yaw), () =>
      sink
        .mesh('props')
        .roundedBox([-tall / 2, 0, -wide / 2], [tall / 2, thick - 0.0004, wide / 2], 0.003, CASE, 1, 1, 2),
    );
  const inset = 0.003;
  const corner = from(at, [-tall / 2 + inset, thick, -wide / 2 + inset]);
  const right = from(at, [-tall / 2 + inset, thick, wide / 2 - inset]);
  const up = from(at, [tall / 2 - inset, thick, -wide / 2 + inset]);
  sink.chart({
    page: PAGE.corner,
    group: GROUP.cabinet,
    material: MATERIAL.print,
    params: artUv(ART.coverPowder),
    density: 1500,
    shade: 1,
    origin: corner,
    u: [right[0] - corner[0], 0, right[2] - corner[2]],
    v: [up[0] - corner[0], 0, up[2] - corner[2]],
  });
}
