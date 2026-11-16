import { DESK_PRINTS, legendTile } from '../deskArt';
import type { Rgb, Ring, Vec3 } from '../kit/builder';
import { eased, face, lerp, lid, outline, segments, skin, srgb, type Tone, tint } from './form';
import { type Key, keyboardKeys, WELL } from './keyboardLayout';
import { aged, DESK_TOP, IVORY, REAR, RECESS } from './monitor';
import type { PropSink } from './types';

/** The caps' two plastics (tools/room/desktop.py › _legend_material) and their legends' ink. */
const CAP: Rgb = srgb('d4cebd');
const CAP_ALT: Rgb = srgb('b3aa96');
const INK: Rgb = [0.05, 0.052, 0.045];

/** The board's middle, its front edge, and how its top rises towards the back. */
const X = -1.345;
const FRONT = -1.405;
const SLOPE = 0.075;
/** The top's height at the front edge, how deep the keys' well is sunk in it, and a cap's height over the well. */
const LIP = 0.017;
const SUNK = 0.0026;
const CAP_HEIGHT = 0.0118;

/** The board's top, above the desk, `depth` back from its front edge. */
const top = (depth: number): number => LIP + depth * SLOPE;
/** A point of the keyboard: across from its middle, back from its front edge, up from the desk. */
const at = (across: number, depth: number, up: number): Vec3 => [X + across, DESK_TOP + up, FRONT - depth];

/** How a row's caps lean back (radians): the rows together make a shallow bowl under the fingers. */
const LEAN = [-0.13, -0.085, -0.03, 0.03, 0.085, 0.085] as const;

/**
 * The keyboard (the shipped board's size and slope, tools/room/desktop.py › _keyboard): a sloped case with eased
 * edges and a sunk well, 104 sculpted caps at a true 19 mm pitch — tapered, bevelled at the rim, dished across, each
 * row leaning its own way — with their legends printed on them, and the three lock lamps over the number pad.
 */
