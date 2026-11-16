import type { MeshBuilder, Placement, Rgb, Ring, Vec3 } from '../kit/builder';
import { inset, place, spline } from '../kit/builder';
import { boxCharts, type Chart } from '../kit/charts';
import { MATERIAL } from '../materials';
import { GROUP, PAGE, type Prop } from './types';

/**
 * The dresser corner's furniture that stands still: the pine dresser against the back wall with its drawer and two
 * panelled doors, the three books on the floor beside it and the radio's mains lead; and the guitar on its stand
 * between the dresser and the TV. Every place and size is read off the modelled room this one
 * replaced (docs/gen/reference is its record).
 */

const PINE: Rgb = [0.34, 0.19, 0.105];
/** The same wood where it is geometry (a chamfer, the skirt's curve): its chart's grain averages a little darker. */
const PINE_SOLID: Rgb = [0.32, 0.18, 0.1];

let seed = 0;
/** Stained pine; `upright` turns the grain to run up the chart. */
const pine = (upright = false, density = 420): Omit<Chart, 'origin' | 'u' | 'v'> => ({
  page: PAGE.furniture,
  group: GROUP.dresser,
  material: MATERIAL.stained,
  params: [PINE[0], PINE[1], PINE[2], ((seed++ % 16) + 0.5) / 32 + (upright ? 0.5 : 0)],
  density,
  shade: 1,
});

const SIDES = ['-x', '+x', '-y', '+y', '-z', '+z'] as const;
/** The named faces of a box as charts. */
const faces = (
  min: Vec3,
  max: Vec3,
  keep: readonly (typeof SIDES)[number][],
  base: Omit<Chart, 'origin' | 'u' | 'v'>,
) =>
  boxCharts(
    min,
    max,
    base,
    SIDES.filter((side) => !keep.includes(side)),
  );

/** A triangle wound to face `towards`. */
function facing(b: MeshBuilder, p: Vec3, q: Vec3, r: Vec3, towards: Vec3, color: Rgb, shade = 1): void {
  const n: Vec3 = [
    (q[1] - p[1]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[1] - p[1]),
    (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]),
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]),
  ];
  n[0] * towards[0] + n[1] * towards[1] + n[2] * towards[2] >= 0
    ? b.tri(p, q, r, color, shade)
    : b.tri(p, r, q, color, shade);
}

/** A strip of quads between two lines, `pieces` along them, facing `towards`. */
function strip(b: MeshBuilder, a: [Vec3, Vec3], c: [Vec3, Vec3], towards: Vec3, pieces: number, color: Rgb, shade = 1) {
  const at = ([p, q]: [Vec3, Vec3], t: number): Vec3 => [
    p[0] + (q[0] - p[0]) * t,
    p[1] + (q[1] - p[1]) * t,
    p[2] + (q[2] - p[2]) * t,
  ];
  for (let i = 0; i < pieces; i++) {
    const [t0, t1] = [i / pieces, (i + 1) / pieces];
    facing(b, at(a, t0), at(a, t1), at(c, t1), towards, color, shade);
    facing(b, at(a, t0), at(c, t1), at(c, t0), towards, color, shade);
  }
}

const TOP = { x0: 0.34, x1: 1.36, y0: 0.845, y1: 0.887, z0: -2.325, z1: -1.715 };
/** The front's plane (rails and drawer), the doors' 5 mm behind it, and what shows through the gaps. */
const FRONT = -1.741;
const DOORS = -1.746;
const INSIDE = -1.758;

/** How high the skirt's lower edge is, `d` metres in from a front post: a foot, an ogee, then the long flat arch. */
const skirtEdge = (d: number): number => {
  const t = Math.min(1, Math.max(0, (d - 0.04) / 0.085));
  return 0.039 + 0.056 * t * t * (3 - 2 * t);
};

