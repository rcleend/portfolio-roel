/**
 * How alike two shots of the page are, as an eye would find it (handover.spec.ts; docs/ROOM.md › Startup): the colour
 * difference of small blocks as CIEDE2000, and how far the strong edges of one lie from the same edges of the other.
 * Plain arithmetic on pixels, no imports, so the scratch harness that draws the tables runs the same code.
 */
export interface Pixels {
  /** sRGB, three bytes a pixel, in device pixels. */
  readonly rgb: Uint8Array | Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  /** Device pixels to a CSS pixel. */
  readonly dpr: number;
}

export type Lab = readonly [l: number, a: number, b: number];

const LINEAR = Float64Array.from({ length: 256 }, (_, byte) => {
  const v = byte / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

/** Linear sRGB (0–1) to CIE L*a*b* under D65. */
export function labOfLinear(r: number, g: number, b: number): Lab {
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** sRGB bytes to CIE L*a*b* under D65. */
export function labOf(r: number, g: number, b: number): Lab {
  return labOfLinear(LINEAR[r] as number, LINEAR[g] as number, LINEAR[b] as number);
}

/** CIEDE2000 between two L*a*b* colours (Sharma, Wu and Dalal, 2005; kL = kC = kH = 1). */
export function deltaE00([l1, a1, b1]: Lab, [l2, a2, b2]: Lab): number {
  const RAD = Math.PI / 180;
  const meanC = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(meanC ** 7 / (meanC ** 7 + 25 ** 7)));
  const [ap1, ap2] = [(1 + g) * a1, (1 + g) * a2];
  const [c1, c2] = [Math.hypot(ap1, b1), Math.hypot(ap2, b2)];
  const hue = (b: number, a: number): number => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / RAD + 360) % 360);
  const [h1, h2] = [hue(b1, ap1), hue(b2, ap2)];
  const dL = l2 - l1;
  const dC = c2 - c1;
  let dh = 0;
  if (c1 * c2 !== 0) {
    dh = h2 - h1;
    if (dh > 180) dh -= 360;
    else if (dh < -180) dh += 360;
  }
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh / 2) * RAD);
  const L = (l1 + l2) / 2;
  const C = (c1 + c2) / 2;
  let H = h1 + h2;
  if (c1 * c2 !== 0) {
    if (Math.abs(h1 - h2) <= 180) H /= 2;
    else H = h1 + h2 < 360 ? (H + 360) / 2 : (H - 360) / 2;
  }
  const t =
    1 -
    0.17 * Math.cos((H - 30) * RAD) +
    0.24 * Math.cos(2 * H * RAD) +
    0.32 * Math.cos((3 * H + 6) * RAD) -
    0.2 * Math.cos((4 * H - 63) * RAD);
  const sL = 1 + (0.015 * (L - 50) ** 2) / Math.sqrt(20 + (L - 50) ** 2);
  const sC = 1 + 0.045 * C;
  const sH = 1 + 0.015 * C * t;
  const rT = -2 * Math.sqrt(C ** 7 / (C ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((H - 275) / 25) ** 2)) * RAD);
  return Math.sqrt((dL / sL) ** 2 + (dC / sC) ** 2 + (dH / sH) ** 2 + rT * (dC / sC) * (dH / sH));
}

export interface BlockGrid {
  /** One L*a*b* per block, row by row; the mean of the block's light. */
  readonly lab: Float64Array;
  readonly columns: number;
  readonly rows: number;
  /** A block's side in device pixels. */
  readonly side: number;
}

/** The shot as blocks `cssSide` CSS pixels a side (whole blocks only), each the colour of its mean light. */
export function blocksOf(shot: Pixels, cssSide = 8): BlockGrid {
  const side = Math.max(1, Math.round(cssSide * shot.dpr));
  const [columns, rows] = [Math.floor(shot.width / side), Math.floor(shot.height / side)];
  const lab = new Float64Array(columns * rows * 3);
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      let [r, g, b] = [0, 0, 0];
      for (let y = row * side; y < (row + 1) * side; y++) {
        let i = (y * shot.width + column * side) * 3;
        for (let x = 0; x < side; x++, i += 3) {
          r += LINEAR[shot.rgb[i] as number] as number;
          g += LINEAR[shot.rgb[i + 1] as number] as number;
          b += LINEAR[shot.rgb[i + 2] as number] as number;
        }
      }
      lab.set(labOfLinear(r / side ** 2, g / side ** 2, b / side ** 2), (row * columns + column) * 3);
    }
  return { lab, columns, rows, side };
}

export interface ColourDifference {
  /** CIEDE2000 of each block. */
  readonly each: Float64Array;
  readonly max: number;
  /** The 99th percentile over all blocks. */
  readonly p99: number;
  readonly mean: number;
  /** The worst block's top-left corner in CSS pixels. */
  readonly at: readonly [x: number, y: number];
}

