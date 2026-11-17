/**
 * The startup still's data as one string (docs/ROOM.md › Startup), which `src/app/startup/still/draw.ts` reads back
 * in the page: whole numbers, each base-42 digits, least first, in printable characters that need no escape in a
 * script of the page or in a string of either quote (`(` to `}` but `<` and `\`), a digit of 42 or more saying
 * another follows. A signed number is folded onto the whole ones (0, −1, 1, −2, …). (Denser packings were tried:
 * under brotli none is smaller.)
 *
 * In order: the count of the picture's outline's points, then the set's bounds (two points) and that outline, all
 * in hundredths of a millimetre; the count of shapes and the number of the first that shows only with the set on; then each shape:
 * its kind (0 outlines, 1 disc, 2 print, 3 the light along a shape's edge), its geometry and its paints.
 * Outlines: a count of loops, each a count of points, a number saying whether they share a depth (1), how many
 * times its numbers are doubled (2 and 4) and whether they are a curve's control points (8), the first point and the
 * steps between the rest. A disc, a print or an edge's light: a centre and a radius, a height or a width; an edge's light then has the
 * number of its shape, a print a count of words and after each the step along the face to the next. Paints: a count, each its kind
 * (0 flat: a colour; 1 linear: two points, twice a count, colours; 2 radial: a centre, a radius, the plane's axis,
 * twice a count plus one for a glow, then the colours, or a glow's one colour and its strengths in hundredths). A
 * point is x in units of two millimetres and y and z in half millimetres; a length is in half millimetres; a colour is red, green
 * and blue.
 */
import type { StillFraming } from '../../src/app/startup/still/camera';
import type { Vec3 } from './raster';

export type Rgb = readonly [number, number, number];

export type Paint =
  | { readonly kind: 'flat'; readonly colour: Rgb }
  | {
      readonly kind: 'linear';
      readonly from: Vec3;
      readonly to: Vec3;
      readonly stops: readonly Rgb[];
    }
  | {
      readonly kind: 'radial';
      readonly centre: Vec3;
      readonly radius: number;
      readonly axis: number;
      /** Colours with a strength, 0–1. */
      readonly stops: readonly (readonly [number, number, number, number])[];
    };

export interface PaintedShape {
  readonly name: string;
  readonly kind: 'loops' | 'disc' | 'text' | 'rim';
  readonly loops: readonly (readonly Vec3[])[];
  readonly curved?: readonly boolean[];
  /** How many times coarser than the half millimetre its points are kept: 1, 2 or 4. */
  readonly coarse?: number;
  readonly centre?: Vec3;
  readonly size?: number;
  /** A print's words, and where along the face (z) each is centred. */
  readonly texts?: readonly string[];
  readonly places?: readonly number[];
  /** An edge's light: the number of the shape whose outlines it runs along. */
  readonly along?: number;
  /** Shown only with the set on. */
  readonly lit?: boolean;
  readonly paints: readonly Paint[];
}

/**
 * A loop's points share a depth when none is further than this from their middle, as a part of the unit their depth
 * is kept in. Depth moves a point on the page too: a millimetre of it is a third of a pixel at the picture's corners.
 */
const LEVEL = 0.5;
/** Depth is kept in units of this many millimetres. */
const DEPTH = 2;