export const dresser: Prop = {
  name: 'dresser',
  budget: 900,
  build(sink) {
    seed = 0;
    const b = sink.mesh('props');
    const { x0, x1, y0, y1, z0, z1 } = TOP;
    const c = 0.005;
    // The top: its face at the density the radio's view needs, its edges, and the chamfer between them.
    sink.chart(...faces([x0 + c, y0, z0 + c], [x1 - c, y1, z1 - c], ['+y'], pine(false, 860)));
    sink.chart(...faces([x0, y0 + c, z0], [x1, y1 - c, z1], ['+z', '-x', '+x'], pine()));
    sink.chart(...faces([x0 + c, y0, z0 + c], [x1 - c, y1, z1 - c], ['-y'], pine(false, 120)));
    strip(
      b,
      [
        [x0 + c, y1, z1 - c],
        [x1 - c, y1, z1 - c],
      ],
      [
        [x0 + c, y1 - c, z1],
        [x1 - c, y1 - c, z1],
      ],
      [0, 1, 1],
      10,
      PINE_SOLID,
    );
    strip(
      b,
      [
        [x0 + c, y0, z1 - c],
        [x1 - c, y0, z1 - c],
      ],
      [
        [x0 + c, y0 + c, z1],
        [x1 - c, y0 + c, z1],
      ],
      [0, -1, 1],
      10,
      PINE_SOLID,
    );
    for (const [edge, out] of [
      [x0, -1],
      [x1, 1],
    ] as const) {
      const inner = edge - out * c;
      strip(
        b,
        [
          [inner, y1, z0 + c],
          [inner, y1, z1 - c],
        ],
        [
          [edge, y1 - c, z0 + c],
          [edge, y1 - c, z1 - c],
        ],
        [out, 1, 0],
        6,
        PINE_SOLID,
      );
      // The front corner: the chamfers' meeting and the sliver of the edges' tops it leaves.
      facing(b, [inner, y1, z1 - c], [inner, y1 - c, z1], [edge, y1 - c, z1 - c], [out, 1, 1], PINE_SOLID);
      facing(b, [inner, y1 - c, z1], [edge, y1 - c, z1], [edge, y1 - c, z1 - c], [0, 1, 0], PINE_SOLID);
    }
    // The four posts.
    for (const x of [0.378, 1.259])
      for (const z of [-2.306, -1.783])
        sink.chart(
          ...faces([x, 0.006, z], [x + 0.063, y0, z + 0.049], z > -2 ? ['-x', '+x', '+z'] : ['-x', '+x'], pine(true)),
        );
    // The front: the top rail, the drawer in its opening, the rail under it, and the dark of the carcass in the gaps.
    sink.chart(...faces([0.441, 0.802, -1.765], [1.259, y0, FRONT], ['+z'], pine()));
    sink.chart(...faces([0.444, 0.659, -1.765], [1.256, 0.799, FRONT], ['+z'], pine()));
    sink.chart(...faces([0.441, 0.611, -1.765], [1.259, 0.656, FRONT], ['+z'], pine()));
    b.box([0.441, 0.122, -1.765], [1.259, 0.802, INSIDE], [0.03, 0.016, 0.012], 0.35, ['-x', '+x', '-y', '+y', '-z']);
    // The two doors: a frame of stiles and rails around a panel set 7 mm back.
    const frame = 0.052;
    for (const [d0, d1] of [
      [0.444, 0.8485],
      [0.8515, 1.256],
    ] as const) {
      const [e0, e1] = [0.125, 0.608];
      sink.chart(...faces([d0, e0, -1.765], [d0 + frame, e1, DOORS], ['+z'], pine(true)));
      sink.chart(...faces([d1 - frame, e0, -1.765], [d1, e1, DOORS], ['+z'], pine(true)));
      sink.chart(...faces([d0 + frame, e0, -1.765], [d1 - frame, e0 + frame, DOORS], ['+z'], pine()));
      sink.chart(...faces([d0 + frame, e1 - frame, -1.765], [d1 - frame, e1, DOORS], ['+z'], pine()));
      sink.chart(
        ...faces([d0 + frame, e0 + frame, -1.765], [d1 - frame, e1 - frame, DOORS - 0.007], ['+z'], pine(true)),
      );
      // The frame's inner edges, down to the panel: a bead at 45°, in the shadow the frame casts on it.
      const [p0, p1, q0, q1] = [d0 + frame, d1 - frame, e0 + frame, e1 - frame];
      const m = 0.007;
      const lip: Rgb = [PINE_SOLID[0] * 0.6, PINE_SOLID[1] * 0.6, PINE_SOLID[2] * 0.6];
      const bead = (a: Vec3, c: Vec3, [ix, iy]: readonly [number, number]) =>
        strip(
          b,
          [a, c],
          [
            [a[0] + ix * m, a[1] + iy * m, DOORS - m],
            [c[0] + ix * m, c[1] + iy * m, DOORS - m],
          ],
          [ix, iy, 1],
          3,
          lip,
          0.6,
        );
      bead([p0, q0, DOORS], [p0, q1, DOORS], [1, 0]);
      bead([p1, q0, DOORS], [p1, q1, DOORS], [-1, 0]);
      bead([p0, q0, DOORS], [p1, q0, DOORS], [0, 1]);
      bead([p0, q1, DOORS], [p1, q1, DOORS], [0, -1]);
    }
    // The skirt: flat across the middle, falling in an ogee to a foot at each post.
    const columns: number[] = [0, 0.04];
    for (let i = 1; i <= 8; i++) columns.push(0.04 + (0.085 * i) / 8);
    const span = 1.259 - 0.441;
    const half = [...columns, 0.22, 0.32, span / 2];
    const xs = [
      ...half.map((d) => 0.441 + d),
      ...half
        .reverse()
        .slice(1)
        .map((d) => 1.259 - d),
    ];
    for (let i = 0; i + 1 < xs.length; i++) {
      const [xa, xb] = [xs[i] as number, xs[i + 1] as number];
      const [ya, yb] = [skirtEdge(Math.min(xa - 0.441, 1.259 - xa)), skirtEdge(Math.min(xb - 0.441, 1.259 - xb))];
      b.quad([xa, ya, -1.743], [xb, yb, -1.743], [xb, 0.122, -1.743], [xa, 0.122, -1.743], PINE_SOLID);
      b.quad([xa, ya, -1.765], [xb, yb, -1.765], [xb, yb, -1.743], [xa, ya, -1.743], PINE_SOLID, 0.7);
    }
    // The sides: a thin panel behind three rails and the top rail, and the back that closes the carcass.
    for (const [panel, rail, top, side] of [
      [0.408, 0.397, 0.393, '-x'],
      [1.292, 1.303, 1.307, '+x'],
    ] as const) {
      const out = side === '-x' ? -1 : 1;
      const within = (x: number): [number, number] => (out < 0 ? [x, x + 0.02] : [x - 0.02, x]);
      const [a0, a1] = within(panel);
      sink.chart(...faces([a0, 0.131, -2.257], [a1, 0.742, -1.783], [side], pine(true, 300)));
      for (const [r0, r1] of [
        [0.055, 0.139],
        [0.297, 0.366],
        [0.514, 0.582],
      ] as const) {
        const [b0, b1] = within(rail);
        sink.chart(...faces([b0, r0, -2.257], [b1, r1, -1.783], [side, '+y'], pine(false, 300)));
      }
      const [t0, t1] = within(top);
      sink.chart(...faces([t0, 0.742, -2.257], [t1, y0, -1.783], [side], pine(false, 300)));
    }
    sink.chart(...faces([0.404, 0.057, -2.297], [1.296, 0.85, -2.282], ['-z'], pine(false, 60)));
    // The drawer's two turned knobs.
    for (const x of [0.564, 1.136])
      b.lathe(
        [x, 0.7285, FRONT],
        [0, 0, 1],
        [
          [0.0065, 0],
          [0.006, 0.011],
          [0.017, 0.0145],
          [0.022, 0.019],
          [0.0205, 0.0225],
          [0.012, 0.0245],
          [0, 0.0245],
        ],
        14,
        PINE_SOLID,
      );
  },
};