export function keyboard(sink: PropSink): void {
  const b = sink.mesh('props');
  const { detail } = sink;

  // The case: up from the desk, over its eased rim, across the top, down into the well.
  const well = {
    x: (WELL.x0 + WELL.x1) / 2,
    d: (WELL.d0 + WELL.d1) / 2,
    halfX: (WELL.x1 - WELL.x0) / 2,
    halfD: (WELL.d1 - WELL.d0) / 2,
  };
  // A section: its middle (across, back), half its width and depth, its corner radius, a height above the desk and
  // the share of the sloped top's height added to it, and how dark it is.
  const run: number[][] = [
    [0, 0.1, 0.2435, 0.0985, 0.0075, 0.0004, 0, 0.75],
    [0, 0.1, 0.245, 0.1, 0.008, 0.0035, 0, 1],
    [0, 0.1, 0.245, 0.1, 0.008, -0.0032, 1, 1],
    [0, 0.1, 0.2418, 0.0968, 0.0068, 0, 1, 1],
    [well.x, well.d, well.halfX + 0.0012, well.halfD + 0.0012, 0.0042, 0, 1, 1],
    [well.x, well.d, well.halfX, well.halfD, 0.003, -0.0012, 1, 0.5],
    [well.x, well.d, well.halfX, well.halfD, 0.003, -SUNK, 1, 0.32],
  ];
  const span = (p: readonly number[], q: readonly number[]): number =>
    Math.hypot(
      (q[2] as number) - (p[2] as number),
      (q[5] as number) + (q[6] as number) * 0.02 - (p[5] as number) - (p[6] as number) * 0.02,
    );
  const sections = eased(run, 0.0022, (i) => (i === 1 || i === 2 || i === 3 ? segments(2, detail, 1) : 0), span);
  // The top between rim and well is cut once more, so the lamps' pools can cross it.
  const counts: [number, number, number] = [segments(4, detail, 2), segments(14, detail, 5), segments(6, detail, 3)];
  const ring = (s: readonly number[]): Ring =>
    outline(s[2] as number, s[3] as number, s[4] as number, ...counts).map(([a, c]) => {
      const depth = (s[1] as number) + c;
      return at((s[0] as number) + a, depth, (s[5] as number) + (s[6] as number) * top(depth));
    });
  const rings = sections.map(ring);
  const plastic: Tone = (point, r) => tint(aged(IVORY, point, 11), (sections[r] as number[])[7] as number);
  skin(b, rings, plastic, {
    facing: { from: at(0, 0.1, 0.01) },
    shade: (_, r) => 0.4 + 0.6 * ((sections[r] as number[])[7] as number),
  });
  lid(b, rings[rings.length - 1] as Ring, 2, () => tint(RECESS, 0.36), { along: [0, 1, 0] });

  // The caps.
  const keys = keyboardKeys();
  keys.forEach((key, index) => {
    cap(sink, key, index);
  });

  // Behind the function keys: the lock lamps' window over the number pad, one lamp lit, and a blank badge at the left.
  const lampDepth = WELL.d1 + 0.022;
  const lampY = (depth: number): number => top(depth) + 0.0002;
  face(
    b,
    [
      at(0.151, lampDepth - 0.007, lampY(lampDepth - 0.007)),
      at(0.219, lampDepth - 0.007, lampY(lampDepth - 0.007)),
      at(0.219, lampDepth + 0.007, lampY(lampDepth + 0.007)),
      at(0.151, lampDepth + 0.007, lampY(lampDepth + 0.007)),
    ],
    [0, 1, 0],
    tint(RECESS, 0.5),
  );
  for (let i = 0; i < 3; i++) {
    const x = 0.163 + i * 0.022;
    b.box(
      at(x - 0.0028, lampDepth + 0.0052, lampY(lampDepth) + 0.0001),
      at(x + 0.0028, lampDepth + 0.0028, lampY(lampDepth) + 0.0012),
      i === 0 ? [0.2, 0.55, 0.16] : [0.1, 0.16, 0.08],
      1,
      ['-y'],
    );
  }
  sink.decal({
    origin: at(0.153, lampDepth - 0.0062, lampY(lampDepth - 0.0062) + 0.0003),
    u: [0.064, 0, 0],
    v: [0, 0.0085 * SLOPE, -0.0085],
    art: DESK_PRINTS.locks,
    tint: [0.5, 0.48, 0.42],
  });
  sink.decal({
    origin: at(0.163 - 0.008, lampDepth - 0.004, lampY(lampDepth) + 0.0016),
    u: [0.016, 0, 0],
    v: [0, 0.016 * SLOPE, -0.016],
    art: DESK_PRINTS.lamp,
    tint: [0.3, 0.75, 0.24],
  });
  const badge = at(-0.215, lampDepth, lampY(lampDepth));
  b.roundedBox(
    [badge[0], badge[1] - 0.0004, badge[2] - 0.006],
    [badge[0] + 0.034, badge[1] + 0.0009, badge[2] + 0.006],
    0.0006,
    tint(REAR, 0.86),
    1,
    1,
    1,
  );
}

