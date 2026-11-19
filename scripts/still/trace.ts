/**
 * Outlines for the startup still's generator: the closed loops round a mask's pixels, and their simplification to
 * the few vertices a tolerance allows.
 */
export type Pair = readonly [number, number];

/**
 * The loops round the set pixels of a `width` × `height` mask, on the lattice of pixel corners, the inside on the
 * left of each (so holes run the other way and an even-odd fill draws them). Where two regions touch at a corner
 * the loops stay apart.
 */
export function outlines(mask: Uint8Array, width: number, height: number): Pair[][] {
  const inside = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1;
  // Each lattice point's outgoing edges, as directions: 0 right, 1 down, 2 left, 3 up.
  const stride = width + 1;
  const out = new Uint8Array(stride * (height + 1));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      // The inside on the left: clockwise on screen (y down) round a pixel.
      const mark = (at: number, edge: number): void => {
        out[at] = (out[at] as number) | edge;
      };
      if (!inside(x, y - 1)) mark(y * stride + x, 1);
      if (!inside(x + 1, y)) mark(y * stride + x + 1, 2);
      if (!inside(x, y + 1)) mark((y + 1) * stride + x + 1, 4);
      if (!inside(x - 1, y)) mark((y + 1) * stride + x, 8);
    }
  const step: readonly Pair[] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const loops: Pair[][] = [];
  for (let start = 0; start < out.length; start++) {
    while (out[start] !== 0) {
      const loop: Pair[] = [];
      let [x, y] = [start % stride, Math.floor(start / stride)];
      let heading = -1;
      for (;;) {
        const at = y * stride + x;
        const edges = out[at] as number;
        if (edges === 0) break;
        // At a corner two regions share, turn right (towards the inside's own pixel), so they stay two loops.
        let direction = -1;
        for (const turn of heading < 0 ? [0, 1, 2, 3] : [(heading + 1) % 4, heading, (heading + 3) % 4])
          if (edges & (1 << turn)) {
            direction = turn;
            break;
          }
        if (direction < 0) break;
        out[at] = edges & ~(1 << direction);
        if (direction !== heading) loop.push([x, y]);
        heading = direction;
        x += (step[direction] as Pair)[0];
        y += (step[direction] as Pair)[1];
        if (y * stride + x === start && out[start] === 0) break;
        if (y * stride + x === start) {
          // Back at the start with edges left there: this loop is closed, the others start again.
          break;
        }
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
}

/** A closed loop's signed area (positive clockwise on screen). */
export function area(loop: readonly Pair[]): number {
  let sum = 0;
  for (let i = 0; i < loop.length; i++) {
    const [a, b] = [loop[i] as Pair, loop[(i + 1) % loop.length] as Pair];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function distance(p: Pair, a: Pair, b: Pair): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Douglas–Peucker on a closed loop: no dropped vertex further than `tolerance` from what is kept. */
export function simplify(loop: readonly Pair[], tolerance: number): Pair[] {
  if (loop.length <= 4) return [...loop];
  // Two anchors far apart: the first vertex and the one furthest from it.
  let far = 0;
  let best = -1;
  loop.forEach((p, i) => {
    const d = Math.hypot(p[0] - (loop[0] as Pair)[0], p[1] - (loop[0] as Pair)[1]);
    if (d > best) [best, far] = [d, i];
  });
  const keep = new Uint8Array(loop.length);
  keep[0] = 1;
  keep[far] = 1;
  const reduce = (from: number, to: number): void => {
    // The run from → to, the loop's end joining its start.
    const stack: [number, number][] = [[from, to]];
    while (stack.length > 0) {
      const [a, b] = stack.pop() as [number, number];
      let worst = tolerance;
      let split = -1;
      for (let i = a + 1; i < b; i++) {
        const d = distance(loop[i % loop.length] as Pair, loop[a % loop.length] as Pair, loop[b % loop.length] as Pair);
        if (d > worst) [worst, split] = [d, i];
      }
      if (split < 0) continue;
      keep[split % loop.length] = 1;
      stack.push([a, split], [split, b]);
    }
  };
  reduce(0, far);
  reduce(far, loop.length);
  return loop.filter((_, i) => keep[i] === 1);
}

/** A control point of a smooth outline: where it is, and the outline's own point it stands for (its number in the loop). */
export interface Control {
  readonly at: Pair;
  readonly of: number;
}

/**
 * The curve the still draws through a loop of control points: from the middle of each side to the middle of the
 * next, bent towards the corner between them (a quadratic each). A point given twice is a sharp corner. `steps`
 * points a bend.
 */
export function curve(controls: readonly Pair[], steps: number): Pair[] {
  const points: Pair[] = [];
  const n = controls.length;
  const mid = (a: Pair, b: Pair): Pair => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  for (let i = 0; i < n; i++) {
    const [before, corner, after] = [
      controls[(i + n - 1) % n] as Pair,
      controls[i] as Pair,
      controls[(i + 1) % n] as Pair,
    ];
    const [from, to] = [mid(before, corner), mid(corner, after)];
    for (let step = 0; step < steps; step++) {
      const t = step / steps;
      points.push([
        (1 - t) ** 2 * from[0] + 2 * t * (1 - t) * corner[0] + t * t * to[0],
        (1 - t) ** 2 * from[1] + 2 * t * (1 - t) * corner[1] + t * t * to[1],
      ]);
    }
  }
  return points;
}

/**
 * A loop as few control points of such a curve, no part of it further than `tolerance` from the loop: the loop's
 * own points where it turns sharply (twice each), and between two of those as many points as it takes, spread
 * evenly and then moved until the curve lies on the loop. Round and moulded things take a third of the points their
 * polygon would. Null where it would take `fewerThan` points or more. The loop is in the page's pixels: a point of
 * it every pixel is fine enough.
 */
export function smooth(traced: readonly Pair[], tolerance: number, fewerThan = Infinity): Control[] | null {
  // Without the trace's stairs (a quarter of a pixel), which a curve through them would follow.
  const loop = simplify(traced, 0.2);
  const n = loop.length;
  // The loop as it runs, a point every pixel or so, so a long straight side counts all along.
  const dense: Pair[] = [];
  const corner: number[] = [];
  for (let i = 0; i < n; i++) {
    const [a, b] = [loop[i] as Pair, loop[(i + 1) % n] as Pair];
    const pieces = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])));
    corner.push(dense.length);
    for (let piece = 0; piece < pieces; piece++)
      dense.push([a[0] + ((b[0] - a[0]) * piece) / pieces, a[1] + ((b[1] - a[1]) * piece) / pieces]);
  }
  const m = dense.length;
  const point = (i: number): Pair => dense[((i % m) + m) % m] as Pair;
  /** How sharply the loop turns at a point, over a few pixels each way: radians. */
  const span = 2;
  const turn = (i: number): number => {
    const [a, b, c] = [point(i - span), point(i), point(i + span)];
    const angle = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
    return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
  };
  const SHARP = 0.9;
  // The sharp corners: the sharpest point of each run of them.
  const sharp: number[] = [];
  for (let i = 0; i < m; i++) {
    const here = turn(i);
    if (here < SHARP) continue;
    let sharpest = true;
    for (let d = -span; d <= span; d++)
      if (d !== 0 && (turn(i + d) > here || (turn(i + d) === here && d < 0))) sharpest = false;
    if (sharpest) sharp.push(i);
  }
  // A spiky thing (a plant) is a polygon already.
  if (sharp.length * 2 >= fewerThan) return null;
  // The stretches between them (the whole loop, from anywhere, where it has none), and the points each has.
  const starts = sharp.length > 0 ? sharp : [0];
  const stretches = starts.map((from, k) => ({
    from,
    length: (((starts[(k + 1) % starts.length] as number) - from + m - 1) % m) + 1,
    count: sharp.length > 0 ? 0 : 4,
  }));

  for (let round = 0; round < 300; round++) {
    // Each control point's place along the loop; a sharp one is the loop's own point and stays.
    const anchors: { at: number; fixed: boolean }[] = [];
    for (const stretch of stretches) {
      if (sharp.length > 0) anchors.push({ at: stretch.from, fixed: true });
      const pieces = sharp.length > 0 ? stretch.count + 1 : stretch.count;
      for (let k = sharp.length > 0 ? 1 : 0; k < pieces; k++)
        anchors.push({ at: stretch.from + Math.round((stretch.length * k) / pieces), fixed: false });
    }
    const count = anchors.length;
    // Not worth it once a polygon would take no more points.
    if (count + sharp.length >= fewerThan) return null;
    const controls = anchors.map((anchor) => point(anchor.at));
    const doubled = (): Pair[] =>
      controls.flatMap((control, k) => ((anchors[k] as { fixed: boolean }).fixed ? [control, control] : [control]));
    /** The loop's point nearest `p` among those between two places along it, and how far it is. */
    const nearest = (p: Pair, from: number, to: number): [number, Pair] => {
      let [least, found] = [Infinity, p];
      for (let i = from; i <= to; i++) {
        const [a, b] = [point(i), point(i + 1)];
        const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        const q: Pair = [a[0] + t * dx, a[1] + t * dy];
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < least) [least, found] = [d, q];
      }
      return [least, found];
    };
    const STEPS = 6;
    /** Each control point's bend, as points, and how far the worst of all is from the loop, and where. */
    let worst = 0;
    let worstAt = 0;
    const settle = (move: boolean): void => {
      const all = doubled();
      const drawn = curve(all, STEPS);
      worst = 0;
      let bend = 0;
      controls.forEach((_, k) => {
        const anchor = anchors[k] as { at: number; fixed: boolean };
        const before = (anchors[(k + count - 1) % count] as { at: number }).at;
        const after = (anchors[(k + 1) % count] as { at: number }).at;
        const from = before < anchor.at ? before : before - m;
        const to = after > anchor.at ? after : after + m;
        const bends = anchor.fixed ? 2 : 1;
        const pull = [0, 0];
        for (let i = 0; i < bends * STEPS; i++) {
          const p = drawn[bend * STEPS + i] as Pair;
          const [d, q] = nearest(p, from, to);
          pull[0] = (pull[0] as number) + (q[0] - p[0]) / STEPS;
          pull[1] = (pull[1] as number) + (q[1] - p[1]) / STEPS;
          if (d > worst) [worst, worstAt] = [d, anchor.at];
        }
        bend += bends;
        // A control point holds about half of its own bend.
        if (move && !anchor.fixed)
          controls[k] = [
            (controls[k] as Pair)[0] + 1.6 * (pull[0] as number),
            (controls[k] as Pair)[1] + 1.6 * (pull[1] as number),
          ];
      });
    };
    for (let pass = 0; pass < 40; pass++) settle(true);
    settle(false);
    // And no part of the loop far from the curve: a stretch drawn straight past a bump.
    const drawn = curve(doubled(), STEPS);
    for (let i = 0; i < m; i += 2) {
      let least = Infinity;
      for (let j = 0; j < drawn.length && least > tolerance / 2; j++)
        least = Math.min(least, distance(point(i), drawn[j] as Pair, drawn[(j + 1) % drawn.length] as Pair));
      if (least > worst) [worst, worstAt] = [least, i];
    }
    if (worst <= tolerance) {
      const result: Control[] = [];
      controls.forEach((control, k) => {
        const anchor = anchors[k] as { at: number; fixed: boolean };
        // The traced loop's own point nearest the anchor, for its depth.
        const target = point(anchor.at);
        let [least, of] = [Infinity, 0];
        traced.forEach((p, i) => {
          const d = Math.hypot(p[0] - target[0], p[1] - target[1]);
          if (d < least) [least, of] = [d, i];
        });
        result.push({ at: control, of });
        if (anchor.fixed) result.push({ at: control, of });
      });
      return result;
    }
    // More points where the worst of it is.
    const at = ((worstAt % m) + m) % m;
    const stretch =
      stretches.findLast((candidate) => (at - candidate.from + m) % m < candidate.length) ??
      (stretches[0] as (typeof stretches)[number]);
    stretch.count += Math.max(1, Math.round(stretch.count * 0.15));
  }
  throw new Error('An outline of the still would not fit a curve');
}