/** The three big books stacked on the floor left of the dresser, and the radio's mains lead. */
export const dresserBooksAndLead: Prop = {
  name: 'dresser-books-and-lead',
  budget: 700,
  build(sink) {
    const b = sink.mesh('props');
    // Each a block under a thick cover that stands 3 mm proud of it.
    const books: readonly { at: Vec3; size: Vec3; yaw: number; color: Rgb }[] = [
      { at: [0.02, 0.006, -1.96], size: [0.41, 0.06, 0.29], yaw: 0.05, color: [0.075, 0.14, 0.3] },
      { at: [0.02, 0.066, -1.96], size: [0.37, 0.052, 0.275], yaw: -0.08, color: [0.46, 0.17, 0.1] },
      { at: [0.02, 0.118, -1.96], size: [0.35, 0.047, 0.25], yaw: 0.04, color: [0.17, 0.19, 0.26] },
    ];
    for (const { at, size, yaw, color } of books) {
      const [hx, h, hz] = [size[0] / 2, size[1], size[2] / 2];
      const lid = h - 0.017;
      const under: Rgb = [color[0] * 0.8, color[1] * 0.8, color[2] * 0.8];
      b.placed(place(at, yaw), () => {
        b.beam([-hx + 0.003, 0, -hz + 0.003], [hx - 0.003, lid, hz - 0.003], under, 0.85, 0.15);
        b.roundedBox([-hx, lid, -hz], [hx, h, hz], 0.003, color, 1, 1, 1);
      });
    }
    // The lead: off the back of the radio, over the top's back edge, down behind the dresser to the plug in the wall.
    const rubber: Rgb = [0.02, 0.02, 0.024];
    b.tube(
      spline(
        [
          [1.26, 1.006, -2.15],
          [1.3, 0.955, -2.232],
          [1.34, 0.9, -2.31],
          [1.345, 0.8, -2.334],
          [1.343, 0.715, -2.33],
          [1.317, 0.53, -2.322],
          [1.33, 0.33, -2.318],
          [1.4, 0.21, -2.318],
          [1.5, 0.192, -2.322],
          [1.585, 0.202, -2.333],
        ],
        3,
      ),
      0.003,
      5,
      rubber,
    );
    b.roundedBox([1.582, 0.187, -2.378], [1.618, 0.217, -2.331], 0.006, rubber, 1, 2, 2);
  },
};