export function encode(
  framing: StillFraming,
  shapes: readonly PaintedShape[],
): { data: string; texts: string[]; numbers: number[] } {
  const numbers: number[] = [];
  const whole = (value: number): void => {
    if (!Number.isInteger(value) || value < 0) throw new Error(`The still's data holds whole numbers, not ${value}`);
    numbers.push(value);
  };
  const signed = (value: number): void => whole(value < 0 ? -value * 2 - 1 : value * 2);
  const quantised = (p: Vec3): [number, number, number] => [
    Math.round(p[0] * 500),
    Math.round(p[1] * 2000),
    Math.round(p[2] * 2000),
  ];
  const point = (p: Vec3): void => {
    for (const value of quantised(p)) signed(value);
  };
  const length = (metres: number): void => whole(Math.round(metres * 2000));
  const colour = (c: Rgb): void => {
    for (const value of c) whole(clamp(value));
  };

  // The framing's own points, fine: the camera is made from them.
  whole(framing.picture.length);
  for (const p of [...framing.bounds, ...framing.picture]) for (const value of p) signed(Math.round(value * 1e5));

  const texts: string[] = [];
  whole(shapes.length);
  // The shapes of the set that is on are the last ones (build.ts sees to it); none of them: past the end.
  const lit = shapes.some((shape) => shape.lit) ? shapes.findIndex((shape) => shape.lit) : shapes.length;
  whole(lit);
  for (const shape of shapes) {
    whole(['loops', 'disc', 'text', 'rim'].indexOf(shape.kind));
    if (shape.kind === 'loops') {
      whole(shape.loops.length);
      for (const [number, loop] of shape.loops.entries()) {
        const curved = shape.curved?.[number] === true;
        // To the half millimetre and the millimetre of depth, or (a soft or a small thing) to two or four times
        // that: then every number is sent divided by it.
        const step = shape.coarse ?? 1;
        const depths = loop.map((p) => p[0]).sort((a, b) => a - b);
        const middle = ((depths[0] as number) + (depths.at(-1) as number)) / 2;
        const level = ((depths.at(-1) as number) - (depths[0] as number)) * 1000 <= 2 * LEVEL * DEPTH * step;
        const points = loop.map((p) =>
          quantised(level ? [middle, p[1], p[2]] : p).map((value) => Math.round(value / step)),
        );
        const kept = points.filter(
          (p, i) => curved || i === 0 || p.some((value, axis) => value !== (points[i - 1] as number[])[axis]),
        );
        whole(kept.length);
        whole((level ? 1 : 0) + Math.log2(step) * 2 + (curved ? 8 : 0));
        kept.forEach((p, i) => {
          const last = kept[i - 1];
          p.forEach((value, axis) => {
            if (i > 0 && level && axis === 0) return;
            signed(last ? value - (last[axis] as number) : value);
          });
        });
      }
    } else {
      point(shape.centre as Vec3);
      length(shape.size as number);
      if (shape.kind === 'rim') whole(shape.along as number);
      if (shape.kind === 'text') {
        const places = shape.places as readonly number[];
        texts.push(...(shape.texts as readonly string[]));
        whole(places.length);
        // After each word the step to the next; after the last, none.
        places.forEach((z, i) => {
          signed(Math.round(((places[i + 1] ?? z) - z) * 2000));
        });
      }
    }
    whole(shape.paints.length);
    for (const paint of shape.paints) {
      whole(['flat', 'linear', 'radial'].indexOf(paint.kind));
      if (paint.kind === 'flat') colour(paint.colour);
      else if (paint.kind === 'linear') {
        point(paint.from);
        point(paint.to);
        whole(paint.stops.length * 2);
        paint.stops.forEach(colour);
      } else {
        point(paint.centre);
        length(paint.radius);
        // A circle facing the viewer is one on the plane across x: the view is four degrees off it.
        whole(paint.axis % 3);
        // A glow is one colour, its strength falling outwards; else each stop has its colour, at full strength.
        const glow = paint.stops.some((stop) => stop[3] < 1);
        whole(paint.stops.length * 2 + (glow ? 1 : 0));
        if (glow) colour((paint.stops[0] as readonly number[]).slice(0, 3) as unknown as Rgb);
        for (const [r, g, b, strength] of paint.stops) {
          if (glow) whole(Math.round(Math.max(0, Math.min(1, strength)) * 100));
          else colour([r, g, b]);
        }
      }
    }
  }
  return { data: pack(numbers), texts, numbers };
}

const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/** Whole numbers as the string draw.ts reads. */
export function pack(numbers: readonly number[]): string {
  let data = '';
  for (let value of numbers)
    do {
      const digit = value % 42;
      value = Math.floor(value / 42);
      let code = digit + (value > 0 ? 42 : 0) + 40;
      if (code >= 60) code++;
      if (code >= 92) code++;
      data += String.fromCharCode(code);
    } while (value > 0);
  return data;
}
