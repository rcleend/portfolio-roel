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

/** A field's lines are placed in this many steps from one end of it to the other (draw.ts › FIELD). */
export const FIELD_STEPS = 96;

/** The finish's vignette over the page (finish.ts reads it from the finish). */
export interface Vignette {
  /** The page's width is stretched by this much before a point's distance from the middle is taken, in half pages. */
  readonly stretch: number;
  /** The distance (as the composite takes it: squared) where it ends. */
  readonly end: number;
  /** How much of black is laid over the page at evenly spaced distances from the middle to the end, 0–1. */
  readonly stops: readonly number[];
}

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
    }
  /**
   * A surface's light as a grid of colours on a plane of the room (across `axis`, 0 x or 1 y, at `plane` metres):
   * lines of colours from `z[0]` to `z[1]` along the wall and from `v[0]` to `v[1]` up (a plane across x) or in depth
   * (one across y), the row highest on the page first, cut to the shape's outline. `columns` and `rows` say where
   * the grid's lines are, each a whole number of `FIELD_STEPS`ths of the way, from 0 to all of it.
   */
  | {
      readonly kind: 'field';
      readonly axis: 0 | 1;
      readonly plane: number;
      readonly z: readonly [number, number];
      readonly v: readonly [number, number];
      readonly columns: readonly number[];
      readonly rows: readonly number[];
      /** Row by row. */
      readonly colours: readonly Rgb[];
      /** Where the surface's rendered picture is in the still's image: left, top, width, height in its pixels. */
      readonly tile?: readonly [number, number, number, number];
      /** The same in the small image, which has only the pieces a phone shows. */
      readonly small?: readonly [number, number, number, number];
    };

export interface PaintedShape {
  readonly name: string;
  readonly kind: 'loops' | 'disc' | 'text' | 'rim' | 'vignette';
  readonly vignette?: Vignette;
  readonly loops: readonly (readonly Vec3[])[];
  readonly curved?: readonly boolean[];
  /** How many times coarser than the half millimetre its points are kept: 1, 2 or 4. */
  readonly coarse?: number;
  readonly centre?: Vec3;
  readonly size?: number;
  /** A print's words, and where along the face (z) each is centred. */
  readonly texts?: readonly string[];
  readonly places?: readonly number[];
  /** An edge's light: the number of the shape whose outlines it runs along (0: the picture's), and of the one it is cut to. */
  readonly along?: number;
  readonly within?: number;
  /** An edge's light: its lines' strengths, from the narrowest to the one as wide as its reach. */
  readonly strengths?: readonly number[];
  /** The shape whose rendered picture has this one in it: drawn only until the still's image is in. */
  readonly on?: string;
  /** A disc that is a lamp's bloom: sized in the room's buffer pixels, not in the room (draw.ts). */
  readonly bloom?: boolean;
  /** An outline only, for the shape after it where the eye's depth along the view is more than this. */
  readonly near?: number;
  /** Shown only with the set on. */
  readonly lit?: boolean;
  /** What the picture lights: in the picture's colour, whatever it is. */
  readonly tube?: boolean;
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
  const first = (flag: 'lit' | 'tube'): number =>
    shapes.some((shape) => shape[flag]) ? shapes.findIndex((shape) => shape[flag]) : shapes.length;
  whole(first('lit'));
  whole(first('tube'));
  for (const shape of shapes) {
    // The kind, and eight more for a shape drawn only until the still's image is in.
    whole(
      (shape.bloom ? 5 : ['loops', 'disc', 'text', 'rim', 'vignette'].indexOf(shape.kind)) +
        (shape.on ? 8 : 0) +
        (shape.near === undefined ? 0 : 16),
    );
    // Sixteen more: only an outline, for the next shape in a window whose eye is nearer than this (millimetres along the view).
    if (shape.near !== undefined) signed(Math.round(shape.near * 1000));
    if (shape.kind === 'vignette') {
      // The finish's vignette: the page's stretch and where it ends in hundredths, the shape it leaves out, then how
      // much of black at each stop, in thousandths.
      const vignette = shape.vignette as Vignette;
      whole(Math.round(vignette.stretch * 100));
      whole(Math.round(vignette.end * 100));
      whole(shape.along as number);
      whole(vignette.stops.length);
      for (const stop of vignette.stops) whole(Math.round(stop * 1000));
    } else if (shape.kind === 'loops') {
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
      if (shape.kind === 'rim') {
        // The edge's shape (0: the picture's own outline), the shape it is cut to, and each line's strength, the
        // narrowest first, in hundredths.
        whole(shape.along as number);
        whole(shape.within as number);
        whole((shape.strengths as readonly number[]).length);
        for (const strength of shape.strengths as readonly number[]) whole(Math.round(strength * 100));
      }
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
      whole(['flat', 'linear', 'radial', 'field'].indexOf(paint.kind));
      if (paint.kind === 'flat') colour(paint.colour);
      else if (paint.kind === 'field') {
        // The plane and the grid's ends in the units of a point (x in two millimetres, y and z in halves).
        const [across, along] = paint.axis ? [2000, 500] : [500, 2000];
        whole(paint.axis);
        signed(Math.round(paint.plane * across));
        for (const z of paint.z) signed(Math.round(z * 2000));
        for (const v of paint.v) signed(Math.round(v * along));
        // Where the grid's lines are: a count, then each line's step from the one before it.
        for (const lines of [paint.columns, paint.rows]) {
          whole(lines.length);
          lines.forEach((line, i) => {
            if (i > 0) whole(line - (lines[i - 1] as number));
          });
        }
        // Each colour as what it has more than its neighbours foretell: the one before it in its row and the one
        // above, less the one above that one (a surface's light changes evenly from place to place).
        const kept = paint.colours.map((colour) => colour.map(clamp));
        const width = paint.columns.length;
        kept.forEach((colour, i) => {
          const [left, up, corner] = [
            i % width ? kept[i - 1] : undefined,
            kept[i - width],
            i % width ? kept[i - width - 1] : undefined,
          ];
          colour.forEach((value, channel) => {
            signed(value - ((left?.[channel] ?? 0) + (up?.[channel] ?? 0) - (corner?.[channel] ?? 0)));
          });
        });
        // Its place in the still's image; no width: none.
        for (const value of paint.tile ?? [0, 0, 0, 0]) whole(value);
        // And in the small image.
        for (const value of paint.small ?? [0, 0, 0, 0]) whole(value);
      } else if (paint.kind === 'linear') {
        point(paint.from);
        point(paint.to);
        whole(paint.stops.length * 2);
        paint.stops.forEach(colour);
      } else {
        point(paint.centre);
        length(paint.radius);
        // A circle facing the viewer is one on the plane across x: the view is four degrees off it.
        whole(paint.axis % 3);
        // A glow's stops each have a strength as well, falling outwards; else they are at full strength.
        const glow = paint.stops.some((stop) => stop[3] < 1);
        whole(paint.stops.length * 2 + (glow ? 1 : 0));
        for (const [r, g, b, strength] of paint.stops) {
          colour([r, g, b]);
          if (glow) whole(Math.round(Math.max(0, Math.min(1, strength)) * 100));
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