const mm = (points: readonly (readonly [number, number])[]): [number, number][] =>
  points.map(([x, y]) => [x / 1000, y / 1000]);

/**
 * The guitar's own frame: x across the body towards the treble side, y up the strings from the body's middle to the
 * head, z out of its face; the origin is on the strings' centre line, in the body's mid plane. As it stood in the
 * modelled room: leaning back on its stand and turned a little towards the door.
 */
const GUITAR: Placement = {
  rotation: [0.9606063, 0.061697, -0.2709779, 0.0020623, 0.9734371, 0.2289454, 0.2779051, -0.2204852, 0.9349626],
  offset: [2.0829926, 0.4352251, -1.6716363],
};
const inRoom = (p: Vec3): Vec3 => {
  const r = GUITAR.rotation as number[];
  return [0, 1, 2].map(
    (k) =>
      (r[k * 3] as number) * p[0] +
      (r[k * 3 + 1] as number) * p[1] +
      (r[k * 3 + 2] as number) * p[2] +
      (GUITAR.offset[k] as number),
  ) as unknown as Vec3;
};

/** Outlines traced off the modelled room's guitar, in millimetres of its frame, counter-clockwise. */
// biome-ignore format: a table of points
const BODY = mm([
  [-20.8, -295], [24.3, -295.3], [69.3, -293.9], [113.3, -285], [144.3, -268], [164.1, -247.3], [178, -219.3],
  [183.3, -186.8], [177.6, -141.8], [163, -99.3], [143.4, -58.8], [130.1, -22.3], [130.2, -1.3], [143.4, 38.3],
  [156.9, 81.3], [156.8, 111.3], [150.4, 132.3], [144.1, 141.6], [138.3, 146], [133.3, 147.5], [128.3, 147.6],
  [123.8, 146.2], [119.4, 143.1], [116.1, 138.3], [110.8, 117.8], [105, 100.8], [97.3, 90.9], [85.8, 83.3],
  [70.3, 78.7], [57.3, 79], [42.3, 83.6], [36.8, 87.3], [33.7, 91.8], [32.4, 96.8], [31.3, 141.8], [30.8, 146.8],
  [29.6, 149.1], [27.7, 150.7], [24.8, 151.6], [-19.8, 151.8], [-24.3, 151.2], [-26.9, 149.5], [-31.9, 141.8],
  [-37.8, 135.3], [-43.3, 132.5], [-51.8, 131.3], [-67.3, 132.9], [-79.8, 138.5], [-93.4, 150.8], [-100, 162.3],
  [-105.3, 185.8], [-106.8, 207.8], [-109, 212.8], [-112.8, 216.6], [-116.8, 218.6], [-121.3, 219.2],
  [-126.3, 218.3], [-134.3, 213.8], [-144.2, 203.8], [-152.3, 186.8], [-156.8, 158.3], [-152.1, 113.3],
  [-139.6, 69.8], [-127.1, 26.3], [-127.2, -8.3], [-141.3, -51.3], [-158.9, -92.8], [-173.7, -135.8],
  [-179.8, -180.8], [-176.8, -214.3], [-165.8, -240.3], [-146.8, -261.3], [-110.8, -282.5], [-66.8, -292.8],
]);
// biome-ignore format: a table of points
const GUARD = mm([
  [144.3, -181.5], [151.3, -180.6], [157.1, -176.7], [160.7, -170.3], [161.5, -159.3], [148.5, -110.8],
  [128.4, -64.8], [113.8, -16.8], [123, 32.3], [140.8, 79.3], [141.7, 116.8], [137.6, 128.3], [134.3, 131.3],
  [131.8, 131.9], [129.3, 131.3], [127.1, 129.2], [125.6, 124.3], [118.6, 95.3], [103.3, 75.4], [81.8, 64.6],
  [55.8, 63.4], [10.8, 84.5], [-34.8, 105.9], [-50.3, 110.1], [-55.3, 108.7], [-58.9, 105.2], [-60.2, 100.8],
  [-56.6, 80.3], [-53.9, 30.3], [-67.3, -17.8], [-82, -65.8], [-81.9, -103.8], [-71.9, -123.8], [-59.8, -133.4],
  [-47.8, -136.9], [-44.6, -136.9], [-43.3, -135.5], [-42.8, -131.8], [-41.6, -123.8], [-39.2, -121.3],
  [-34.8, -120.3], [15.3, -120.3], [38.8, -121.1], [41.4, -122.9], [43.2, -127.3], [44.3, -135.6], [45.3, -137.2],
  [47.8, -137.8], [78.3, -140.7], [107.8, -156.5], [139.3, -180.4],
]);
// biome-ignore format: a table of points
const HEAD = mm([
  [-16.6, 596.9], [21.3, 597.3], [24, 597.5], [25.3, 598.3], [26.1, 600.3], [27.6, 613.3], [32.8, 627.8],
  [41.8, 638.4], [53.1, 646.3], [54.6, 648.8], [54.8, 652.8], [45.2, 702.3], [40.3, 734.3], [41.2, 738.3],
  [44.3, 741.6], [56.3, 749.8], [62, 757.8], [64.6, 766.8], [64, 775.8], [60.1, 784.8], [53.3, 792], [43.8, 796.6],
  [34.3, 797.6], [24.8, 795.1], [16.9, 789.7], [10.9, 780.8], [-4.1, 732.8], [-18.9, 684.8], [-33.9, 636.8],
  [-37.6, 621.8], [-36.8, 617.8], [-28.6, 608.2], [-21.6, 598.2], [-19.2, 596.9],
]);

