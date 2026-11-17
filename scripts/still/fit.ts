/**
 * The startup still's colours (docs/ROOM.md › Startup): each paint of layers.ts fitted to the live room's own
 * pixels (live.ts). A pixel of a shot belongs to the shape the still draws there (its own camera, its own order),
 * and knows where in the room it is; a paint's stops are the middle colours of the pixels about each stop's place.
 * A glow is fitted over the still as drawn so far, so what it adds is what the live pixel still lacks.
 */
import sharp from 'sharp';
import type { StillFraming } from '../../src/app/startup/still/camera';
import { drawStill } from '../../src/app/startup/still/draw';
import { encode, type Paint, type PaintedShape, type Rgb } from './encode';
import type { Geometry, Shape } from './geometry';
import type { PaintSpec } from './layers';
import type { Picture, Shot } from './live';
import { fromPlane, type Pinhole, rasterise, toPlane, type Vec3 } from './raster';
import { cameraFor, padInsets, pinholeOf } from './world';

interface Sample {
  /** Where in the room, the colour there (sRGB bytes), which shot saw it (the lower the better) and at which pixel. */
  readonly at: Vec3;
  readonly colour: Rgb;
  readonly shot: number;
  readonly pixel: number;
  /** How much of the room it stands for: its pixel's side at its depth, squared, times the pixels it was picked from. */
  readonly area: number;
}

/** A pixel this near (screenshot px) to another shape's is mixed with it. */
const EDGE = 2;
/** A stop needs this many pixels of one shot. */
const ENOUGH = 12;
/** A shape's pixels kept from one shot, at most. */
const MOST = 60_000;

const luminance = (c: Rgb): number => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;

function middle(colours: readonly Rgb[]): Rgb {
  const channel = (i: number): number => {
    const values = colours.map((c) => c[i] as number).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] as number;
  };
  return [channel(0), channel(1), channel(2)];
}

/** The mean of the colours between two fractions of them, by brightness. */
function band(colours: readonly Rgb[], from: number, to: number): Rgb {
  const sorted = [...colours].sort((a, b) => luminance(a) - luminance(b));
  const first = Math.floor(sorted.length * from);
  const part = sorted.slice(first, Math.max(first + 1, Math.ceil(sorted.length * to)));
  if (part.length === 0) return [0, 0, 0];
  return [0, 1, 2].map((i) => part.reduce((sum, c) => sum + (c[i] as number), 0) / part.length) as unknown as Rgb;
}

/**
 * Of the samples numbered, those of the best shot: the first that has enough of them and shows at least half as much
 * of the room there as the shot that shows the most. (The nominal view sees only the near end of the opal lamp's
 * pool: what it sees of a ring round the lamp is the plant's shadow, and a wider shot has the ring.)
 */
function best(samples: readonly Sample[], numbers: readonly number[]): number[] {
  const shots = new Map<number, { own: number[]; area: number }>();
  for (const i of numbers) {
    const sample = samples[i] as Sample;
    const shot = shots.get(sample.shot) ?? { own: [], area: 0 };
    shot.own.push(i);
    shot.area += sample.area;
    shots.set(sample.shot, shot);
  }
  const most = Math.max(...[...shots.values()].map((shot) => shot.area));
  for (const [, shot] of [...shots].sort(([a], [b]) => a - b))
    if (shot.own.length >= ENOUGH && shot.area >= most / 2) return shot.own;
  return [];
}

/**
 * Where a point is along a paint: 0–1 between a linear's ends or out to a radial's radius (more: past it). A radial
 * that faces the viewer is measured on the page, as the camera of the point's shot sees it.
 */