/** CIEDE2000 between two grids of the same shape, block by block. */
export function colourDifference(a: BlockGrid, b: BlockGrid, dpr: number): ColourDifference {
  const count = a.columns * a.rows;
  const each = new Float64Array(count);
  let [max, worst, sum] = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    const d = deltaE00(
      [a.lab[i * 3] as number, a.lab[i * 3 + 1] as number, a.lab[i * 3 + 2] as number],
      [b.lab[i * 3] as number, b.lab[i * 3 + 1] as number, b.lab[i * 3 + 2] as number],
    );
    each[i] = d;
    sum += d;
    if (d > max) [max, worst] = [d, i];
  }
  const sorted = Float64Array.from(each).sort();
  return {
    each,
    max,
    p99: sorted[Math.min(count - 1, Math.floor(count * 0.99))] ?? 0,
    mean: sum / count,
    at: [((worst % a.columns) * a.side) / dpr, (Math.floor(worst / a.columns) * a.side) / dpr],
  };
}

interface Edge {
  /** Where the step is along its line, in device pixels: the centroid of its slope. */
  readonly at: number;
  /** The step's height in levels of brightness, signed. */
  readonly step: number;
}

/**
 * The steps of brightness along one line of pixels: runs of slope one way that climb at least `least` levels within
 * `widest` pixels. A slow gradient is no edge, and neither is grain.
 */
function edgesAlong(light: Float32Array, start: number, stride: number, count: number, least: number, widest: number) {
  const edges: Edge[] = [];
  let [from, step, moment] = [-1, 0, 0];
  const close = (to: number): void => {
    if (from >= 0 && Math.abs(step) >= least && to - from <= widest) edges.push({ at: moment / step, step });
    from = -1;
    step = 0;
    moment = 0;
  };
  for (let i = 0; i < count - 1; i++) {
    const slope = (light[start + (i + 1) * stride] as number) - (light[start + i * stride] as number);
    // A run ends where the slope turns or flattens (under a level a pixel).
    if (Math.abs(slope) < 1 || (step !== 0 && Math.sign(slope) !== Math.sign(step))) close(i);
    if (Math.abs(slope) < 1) continue;
    if (from < 0) from = i;
    step += slope;
    moment += slope * (i + 0.5);
  }
  close(count - 1);
  return edges;
}

export interface EdgeShift {
  /** Strong edges of the first shot found on the lines looked at. */
  readonly edges: number;
  /** Those with the same edge (the same way, at least half as high) within `reach` CSS pixels in the second shot. */
  readonly matched: number;
  /** How far the matched ones moved, in CSS pixels. */
  readonly max: number;
  readonly p99: number;
  readonly mean: number;
  /** The part of the matched ones that moved more than half a CSS pixel. */
  readonly overHalf: number;
  /** Where the largest move is, in CSS pixels. */
  readonly at: readonly [x: number, y: number];
}

/**
 * How far the strong edges of `a` lie from the same edges of `b`: along every `every`-th CSS pixel's row and column,
 * each step of at least `least` levels in `a` is paired with the nearest step of the same sign in `b`, and the
 * distance between their centroids is its move. Sub-pixel: a centroid moves with the smallest shift of an outline.
 */
export function edgeShift(a: Pixels, b: Pixels, { least = 16, reach = 4, every = 2 } = {}): EdgeShift {
  const { width, height, dpr } = a;
  const lightOf = (shot: Pixels): Float32Array => {
    const light = new Float32Array(width * height);
    for (let i = 0; i < light.length; i++)
      light[i] =
        (shot.rgb[i * 3] as number) * 0.299 +
        (shot.rgb[i * 3 + 1] as number) * 0.587 +
        (shot.rgb[i * 3 + 2] as number) * 0.114;
    return light;
  };
  const [la, lb] = [lightOf(a), lightOf(b)];
  const widest = Math.ceil(6 * dpr);
  const moves: number[] = [];
  let [edges, max] = [0, 0];
  let at: readonly [number, number] = [0, 0];
  const line = (start: number, stride: number, count: number, where: (along: number) => readonly [number, number]) => {
    const found = edgesAlong(la, start, stride, count, least, widest);
    if (found.length === 0) return;
    const others = edgesAlong(lb, start, stride, count, least / 2, widest);
    for (const edge of found) {
      edges++;
      let best = Number.POSITIVE_INFINITY;
      for (const other of others)
        if (Math.sign(other.step) === Math.sign(edge.step)) best = Math.min(best, Math.abs(other.at - edge.at));
      if (best > reach * dpr) continue;
      moves.push(best / dpr);
      if (best / dpr > max) [max, at] = [best / dpr, where(edge.at)];
    }
  };
  const gap = Math.max(1, Math.round(every * dpr));
  for (let y = 0; y < height; y += gap) line(y * width, 1, width, (x) => [x / dpr, y / dpr]);
  for (let x = 0; x < width; x += gap) line(x, width, height, (y) => [x / dpr, y / dpr]);
  moves.sort((p, q) => p - q);
  return {
    edges,
    matched: moves.length,
    max,
    p99: moves[Math.min(moves.length - 1, Math.floor(moves.length * 0.99))] ?? 0,
    mean: moves.reduce((sum, move) => sum + move, 0) / Math.max(1, moves.length),
    overHalf: moves.filter((move) => move > 0.5).length / Math.max(1, moves.length),
    at,
  };
}