/** The scratch plate's screws. */
// biome-ignore format: a table of points
const SCREWS = mm([
  [-52.5, -126.5], [-55.5, -12.5], [132, 119.5], [123, 52.5], [148.5, -170], [-39.5, 42], [-73.5, -71.5],
  [-50.5, 100.5], [39, 59.5], [114.5, -51.5], [139.5, -108], [49, -130.5],
]);
const CREAM: Rgb = [0.35, 0.305, 0.255];
const GUARD_WHITE: Rgb = [0.33, 0.31, 0.3];
const MAPLE: Rgb = [0.4, 0.21, 0.085];
const ROSEWOOD: Rgb = [0.035, 0.017, 0.014];
const CHROME: Rgb = [0.21, 0.21, 0.23];
const CHROME_LIT: Rgb = [0.42, 0.42, 0.46];
const BLACK: Rgb = [0.018, 0.018, 0.021];

/** The neck's centre line: 1.5 mm to the treble side of the strings'. */
const AXIS = 0.0015;
const NUT = 0.5925;
/** The scale as the modelled guitar had it (longer than a real one's 648 mm). */
const SCALE = 0.74;
const fret = (k: number): number => NUT - SCALE * (1 - 2 ** (-k / 12));
/** Half the neck's width at a height: 24 mm at the nut to 30.8 mm at the heel's end. */
const halfWidth = (y: number): number => 0.0308 - (0.0068 * (y - 0.064)) / (NUT - 0.064);
/** The fingerboard's face, and the head's, 15.5 mm lower. */
const BOARD = 0.032;
const HEAD_FACE = 0.0165;

/** The six machine heads' posts on the head, from the low E's by the nut. */
const POSTS: readonly [number, number][] = [
  [-0.02, 0.632],
  [-0.0125, 0.6575],
  [-0.0045, 0.6835],
  [0.0035, 0.709],
  [0.0115, 0.735],
  [0.0195, 0.7605],
];

const disc = (b: MeshBuilder, x: number, y: number, z: number, radius: number, sides: number, color: Rgb, shade = 1) =>
  b.cap(
    Array.from({ length: sides }, (_, i): Vec3 => {
      const angle = (i / sides) * Math.PI * 2;
      return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z];
    }),
    [0, 0, 1],
    color,
    shade,
  );

/**
 * The electric guitar on its stand: a cream double-cutaway body with rounded rims and an arm contour, a white scratch
 * plate carrying three pickups, three knobs and the switch, a bridge with six saddles and its arm, a bolt-on maple neck
 * with a rosewood board (21 frets, dots), the head with six machine heads, and six strings. The stand is a tripod with
 * a cradle under the body and a yoke at the neck.
 */
export const guitar: Prop = {
  name: 'guitar',
  budget: 6000,
  build(sink) {
    const b = sink.mesh('props');
    b.placed(GUITAR, () => {
      body(b);
      neck(b);
      hardware(b);
      strings(b);
      standOnGuitar(b);
    });
    standLegs(b);
  },
};

