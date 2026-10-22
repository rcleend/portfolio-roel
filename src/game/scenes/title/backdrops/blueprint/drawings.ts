import { type Rect, rect } from '@/engine/math/Rect';
import { glyphPixels as lettering } from './lettering';
import { box, circle, line, type Point, polyline, type Stroke } from './pen';

/**
 * The product wireframes the plotter draws while the title idles, one at a
 * time, in the free corners below the lockup's lowest legal edge (the
 * prompt's row, with room for the pen's crosshair above them) and beside
 * the prompt and copyright, so neither they nor the pen ever pass behind
 * the logo or the text. Each faces one side of the job: the design, the
 * product, the engineering and the results.
 */
export interface Drawing {
  readonly name: string;
  /** Everything the drawing inks, for keeping it clear of the lockup and the text. */
  readonly bounds: Rect;
  /** Pen-down strokes in plotting order. */
  readonly strokes: readonly Stroke[];
}

/** Places local points at (x, y). */
function at(x: number, y: number, points: readonly Point[]): Point[] {
  return points.map(([px, py]) => [x + px, y + py]);
}

/** A solid drafting arrowhead `depth` pixels long with its tip at (x, y), inked from its base to its tip. */
function arrowhead(x: number, y: number, towards: 'up' | 'right' | 'down' | 'left', depth = 3): Point[] {
  const points: Point[] = [];
  for (let back = depth - 1; back >= 0; back--) {
    for (let side = -back; side <= back; side++) {
      if (towards === 'right') points.push([x - back, y + side]);
      else if (towards === 'left') points.push([x + back, y + side]);
      else if (towards === 'down') points.push([x + side, y - back]);
      else points.push([x + side, y + back]);
    }
  }
  return points;
}

/** A dash-dot centre line, as drafted through the middle of every circle. */
function centreLine(from: Point, to: Point): Point[] {
  const DASH = [1, 1, 1, 1, 1, 0, 1, 0];
  return line(from, to).filter((_, i) => DASH[i % DASH.length] === 1);
}

/**
 * The design: a phone wireframe with a status speaker, an image placeholder
 * crossed out the way every wireframe does it, two lines of copy, a call to
 * action and a home button. Its width is dimensioned 375, the design width
 * of a phone screen in points, whatever it measures here.
 */
function phone(): Drawing {
  const [x, y] = [36, 184];
  const body = polyline([2, 0], [21, 0], [23, 2], [23, 39], [21, 41], [2, 41], [0, 39], [0, 2], [1, 1]);
  const strokes = [
    body,
    line([9, 3], [14, 3]),
    box(2, 6, 20, 30),
    box(5, 9, 13, 9),
    line([6, 10], [16, 16]),
    line([16, 10], [6, 16]),
    line([5, 21], [16, 21]),
    line([5, 24], [13, 24]),
    box(5, 28, 14, 5),
    circle(11, 38, 2),
    line([0, -2], [0, -7]),
    line([23, -2], [23, -7]),
    [...arrowhead(1, -5, 'left', 2), ...line([3, -5], [20, -5]), ...arrowhead(22, -5, 'right', 2)],
    lettering('375', 6, -13),
  ].map((stroke) => at(x, y, stroke));
  return { name: 'phone', bounds: rect(x, y - 13, 24, 55), strokes };
}

/** The product: IDEA, a decision, SHIP, and the NO that loops back to the idea. */
function flowchart(): Drawing {
  const [x, y] = [231, 170];
  const strokes = [
    box(0, 6, 21, 11),
    lettering('IDEA', 3, 9),
    [...line([21, 11], [23, 11]), ...arrowhead(26, 11, 'right')],
    polyline([27, 11], [36, 2], [45, 11], [36, 20], [28, 12]),
    lettering('?', 35, 9),
    [...line([46, 11], [48, 11]), ...arrowhead(51, 11, 'right')],
    box(52, 6, 22, 11),
    lettering('SHIP', 56, 9),
    [...polyline([36, 21], [36, 27], [10, 27], [10, 20]), ...arrowhead(10, 17, 'up')],
    lettering('NO', 19, 29),
  ].map((stroke) => at(x, y, stroke));
  return { name: 'flowchart', bounds: rect(x, y + 2, 74, 32), strokes };
}

/**
 * One quarter of the gear's outline, from the tip of the tooth pointing right
 * to the tip of the tooth pointing up, around its centre. It is symmetric
 * about the diagonal and the other quarters are exact quarter turns of it,
 * so all eight teeth come out as even as hand-placed pixels.
 */
const GEAR_QUARTER: readonly Point[] = [
  [15, 0],
  [15, -2],
  [11, -2],
  [11, -4],
  [10, -6],
  [13, -9],
  [9, -13],
  [6, -10],
  [4, -11],
  [2, -11],
  [2, -15],
  [0, -15],
];

/** The engineering: an eight-tooth gear with its bore, centre lines and a diameter callout. */
function gear(): Drawing {
  const [cx, cy] = [50, 199];
  const corners: Point[] = [];
  for (let turn = 0; turn < 4; turn++) {
    const quarter = GEAR_QUARTER.map((point) => quarterTurns(point, turn));
    corners.push(...(turn === 0 ? quarter : quarter.slice(1)));
  }
  const strokes = [
    // Round to the first tooth again, stopping a pixel short of inking it twice.
    polyline(...corners).slice(0, -1),
    circle(0, 0, 4),
    centreLine([-20, 0], [20, 0]),
    centreLine([0, -20], [0, 20]),
    polyline([12, -12], [19, -19], [33, -19]),
    lettering('Ø31', 20, -26),
  ].map((stroke) => at(cx, cy, stroke));
  return { name: 'gear', bounds: rect(cx - 20, cy - 26, 54, 47), strokes };
}

/** `point` turned a quarter `turns` times anticlockwise on screen, about the origin. */
function quarterTurns(point: Point, turns: number): Point {
  let [x, y] = point;
  for (let i = 0; i < turns; i++) [x, y] = [y, -x];
  return [x, y];
}

/** The results: a hockey stick on two axes. */
function growth(): Drawing {
  const [x, y] = [233, 170];
  const curve: Point[] = [
    [7, 30],
    [15, 29],
    [22, 31],
    [30, 28],
    [38, 26],
    [45, 22],
    [51, 17],
    [56, 11],
    [61, 3],
  ];
  const strokes = [
    [...arrowhead(4, 0, 'up'), ...polyline([4, 3], [4, 32], [66, 32]), ...arrowhead(69, 32, 'right')],
    ...[14, 24, 34, 44, 54].map((tickX) => line([tickX, 33], [tickX, 34])),
    ...[8, 16, 24].map((tickY) => line([2, tickY], [3, tickY])),
    polyline(...curve),
    polyline([59, 2], [62, 2], [62, 5]),
  ].map((stroke) => at(x, y, stroke));
  return { name: 'growth', bounds: rect(x + 2, y, 68, 35), strokes };
}

/** Plotting order: the design, the product, the engineering and the results, alternating corners. */
export const DRAWINGS: readonly Drawing[] = [phone(), flowchart(), gear(), growth()];