function along(
  paint: Extract<PaintSpec, { kind: 'linear' | 'radial' }>,
  radius: number,
  p: Vec3,
  camera: Pinhole,
): number {
  if (paint.kind === 'linear') {
    const d = [0, 1, 2].map((i) => (paint.to[i] as number) - (paint.from[i] as number));
    return (
      [0, 1, 2].reduce((sum, i) => sum + ((p[i] as number) - (paint.from[i] as number)) * (d[i] as number), 0) /
      d.reduce((sum, value) => sum + value * value, 0)
    );
  }
  if (paint.axis === 3) {
    const [centre, at] = [toPlane(camera, paint.centre), toPlane(camera, p)];
    return ((Math.hypot(at[0] - centre[0], at[1] - centre[1]) / camera.scale) * centre[2]) / radius;
  }
  const d = [0, 1, 2].map((i) => (p[i] as number) - (paint.centre[i] as number)) as [number, number, number];
  return Math.hypot(d[(paint.axis + 1) % 3] as number, d[(paint.axis + 2) % 3] as number) / radius;
}

export interface Fit {
  readonly shapes: PaintedShape[];
  /** How far each shape's paints are from the live pixels: the mean difference of a channel, 0–255. */
  readonly errors: Readonly<Record<string, number>>;
}