function body(b: MeshBuilder): void {
  // The arm contour: the face falls away towards the rim of the bass side's lower bout.
  const ramp = (from: number, to: number, value: number) => {
    const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
  };
  const relief = (x: number, y: number) => -0.013 * ramp(0.095, 0.185, -x) * ramp(0.01, -0.07, y);
  b.extrude(BODY, -0.026, 0.026, CREAM, { bevel: 0.009, steps: 3, grid: 0.1, relief, back: false });
  // The scratch plate: three plies, the black one showing as a line around the white.
  b.extrude(GUARD, 0.0255, 0.0278, GUARD_WHITE, { grid: 0.1, back: false });
  const [rim, ply] = [inset(GUARD, 0.0002), inset(GUARD, -0.0013)];
  rim.forEach((p, i) => {
    const j = (i + 1) % rim.length;
    const [q, r, t] = [rim[j] as (typeof rim)[number], ply[j] as (typeof rim)[number], ply[i] as (typeof rim)[number]];
    b.quad([t[0], t[1], 0.0262], [r[0], r[1], 0.0262], [q[0], q[1], 0.0266], [p[0], p[1], 0.0266], BLACK);
  });
  for (const [x, y] of SCREWS) disc(b, x, y, 0.0281, 0.0026, 4, [0.09, 0.09, 0.095]);
}

/** A D across the neck at `y`: flat on top, `depth` deep, `half` wide; `square` under 1 fills its corners out. */
function section(y: number, half: number, top: number, depth: number, square: number): Ring {
  const points: Vec3[] = [];
  for (let i = 0; i <= 8; i++) {
    const angle = (i / 8) * Math.PI;
    const [c, s] = [Math.cos(angle), Math.sin(angle)];
    points.push([AXIS + Math.sign(c) * Math.abs(c) ** square * half, y, top - s ** square * depth]);
  }
  return points;
}

function neck(b: MeshBuilder): void {
  const under = BOARD - 0.005;
  // The maple: a square heel in the body's pocket, the round of the neck, and the fall to the head past the nut.
  const rings: Ring[] = [
    section(0.064, halfWidth(0.064), under, 0.021, 0.45),
    section(0.15, halfWidth(0.15), under, 0.021, 0.45),
    section(0.178, halfWidth(0.178), under, 0.021, 1),
    ...[0.27, 0.36, 0.45, 0.53].map((y) => section(y, halfWidth(y), under, 0.021, 1)),
    section(0.575, halfWidth(0.575), under, 0.0215, 1),
    section(0.5965, 0.0245, under, 0.024, 0.8),
    section(0.603, 0.026, 0.021, 0.019, 0.6),
    section(0.613, 0.0275, HEAD_FACE - 0.0006, 0.0142, 0.45),
    section(0.628, 0.03, HEAD_FACE - 0.0006, 0.0142, 0.45),
  ];
  b.skin(rings, MAPLE);
  b.extrude(HEAD, 0.0015, HEAD_FACE, MAPLE, { bevel: 0.0022, steps: 2, grid: 0.05, back: false });
  // The fingerboard, cut along its length so light can change on it.
  const board = (y: number): Ring => {
    const half = halfWidth(y);
    return [
      [AXIS - half, y, under],
      [AXIS + half, y, under],
      [AXIS + half, y, BOARD],
      [AXIS - half, y, BOARD],
    ];
  };
  b.skin([0.064, 0.15, 0.24, 0.33, 0.42, 0.51, NUT - 0.0015].map(board), ROSEWOOD);
  b.box([AXIS - 0.024, NUT - 0.0015, under], [AXIS + 0.024, NUT + 0.002, BOARD + 0.0016], [0.5, 0.48, 0.42]);
  const wire: Rgb = [0.2, 0.2, 0.2];
  for (let k = 1; k <= 21; k++) {
    const y = fret(k);
    const half = halfWidth(y);
    b.box([AXIS - half, y - 0.0009, BOARD], [AXIS + half, y + 0.0009, BOARD + 0.001], wire, 1, ['-z', '-x', '+x']);
  }
  const pearl: Rgb = [0.5, 0.48, 0.44];
  for (const k of [3, 5, 7, 9, 12, 15, 17, 19, 21]) {
    const y = (fret(k - 1) + fret(k)) / 2;
    for (const x of k === 12 ? [-0.011, 0.011] : [0]) disc(b, AXIS + x, y, BOARD + 0.0004, 0.0032, 6, pearl);
  }
  // The machine heads: a post in its bushing on the face, a housing behind, and a key on a shaft out of the bass edge.
  const edge: Vec3 = [-0.957, 0.291, 0];
  const turn = Math.atan2(edge[1], edge[0]);
  for (const [x, y] of POSTS) {
    b.cylinder([x, y, HEAD_FACE], [x, y, HEAD_FACE + 0.002], 0.0058, 0.0052, 6, CHROME);
    b.cylinder([x, y, HEAD_FACE + 0.002], [x, y, 0.029], 0.003, 0.003, 6, CHROME);
    b.box([x - 0.0125, y - 0.0115, -0.007], [x + 0.008, y + 0.0115, 0.0015], CHROME, 1, ['+z']);
    const key: Vec3 = [x + edge[0] * 0.03, y + edge[1] * 0.03, -0.003];
    b.cylinder([x - 0.012, y + 0.0036, -0.003], key, 0.0022, 0.0022, 5, CHROME, 1, false);
    b.placed(place(key, 0, 0, turn), () =>
      b.roundedBox([-0.002, -0.009, -0.0034], [0.014, 0.009, 0.0034], 0.0032, CHROME, 1, 2, 1),
    );
  }
  // The string tree on the two thinnest strings.
  b.box([0.0115, 0.6575, HEAD_FACE], [0.0235, 0.6615, HEAD_FACE + 0.004], CHROME, 1, ['-z']);
}

