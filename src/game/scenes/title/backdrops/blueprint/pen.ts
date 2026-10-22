/** A pixel the pen visits, in screen pixels. */
export type Point = readonly [x: number, y: number];

/** One pen-down movement: the pixels it inks, in the order it inks them. */
export type Stroke = readonly Point[];

/** Bresenham from `from` to `to`, both ends inked. */
export function line(from: Point, to: Point): Point[] {
  let [x, y] = from;
  const [tx, ty] = to;
  const dx = Math.abs(tx - x);
  const dy = -Math.abs(ty - y);
  const sx = x < tx ? 1 : -1;
  const sy = y < ty ? 1 : -1;
  let err = dx + dy;
  const points: Point[] = [];
  for (;;) {
    points.push([x, y]);
    if (x === tx && y === ty) return points;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Straight segments through `corners`, inked in one stroke without inking a corner twice. */
export function polyline(...corners: Point[]): Point[] {
  const points: Point[] = [];
  for (let i = 1; i < corners.length; i++) {
    const segment = line(corners[i - 1] as Point, corners[i] as Point);
    points.push(...(i === 1 ? segment : segment.slice(1)));
  }
  return points;
}

/** A closed box outline from (x, y), clockwise, stopping one pixel short of where it started. */
export function box(x: number, y: number, w: number, h: number): Point[] {
  const [right, bottom] = [x + w - 1, y + h - 1];
  return polyline([x, y], [right, y], [right, bottom], [x, bottom], [x, y + 1]);
}

/**
 * A midpoint circle, inked clockwise (on screen) from `start` radians, where
 * 0 is due right and π/2 straight down, so the pen draws it like a compass.
 */
export function circle(cx: number, cy: number, radius: number, start = -Math.PI / 2): Point[] {
  const ring = new Map<string, Point>();
  let [x, y, err] = [radius, 0, 1 - radius];
  while (x >= y) {
    for (const [px, py] of [
      [x, y],
      [y, x],
      [-y, x],
      [-x, y],
      [-x, -y],
      [-y, -x],
      [y, -x],
      [x, -y],
    ] as const) {
      ring.set(`${px},${py}`, [px, py]);
    }
    y++;
    if (err < 0) err += 2 * y + 1;
    else {
      x--;
      err += 2 * (y - x) + 1;
    }
  }
  const turn = (point: Point): number => {
    const angle = Math.atan2(point[1], point[0]) - start;
    return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  };
  return [...ring.values()].sort((a, b) => turn(a) - turn(b)).map(([px, py]) => [cx + px, cy + py]);
}

/** Fill style and rectangle sink: `CanvasRenderingContext2D` fits, and so does a test double. */
export interface PenCanvas {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/**
 * A drawing compiled for the plotter: every stroke's pixels in pen order,
 * plus the same pixels merged into straight horizontal or vertical runs, so
 * inking any prefix of the drawing costs a handful of rectangles instead of
 * one per pixel.
 */
export class PenPath {
  readonly strokes: readonly Stroke[];
  /** Pixels in pen order across all strokes. */
  readonly length: number;
  readonly #xs: Int16Array;
  readonly #ys: Int16Array;
  /** Per run: start x, start y, step x, step y, pixel count; and the pen-order index just past it. */
  readonly #runs: Int16Array;
  readonly #runEnds: Uint16Array;

  constructor(strokes: readonly Stroke[]) {
    this.strokes = strokes;
    const points = strokes.flat();
    this.length = points.length;
    this.#xs = Int16Array.from(points, ([x]) => x);
    this.#ys = Int16Array.from(points, ([, y]) => y);
    const runs: number[] = [];
    const ends: number[] = [];
    let index = 0;
    for (const stroke of strokes) {
      let start = 0;
      while (start < stroke.length) {
        const [x, y] = stroke[start] as Point;
        const next = stroke[start + 1];
        const [stepX, stepY] = next && isNeighbour([x, y], next) ? [next[0] - x, next[1] - y] : [0, 0];
        let count = 1;
        if (stepX === 0 || stepY === 0) {
          while (start + count < stroke.length) {
            const [px, py] = stroke[start + count] as Point;
            if (px !== x + stepX * count || py !== y + stepY * count) break;
            count++;
          }
        }
        runs.push(x, y, stepX, stepY, count);
        index += count;
        ends.push(index);
        start += count;
      }
    }
    this.#runs = Int16Array.from(runs);
    this.#runEnds = Uint16Array.from(ends);
  }

  /** How many rectangles inking the whole drawing takes. */
  get runCount(): number {
    return this.#runEnds.length;
  }

  /** The `index`-th pixel in pen order. */
  x(index: number): number {
    return this.#xs[index] ?? 0;
  }

  y(index: number): number {
    return this.#ys[index] ?? 0;
  }

  /** Inks the first `count` pixels in pen order in one colour. */
  ink(canvas: PenCanvas, count: number, color: string): void {
    canvas.fillStyle = color;
    let done = 0;
    for (let run = 0; run < this.#runEnds.length && done < count; run++) {
      const offset = run * 5;
      const x = this.#runs[offset] as number;
      const y = this.#runs[offset + 1] as number;
      const stepX = this.#runs[offset + 2] as number;
      const stepY = this.#runs[offset + 3] as number;
      const pixels = Math.min(this.#runs[offset + 4] as number, count - done);
      const far = pixels - 1;
      canvas.fillRect(
        stepX < 0 ? x - far : x,
        stepY < 0 ? y - far : y,
        stepX !== 0 ? pixels : 1,
        stepY !== 0 ? pixels : 1,
      );
      done += pixels;
    }
  }
}

function isNeighbour(a: Point, b: Point): boolean {
  return Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;
}