export async function fitPaints(geometry: Geometry, framing: StillFraming, pictures: readonly Picture[]): Promise<Fit> {
  const dark = pictures.filter((picture) => !picture.shot.lit);
  const cameras = dark.map(({ shot }) =>
    pinholeOf(cameraFor(framing, shot.width, shot.height, shot.touch), shot.height, shot.density),
  );
  const samples: Sample[][] = geometry.shapes.map(() => []);
  /** Which shape the still draws last at each pixel of each shot (−1: only the wall's colour). */
  const owners: Int16Array[] = [];
  dark.forEach((picture, shot) => {
    const camera = cameras[shot] as Pinhole;
    const [w, h] = [picture.width, picture.height];
    // As the still draws them: each shape over the ones before it (the bulb's glass does not hide its filament),
    // and as deep as its own surface.
    const shapeAt = new Int16Array(w * h).fill(-1);
    const depthAt = new Float32Array(w * h);
    for (const pass of geometry.passes) {
      const raster = rasterise(camera, pass.positions, pass.triangles, [-w / 2, -h / 2, w / 2, h / 2]);
      const front = pass.behind ? rasterise(camera, pass.positions, pass.behind, undefined, raster) : null;
      for (let ry = 0; ry < raster.height; ry++)
        for (let rx = 0; rx < raster.width; rx++) {
          const [x, y] = [rx + raster.left + w / 2, ry + raster.top + h / 2];
          if (x < 0 || y < 0 || x >= w || y >= h || (raster.triangle[ry * raster.width + rx] as number) < 0) continue;
          const depth = raster.depth[ry * raster.width + rx] as number;
          if (front && (front.depth[ry * raster.width + rx] as number) < depth) continue;
          if (pass.keep && !pass.keep(fromPlane(camera, x + 0.5 - w / 2, y + 0.5 - h / 2, depth))) continue;
          shapeAt[y * w + x] = pass.shape;
          depthAt[y * w + x] = depth;
        }
    }
    owners.push(shapeAt);
    const owner = (x: number, y: number): number => shapeAt[y * w + x] as number;
    // A shape's pixels clear of its edge by two pixels, else by one, else all of them: a sliver (a board's end, a
    // wire, a jack's ring) has none of the first, and its paint takes what there is.
    const clear = (x: number, y: number, by: number): boolean => {
      const shape = owner(x, y);
      return (
        owner(x - by, y) === shape &&
        owner(x + by, y) === shape &&
        owner(x, y - by) === shape &&
        owner(x, y + by) === shape
      );
    };
    const tiers: number[][][] = [EDGE, 1, 0].map(() => geometry.shapes.map(() => []));
    for (let y = EDGE; y < h - EDGE; y++)
      for (let x = EDGE; x < w - EDGE; x++) {
        const shape = owner(x, y);
        if (shape < 0) continue;
        [EDGE, 1, 0].forEach((by, tier) => {
          if (by === 0 || clear(x, y, by)) ((tiers[tier] as number[][])[shape] as number[]).push(y * w + x);
        });
      }
    const found = geometry.shapes.map(
      (_, shape) =>
        (tiers.find((tier) => (tier[shape] as number[]).length >= ENOUGH) ?? (tiers[2] as number[][]))[
          shape
        ] as number[],
    );
    found.forEach((pixels, shape) => {
      const stride = Math.ceil(pixels.length / MOST);
      for (let i = 0; i < pixels.length; i += stride) {
        const pixel = pixels[i] as number;
        const [x, y] = [pixel % w, Math.floor(pixel / w)];
        (samples[shape] as Sample[]).push({
          at: fromPlane(camera, x + 0.5 - w / 2, y + 0.5 - h / 2, depthAt[pixel] as number),
          colour: colourOf(picture, pixel),
          shot,
          pixel,
          area: stride * ((depthAt[pixel] as number) / camera.scale) ** 2,
        });
      }
    });
  });

  const lit = pictures.find((picture) => picture.shot.lit) as Picture;
  /**
   * The pixels round a point of the room, `across` × `up` metres, each at the point's own depth: of the first shot
   * that has the patch's middle in view, for the shape numbered.
   */
  const patch = (centre: Vec3, across: number, up: number, shape: number): Sample[] => {
    for (const [shot, picture] of dark.entries()) {
      const view = cameras[shot] as Pinhole;
      const [cx, cy, depth] = toPlane(view, centre);
      const [rx, ry] = [((across / depth) * view.scale) / 2, ((up / depth) * view.scale) / 2];
      // A glow's patch may run off the page, its middle may not.
      if (Math.abs(cx) > picture.width / 2 - Math.min(rx, 40) || Math.abs(cy) > picture.height / 2 - Math.min(ry, 40))
        continue;
      const found: Sample[] = [];
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
          const [px, py] = [x + picture.width / 2, y + picture.height / 2];
          if (px < 0 || py < 0 || px >= picture.width || py >= picture.height) continue;
          const pixel = py * picture.width + px;
          // Not where a later shape is drawn over it: that pixel is the later shape's.
          if (((owners[shot] as Int16Array)[pixel] as number) > shape) continue;
          found.push({
            at: fromPlane(view, x + 0.5, y + 0.5, depth),
            colour: colourOf(picture, pixel),
            shot,
            pixel,
            area: 1,
          });
        }
      return found;
    }
    return [];
  };

  const errors: Record<string, number> = {};
  const missing: string[] = [];
  const shapes: PaintedShape[] = [];
  for (const shape of geometry.shapes) {
    const index = shapes.length;
    let own = samples[index] as Sample[];
    /** The live pixel a sample is fitted to, and what is under a glow there before any of the still is. */
    let live = (sample: Sample): Rgb => sample.colour;
    let ground: ((sample: Sample) => Rgb) | null = null;
    if (shape.kind === 'text') {
      // The print's ink: the brightest of the pixels its line covers.
      own = patch(
        shape.centre as Vec3,
        (shape.size as number) * 0.5 * ((shape.texts as readonly string[])[0] as string).length,
        shape.size as number,
        Infinity,
      );
    } else if (shape.kind === 'rim') {
      // The picture's light along an outline: the lit shot's pixels a quarter of its width inside the outline's
      // points, towards its middle.
      const view = cameras[0] as Pinhole;
      const middle = toPlane(view, shape.centre as Vec3);
      own = shape.loops.flat().flatMap((point): Sample[] => {
        const [x, y, depth] = toPlane(view, point);
        const reach = (((shape.size as number) / 4 / depth) * view.scale) / Math.hypot(x - middle[0], y - middle[1]);
        const [px, py] = [
          Math.round(x - (x - middle[0]) * reach + lit.width / 2),
          Math.round(y - (y - middle[1]) * reach + lit.height / 2),
        ];
        if (px < 0 || py < 0 || px >= lit.width || py >= lit.height) return [];
        const pixel = py * lit.width + px;
        return [-1, 0, 1].map((dx) => ({
          at: point,
          colour: colourOf(lit, pixel + dx),
          shot: 0,
          pixel: pixel + dx,
          area: 1,
        }));
      });
    } else if (shape.kind === 'disc' && own.length === 0) {
      const flat = shape.paints[0]?.kind === 'flat';
      // A hole of a round part shows what is in its middle; a glow lights all it reaches.
      const size = (shape.size as number) * (flat ? 1.2 : 2);
      own = patch(shape.centre as Vec3, size, size, shape.lit ? Infinity : index);
      if (shape.lit) {
        // A light of the set that is on only when the set is: the lit shot over the dark one.
        live = (sample) => colourOf(lit, sample.pixel);
        ground = (sample) => sample.colour;
      }
    }
    const every = own.map((_, i) => i);
    if (best(own, every).length === 0) {
      missing.push(shape.name);
      shapes.push({ ...shape, paints: [] });
      continue;
    }

    const paints: Paint[] = [];
    const painted = (): PaintedShape => ({ ...shape, paints: [...paints] });
    for (const [n, spec] of shape.paints.entries()) {
      if (spec.kind === 'flat') {
        const colours = best(own, every).map((i) => live(own[i] as Sample));
        paints.push({ kind: 'flat', colour: spec.bright ? band(colours, 0.85, 1) : middle(colours) });
        continue;
      }
      const glow = spec.kind === 'radial' && spec.glow === true;
      const glows = shape.paints.slice(n + 1).some((paint) => paint.kind === 'radial' && paint.glow);
      // Under a glow: the still as drawn so far, in each shot its samples are of.
      const under = new Map<number, Uint8Array>();
      if (glow && !ground)
        for (const shot of new Set(own.map((sample) => sample.shot)))
          under.set(shot, await render(framing, [...shapes, painted()], (dark[shot] as Picture).shot));
      const below = (sample: Sample): Rgb =>
        ground ? ground(sample) : colourOf({ rgb: under.get(sample.shot) as Uint8Array }, sample.pixel);
      const offsets = Array.from({ length: spec.stops }, (_, i) => i / (spec.stops - 1));
      const fitted = (radius: number): number[][] => {
        const places = own.map((sample) => along(spec, radius, sample.at, cameras[sample.shot] as Pinhole));
        // A glow's own colour: the brightest of what it lights.
        const peak = glow
          ? band(
              every.filter((i) => (places[i] as number) <= 1).map((i) => live(own[i] as Sample)),
              0.98,
              1,
            )
          : null;
        const stops = offsets.map((t, stop): number[] | null => {
          // A stop's pixels: nearer to it than to its neighbours.
          const from = stop === 0 ? -Infinity : (t + (offsets[stop - 1] as number)) / 2;
          const to =
            stop === offsets.length - 1
              ? glow
                ? t + (t - (offsets[stop - 1] as number)) / 2
                : Infinity
              : (t + (offsets[stop + 1] as number)) / 2;
          const within = every.filter((i) => (places[i] as number) >= from && (places[i] as number) < to);
          // The best shot's: the nominal view's where it shows the place, since a wider window that has a lamp in it
          // has the finish's bloom of that lamp too, which the windows without it do not.
          const near = best(own, within);
          if (near.length === 0) return null;
          if (!peak) {
            const colours = near.map((i) => live(own[i] as Sample));
            // Under glows the surface's own colour is its darker pixels' there, out of their light.
            return [...(glows ? band(colours, 0.1, 0.3) : middle(colours)), 1];
          }
          // How much of the glow's colour over what is under it gives the live pixel: the middle of the samples'.
          const strengths = near
            .map((i) => {
              const sample = own[i] as Sample;
              const [base, target] = [below(sample), live(sample)];
              const span = peak.map((value, channel) => value - (base[channel] as number));
              const size = span.reduce((sum, value) => sum + value * value, 0);
              if (size < 1) return 0;
              const lift = span.reduce(
                (sum, value, channel) => sum + value * ((target[channel] as number) - (base[channel] as number)),
                0,
              );
              return Math.max(0, Math.min(1, lift / size));
            })
            .sort((a, b) => a - b);
          return [...peak, strengths[Math.floor(strengths.length / 2)] as number];
        });
        // A stop no shot shows takes its neighbour's colour (a glow's: none of it).
        return stops.map((stop, i) => {
          if (stop) return stop;
          if (peak) return [...peak, 0];
          for (let reach = 1; reach < stops.length; reach++) {
            const other = stops[i - reach] ?? stops[i + reach];
            if (other) return other;
          }
          throw new Error(`No shot shows any stop of the still's "${shape.name}"`);
        });
      };
      let radius = spec.kind === 'radial' ? spec.radius : 1;
      let stops = fitted(radius);
      if (glow) {
        // A glow ends where it no longer shows; its stops are spent on the part that does.
        const end = stops.findLastIndex((stop) => (stop[3] as number) >= 0.02) + 1;
        if (end > 0 && end < stops.length - 1) {
          radius *= end / (stops.length - 1);
          stops = fitted(radius);
        }
        // Falling all the way out, to nothing: a glow that rose again would show as a ring.
        (stops.at(-1) as number[])[3] = 0;
        for (let i = stops.length - 2; i >= 0; i--)
          if (i > 0)
            (stops[i - 1] as number[])[3] = Math.max(
              (stops[i - 1] as number[])[3] as number,
              (stops[i] as number[])[3] as number,
            );
      }
      if (spec.kind === 'linear')
        paints.push({
          kind: 'linear',
          from: spec.from,
          to: spec.to,
          stops: stops.map(([r, g, b]) => [r, g, b] as unknown as Rgb),
        });
      else
        paints.push({
          kind: 'radial',
          centre: spec.centre,
          radius,
          axis: spec.axis,
          stops: stops as unknown as [number, number, number, number][],
        });
    }
    shapes.push(painted());
  }
  if (missing.length > 0)
    throw new Error(`No shot shows the still's ${missing.join(', ')}: add one to scripts/still/live.ts`);

  // How near the whole still is to each shot, shape by shape.
  const sums = geometry.shapes.map(() => [0, 0]);
  for (const [shot, picture] of dark.entries()) {
    const made = await render(framing, shapes, picture.shot);
    samples.forEach((own, shape) => {
      for (const sample of own) {
        if (sample.shot !== shot) continue;
        const sum = sums[shape] as number[];
        for (let channel = 0; channel < 3; channel++)
          sum[0] =
            (sum[0] as number) +
            Math.abs((made[sample.pixel * 3 + channel] as number) - (sample.colour[channel] as number)) / 3;
        sum[1] = (sum[1] as number) + 1;
      }
    });
  }
  geometry.shapes.forEach((shape, i) => {
    const [sum, count] = sums[i] as [number, number];
    if (count > 0) errors[shape.name] = sum / count;
  });
  return { shapes, errors };
}