function hardware(b: MeshBuilder): void {
  const face = 0.0278;
  const cover: Rgb = [0.37, 0.36, 0.34];
  // Three single coils, the bridge one slanted; each a rounded cover with six pole pieces.
  const stadium: [number, number][] = [];
  for (const [cx, start] of [
    [0.027, -Math.PI / 2],
    [-0.027, Math.PI / 2],
  ] as const)
    for (let i = 0; i <= 6; i++) {
      const angle = start + (i / 6) * Math.PI;
      stadium.push([cx + Math.cos(angle) * 0.0098, Math.sin(angle) * 0.0098]);
    }
  for (const [y, slant] of [
    [0.042, 0],
    [-0.025, 0],
    [-0.0885, -0.18],
  ] as const)
    b.placed(place([AXIS, y, 0], 0, 0, slant), () => {
      b.extrude(stadium, face, face + 0.004, cover, { bevel: 0.0012, steps: 1, back: false });
      for (let i = 0; i < 6; i++) disc(b, (i - 2.5) * 0.0104, 0, face + 0.0043, 0.0024, 4, [0.07, 0.07, 0.075]);
    });
  // Volume and two tones, skirted; the five-way switch's slot and tip.
  for (const [x, y] of [
    [0.061, -0.0975],
    [0.1045, -0.118],
    [0.1375, -0.152],
  ] as const)
    b.lathe(
      [x, y, face],
      [0, 0, 1],
      [
        [0.0138, 0],
        [0.0128, 0.0052],
        [0.0097, 0.0064],
        [0.009, 0.0148],
        [0, 0.0148],
      ],
      10,
      cover,
    );
  b.placed(place([0.0975, -0.0615, face], 0, 0, -0.6), () => {
    b.box([-0.0015, -0.012, 0], [0.0015, 0.012, 0.0004], BLACK, 1, ['-z']);
    b.cylinder([0, -0.004, 0], [0, -0.006, 0.012], 0.0016, 0.0016, 5, CHROME, 1, false);
    b.cylinder([0, -0.006, 0.012], [0, -0.0068, 0.02], 0.003, 0.0024, 6, cover);
  });
  // The bridge: its plate, six saddles, and the arm swung up over the plate.
  b.box([-0.04, -0.167, 0.0255], [0.044, -0.122, 0.029], [0.1, 0.1, 0.11], 1, ['-z']);
  for (let i = 0; i < 6; i++) {
    const x = -0.0295 + i * 0.0118;
    b.box([x - 0.005, -0.158, 0.029], [x + 0.005, -0.136, 0.0355], CHROME_LIT, 1, ['-z']);
  }
  const arm = spline(
    [
      [0.046, -0.152, 0.029],
      [0.046, -0.15, 0.046],
      [0.056, -0.128, 0.058],
      [0.076, -0.06, 0.063],
      [0.088, -0.02, 0.064],
      [0.089, 0.006, 0.065],
    ],
    2,
  );
  b.tube(arm, (along) => (along > 0.79 ? 0.0042 : 0.002), 6, CHROME);
  b.tube(arm.slice(-3), 0.0045, 6, cover);
  // The jack's dished plate on the lower bout, and the two strap buttons.
  b.placed(place([0.1035, -0.198, 0.0262], 0, 0, -0.72), () => {
    const oval: [number, number][] = Array.from({ length: 14 }, (_, i) => {
      const angle = (i / 14) * Math.PI * 2;
      return [Math.cos(angle) * 0.044, Math.sin(angle) * 0.017];
    });
    b.extrude(oval, 0, 0.0012, CHROME, { back: false });
    disc(b, 0.004, 0, 0.0014, 0.011, 8, [0.12, 0.12, 0.13], 0.5);
    b.cylinder([0.004, 0, 0.0014], [0.004, 0, 0.004], 0.006, 0.005, 6, CHROME);
  });
  const button: [number, number][] = [
    [0.0042, 0],
    [0.0038, 0.006],
    [0.0072, 0.008],
    [0.0072, 0.0105],
    [0, 0.0112],
  ];
  b.lathe([-0.117, 0.2185, 0], [-0.35, 0.94, 0], button, 6, CHROME);
  b.lathe([0, -0.295, 0], [0, -1, 0], button, 6, CHROME);
}