/** One cap: a tapered foot, a bevelled rim and a top dished across, leaning as its row does, and its legend. */
function cap(sink: PropSink, key: Key, index: number): void {
  const b = sink.mesh('props');
  const { detail } = sink;
  const fine = detail >= 0.8;
  const base = key.alt ? CAP_ALT : CAP;
  // No two caps of a board age alike.
  const worn = 0.965 + 0.07 * (((index * 2654435761) >>> 0) / 4294967296);
  const color = tint(base, worn);
  const [x0, x1] = [key.x - key.w / 2, key.x + key.w / 2];
  const [d0, d1] = [key.d - key.h / 2, key.d + key.h / 2];
  const floor = (depth: number): number => top(depth) - SUNK;
  const lean = LEAN[key.row] as number;
  // The space bar is rounded over; every other cap is dished.
  const bar = key.w > 0.08;
  const columns = fine ? Math.max(3, Math.round(key.w / 0.012)) : 1;
  const chamfer = 0.001;
  /** A rectangle's outline, inset, with its front and back edges cut at the columns: points and their column. */
  const loop = (
    side: number,
    frontIn: number,
    backIn: number,
    height: (depth: number, column: number) => number,
  ): Ring => {
    const [a0, a1, c0, c1] = [x0 + side, x1 - side, d0 + frontIn, d1 - backIn];
    const points: Vec3[] = [];
    const push = (x: number, d: number, column: number): void => void points.push(at(x, d, height(d, column)));
    for (let i = 0; i <= columns; i++) push(lerp(a0 + chamfer, a1 - chamfer, i / columns), c0, i / columns);
    push(a1, c0 + chamfer, 1);
    push(a1, c1 - chamfer, 1);
    for (let i = columns; i >= 0; i--) push(lerp(a0 + chamfer, a1 - chamfer, i / columns), c1, i / columns);
    push(a0, c1 - chamfer, 0);
    push(a0, c0 + chamfer, 0);
    return points;
  };
  const crown = (depth: number, column: number): number => {
    const across = (column - 0.5) * 2;
    const dish = bar
      ? 0.0007 * (1 - ((depth - key.d) / (key.h / 2)) ** 2)
      : fine
        ? -0.00042 * (1 - across * across)
        : 0;
    return floor(key.d) + CAP_HEIGHT + (depth - key.d) * (SLOPE + Math.tan(lean)) + dish;
  };
  const rings: Ring[] = [loop(0, 0, 0, floor)];
  if (fine) rings.push(loop(0.0023, 0.0026, 0.0015, (depth, column) => crown(depth, column) - 0.0009));
  rings.push(loop(0.0029, 0.0032, 0.002, crown));
  const paint: Tone = (_, r) => (r === 0 ? tint(color, 0.8) : r === rings.length - 1 ? tint(color, 1.03) : color);
  skin(b, rings, paint, {
    facing: { from: at(key.x, key.d, floor(key.d) + 0.004) },
    shade: (_, r) => (r === 0 ? 0.45 : 1),
  });
  // The top: a strip of quads across, and the two ends.
  const rim = rings[rings.length - 1] as Ring;
  const n = columns + 1;
  const [front, back] = [rim.slice(0, n), rim.slice(n + 2, 2 * n + 2).reverse()];
  const high = tint(color, 1.03);
  for (let i = 0; i < columns; i++)
    b.quad(front[i] as Vec3, front[i + 1] as Vec3, back[i + 1] as Vec3, back[i] as Vec3, high);
  b.quad(front[columns] as Vec3, rim[n] as Vec3, rim[n + 1] as Vec3, back[columns] as Vec3, high);
  b.quad(back[0] as Vec3, rim[2 * n + 2] as Vec3, rim[2 * n + 3] as Vec3, front[0] as Vec3, high);
  // The home keys' bars.
  if (fine && (key.label === 'F' || key.label === 'J' || key.label === '5'))
    b.box(
      at(key.x - 0.002, d0 + 0.0052, crown(d0 + 0.0048, 0.5) + 0.0002),
      at(key.x + 0.002, d0 + 0.0046, crown(d0 + 0.0048, 0.5) + 0.0007),
      high,
      1,
      ['-y'],
    );
  if (!key.label) return;
  // The legend, in the cap's top left corner: a print, laid on the top's own plane.
  const size = Math.min(x1 - x0, d1 - d0) - 0.0058;
  const [lx, ld] = [x0 + 0.0031, d1 - 0.0022];
  const lift = 0.00025;
  const origin = at(lx, ld - size, crown(ld - size, 0) + lift);
  const far = at(lx, ld, crown(ld, 0) + lift);
  sink.decal({
    origin,
    u: [size, 0, 0],
    v: [far[0] - origin[0], far[1] - origin[1], far[2] - origin[2]],
    art: legendTile(index),
    tint: INK,
  });
}