function colourOf(picture: { readonly rgb: Uint8Array }, pixel: number): Rgb {
  return [picture.rgb[pixel * 3] as number, picture.rgb[pixel * 3 + 1] as number, picture.rgb[pixel * 3 + 2] as number];
}

/** The still as the page would draw these shapes for a shot's viewport, at the shot's size: sRGB, three bytes a pixel. */
export async function render(framing: StillFraming, shapes: readonly PaintedShape[], shot: Shot): Promise<Uint8Array> {
  const { data, texts } = encode(framing, shapes);
  const drawn = drawStill(data, texts, shot.width, shot.height, padInsets(shot.width, shot.height, shot.touch));
  // A still without its last shapes yet has no group to close.
  const svg = drawn.svg.includes('<g>') ? drawn.svg : drawn.svg.replace('</g>', '');
  const [width, height] = [shot.width * shot.density, shot.height * shot.density];
  // As the page has it: its size, and the print's face (index.html › .tv-still text).
  const document = svg.replace(
    /^<svg [^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" width="${width}" height="${height}" viewBox="0 0 ${shot.width} ${shot.height}"><style>text{font-family:Helvetica,Arial,sans-serif;font-weight:600;text-anchor:middle;dominant-baseline:central}</style>`,
  );
  const { data: rgb } = await sharp(Buffer.from(document), { density: 72 })
    .flatten({ background: '#000' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(rgb);
}

export type { Shape };