function strings(b: MeshBuilder): void {
  const steel: Rgb = [0.36, 0.35, 0.36];
  POSTS.forEach(([x, y], i) => {
    const saddle: Vec3 = [-0.0295 + i * 0.0118, -0.147, 0.0362];
    const nut: Vec3 = [AXIS - 0.018 + i * 0.0072, NUT, BOARD + 0.0019];
    // Round the post on the side the string comes from.
    const post: Vec3 = [x + 0.0022, y, 0.0235];
    b.tube([saddle, nut, post], 0.00075 - i * 0.00007, 3, steel);
  });
}

/** The stand's parts that lie in the guitar's frame: the leaning column, the yoke at the neck, the cradle. */
function standOnGuitar(b: MeshBuilder): void {
  const foam: Rgb = [0.012, 0.012, 0.014];
  // The column: a wide lower tube, a clamp, a thinner upper one that bends forward to the yoke.
  b.cylinder([0, -0.32, -0.146], [0, 0.06, -0.109], 0.0125, 0.0125, 6, BLACK, 1, false);
  b.cylinder([0, 0.045, -0.1105], [0, 0.075, -0.1075], 0.016, 0.016, 6, BLACK);
  b.cylinder([0.014, 0.06, -0.109], [0.034, 0.06, -0.109], 0.006, 0.008, 6, BLACK);
  b.tube(
    spline(
      [
        [0, 0.06, -0.109],
        [0, 0.41, -0.071],
        [0, 0.452, -0.058],
        [0, 0.47, -0.036],
        [0, 0.472, -0.012],
      ],
      2,
    ),
    0.0095,
    6,
    BLACK,
    1,
    false,
  );
  // The yoke: one bent rod, foam on the two prongs either side of the neck.
  const yoke = spline(
    [
      [0.04, 0.472, 0.081],
      [0.04, 0.4715, 0.036],
      [0.035, 0.471, 0.014],
      [0.018, 0.471, -0.007],
      [0, 0.471, -0.012],
      [-0.018, 0.471, -0.007],
      [-0.035, 0.471, 0.014],
      [-0.04, 0.4715, 0.036],
      [-0.04, 0.472, 0.081],
    ],
    2,
  );
  const prong = (path: readonly Vec3[], from: number) => (along: number) =>
    (path[Math.round(along * (path.length - 1))] as Vec3)[2] > from ? 0.0115 : 0.0055;
  b.tube(yoke, prong(yoke, 0.02), 6, foam);
  // The cradle: a bracket off the column, a rod out to both sides and forward under the body, foam where it rests.
  b.cylinder([0, -0.262, -0.14], [0, -0.262, -0.1], 0.008, 0.008, 6, BLACK, 1, false);
  const cradle = spline(
    [
      [0.12, -0.2915, 0.042],
      [0.12, -0.2965, -0.01],
      [0.12, -0.2965, -0.045],
      [0.108, -0.292, -0.072],
      [0.066, -0.276, -0.092],
      [0, -0.262, -0.102],
      [-0.066, -0.276, -0.092],
      [-0.108, -0.292, -0.072],
      [-0.12, -0.2965, -0.045],
      [-0.12, -0.2965, -0.01],
      [-0.12, -0.2915, 0.042],
    ],
    2,
  );
  b.tube(cradle, prong(cradle, -0.055), 6, foam);
}

/** The tripod: three legs from the hub at the column's foot to rubber feet on the floor. */
function standLegs(b: MeshBuilder): void {
  const hub = inRoom([0, -0.318, -0.1455]);
  b.sphere(hub, 0.021, 8, BLACK);
  for (const foot of [
    [2.186, 0.0175, -2.041],
    [2.328, 0.0175, -1.487],
    [1.778, 0.0175, -1.645],
  ] as const) {
    const at = (t: number): Vec3 => [
      hub[0] + (foot[0] - hub[0]) * t,
      hub[1] + (foot[1] - hub[1]) * t,
      hub[2] + (foot[2] - hub[2]) * t,
    ];
    b.cylinder(at(0), at(0.34), 0.0145, 0.0145, 6, BLACK);
    // Cut in three, so the pool's edge can cross a leg.
    for (let i = 0; i < 3; i++)
      b.cylinder(at(0.34 + i * 0.18), at(0.52 + i * 0.18), 0.0095, 0.0095, 5, [0.3, 0.3, 0.36], 1, false);
    b.cylinder(at(0.86), at(0.985), 0.0125, 0.0125, 6, BLACK);
    b.sphere(at(0.985), 0.0125, 6, BLACK);
  }
}
