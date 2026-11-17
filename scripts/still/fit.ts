/**
 * The startup still's colours (docs/ROOM.md › Startup): each paint of layers.ts fitted to the live room's own
 * pixels (live.ts). A pixel of a shot belongs to the shape the still draws there (its own camera, its own order),
 * and knows where in the room it is; a paint's stops are the middle colours of the pixels about each stop's place.
 * A glow is fitted over the still as drawn so far, so what it adds is what the live pixel still lacks.
 */
import sharp from 'sharp';
import type { StillFraming } from '../../src/app/startup/still/camera';
import { drawStill } from '../../src/app/startup/still/draw';
import { encode, FIELD_STEPS, type Paint, type PaintedShape, type Rgb } from './encode';
import { vignetteAt } from './finish';
import type { Geometry, Shape } from './geometry';
import type { PaintSpec } from './layers';
import type { Picture, Shot } from './live';
import { fromPlane, type Pinhole, rasterise, toPlane, type Vec3 } from './raster';
import { svgField } from './svgField';
import { cameraFor, FAMILY, padInsets, pinholeOf } from './world';

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
/** A glow is at full strength where it lifts a channel by this many levels or more. */
const GLOW_FULL = 64;
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
  /** How much larger than in the room it is drawn in the point's shot (a lamp's bloom). */
  grow = 1,
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
    return ((Math.hypot(at[0] - centre[0], at[1] - centre[1]) / camera.scale) * centre[2]) / (radius * grow);
  }
  const d = [0, 1, 2].map((i) => (p[i] as number) - (paint.centre[i] as number)) as [number, number, number];
  return Math.hypot(d[(paint.axis + 1) % 3] as number, d[(paint.axis + 2) % 3] as number) / radius;
}

export interface Fit {
  readonly shapes: PaintedShape[];
  /** How far each shape's paints are from the live pixels: the mean difference of a channel, 0–255. */
  readonly errors: Readonly<Record<string, number>>;
  /** The still's image: every field's rendered picture, side by side (sRGB, three bytes a pixel). */
  readonly image: { readonly width: number; readonly height: number; readonly rgb: Uint8Array };
  /** The same for a phone: the pieces a phone's window shows, with fewer texels. */
  readonly small: Fit['image'];
}

export async function fitPaints(
  geometry: Geometry,
  framing: StillFraming,
  shown: readonly Picture[],
  /** The image's texels as a part of their full number along each side (build.ts › --texels). */
  fineness = 1,
): Promise<Fit> {
  // The still lays the finish's vignette over itself as the room's finish does: its colours are the room's without it.
  const vignette = geometry.shapes.find((shape) => shape.vignette)?.vignette;
  const pictures = shown.map((picture): Picture => {
    if (!vignette) return picture;
    const rgb = new Uint8Array(picture.rgb.length);
    const { density } = picture.shot;
    for (let y = 0; y < picture.height; y++)
      for (let x = 0; x < picture.width; x++) {
        const kept =
          1 - vignetteAt(vignette, (x + 0.5) / density, (y + 0.5) / density, picture.shot.width, picture.shot.height);
        for (let channel = 0; channel < 3; channel++) {
          const at = (y * picture.width + x) * 3 + channel;
          rgb[at] = Math.min(255, Math.round((picture.rgb[at] as number) / kept));
        }
      }
    return { ...picture, rgb };
  });
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
  // A glow (a lamp's halo, the power lamp's) is laid over the shapes before it. They are fitted first to the pixels
  // out of every glow's reach, the glows over them; then again, each to the room's pixels less the glows over it, and
  // the glows again over that.
  /** The room's buffer pixels a CSS pixel in a shot (top tier: stage/quality.ts › pixelRatioFor). */
  const ratioOf = (shot: Shot): number => Math.min(shot.density, 2, Math.sqrt(3e6 / (shot.width * shot.height)));
  /** How much larger than in the room a lamp's bloom is in a shot: as many buffer pixels as in the nominal view (draw.ts). */
  const growOf = (shape: Shape, shot: number): number => {
    if (!shape.bloom) return 1;
    const buffer = (index: number): number => {
      const [camera, picture] = [cameras[index] as Pinhole, dark[index] as Picture];
      return (camera.scale / toPlane(camera, shape.centre as Vec3)[2] / picture.shot.density) * ratioOf(picture.shot);
    };
    return Math.sqrt(buffer(0) / buffer(shot));
  };
  const glows = geometry.shapes.flatMap((shape, index) =>
    shape.kind === 'disc' && shape.paints.some((paint) => paint.kind === 'radial' && paint.glow) ? [index] : [],
  );
  // The set's print is drawn over the face it is on: the face's own samples are the ones clear of every word.
  geometry.shapes.forEach((print, index) => {
    if (print.kind !== 'text') return;
    const [centre, size] = [print.centre as Vec3, print.size as number];
    const words = (print.texts as readonly string[]).map((text, i) => {
      const [middle, half] = [(print.places as readonly number[])[i] as number, (text.length * size) / 2];
      return [middle - half, middle + half] as const;
    });
    for (let shape = 0; shape < index; shape++)
      samples[shape] = (samples[shape] as Sample[]).filter(
        ({ at }) =>
          Math.abs(at[0] - centre[0]) > 0.02 ||
          Math.abs(at[1] - centre[1]) > size ||
          !words.some(([from, to]) => at[2] > from && at[2] < to),
      );
  });
  const reached = (index: number, sample: Sample): boolean =>
    glows.some((glow) => {
      if (glow <= index) return false;
      const [disc, picture, camera] = [
        geometry.shapes[glow] as Shape,
        dark[sample.shot] as Picture,
        cameras[sample.shot] as Pinhole,
      ];
      const centre = toPlane(camera, disc.centre as Vec3);
      const x = (sample.pixel % picture.width) + 0.5 - picture.width / 2;
      const y = Math.floor(sample.pixel / picture.width) + 0.5 - picture.height / 2;
      return (
        Math.hypot(x - centre[0], y - centre[1]) <=
        ((disc.size as number) / centre[2]) * camera.scale * growOf(disc, sample.shot)
      );
    });
  /**
   * The pixels round a point of the room, `across` × `up` metres, each at the point's own depth: of the first shot
   * that has the patch's middle in view, for the shape numbered.
   */
  const patch = (centre: Vec3, across: number, up: number, shape: number, every = false): Sample[] => {
    const all: Sample[] = [];
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
      if (!every) return found;
      all.push(...found);
    }
    return all;
  };

  /**
   * The picture's light along an edge: how much of the picture's colour each of its lines lays down, from the room
   * with a white picture beside the room with a black one, in the nominal view. A line's pixels are those the page
   * draws it on; where only the lines from one on reach, their strengths together are the room's there.
   */
  const fitRim = async (shape: Shape, before: readonly PaintedShape[]): Promise<PaintedShape> => {
    const [black, white] = [
      shown[pictures.indexOf(dark[0] as Picture)] as Picture,
      shown[pictures.indexOf(lit)] as Picture,
    ];
    // The shapes before it only as outlines, and nothing of the vignette.
    const bare = before.map(
      (other): PaintedShape => ({
        ...other,
        paints: [],
        vignette: other.vignette && { ...other.vignette, stops: other.vignette.stops.map(() => 0) },
      }),
    );
    const lines = (shape.strengths as readonly number[]).length;
    const gains: number[] = [];
    let narrower: Uint8Array | null = null;
    for (let line = 0; line < lines; line++) {
      const only = { ...shape, paints: [], strengths: Array.from({ length: lines }, (_, i) => (i === line ? 1 : 0)) };
      const drawn = await render(framing, [...bare, only], black.shot, true);
      const values: number[] = [];
      for (let pixel = 0; pixel < black.width * black.height; pixel++) {
        if ((drawn[pixel * 4 + 3] as number) < 250 || (narrower && (narrower[pixel * 4 + 3] as number) > 5)) continue;
        let gain = 0;
        for (let channel = 0; channel < 3; channel++) {
          const [from, to] = [black.rgb[pixel * 3 + channel] as number, white.rgb[pixel * 3 + channel] as number];
          gain += (to - from) / (255 - from) / 3;
        }
        values.push(gain);
      }
      values.sort((a, b) => a - b);
      gains.push(Math.max(0, Math.min(0.99, values[values.length >> 1] ?? 0)));
      narrower = drawn;
    }
    // Screened one over the other: the widest line alone gives its band; each narrower one what its band still lacks.
    const strengths = gains.map((gain, line) => {
      const outer = gains[line + 1] ?? 0;
      return Math.max(0, 1 - (1 - gain) / (1 - Math.min(gain, outer)));
    });
    return { ...shape, paints: [], strengths };
  };

  /** Whether a light of the set, drawn after the shape numbered, is bright at a pixel of a shot. */
  const underLight = (
    layers: ReadonlyMap<number, readonly Uint8Array[]>,
    index: number,
    shot: number,
    pixel: number,
  ): boolean =>
    glows.some(
      (glow) =>
        glow > index &&
        (geometry.shapes[glow] as Shape).lit === true &&
        (((layers.get(glow) as readonly Uint8Array[])[shot] as Uint8Array)[pixel * 4 + 3] as number) > LIT * 255,
    );

  const errors: Record<string, number> = {};
  const missing: string[] = [];
  /** One fitting of every shape; `over`: each glow alone as the still draws it for each shot (RGBA), from the fitting before. */
  const pass = async (over: ReadonlyMap<number, readonly Uint8Array[]> | null): Promise<PaintedShape[]> => {
    const shapes: PaintedShape[] = [];
    for (const shape of geometry.shapes) {
      const index = shapes.length;
      if (shape.kind === 'vignette' || shape.near !== undefined) {
        shapes.push({ ...shape, paints: [] });
        continue;
      }
      if (shape.kind === 'rim') {
        shapes.push(await fitRim(shape, shapes));
        continue;
      }
      let own = samples[index] as Sample[];
      if (!over) {
        const clear = own.filter((sample) => !reached(index, sample));
        if (clear.length >= ENOUGH) own = clear;
      } else if (shape.paints.some((paint) => paint.kind === 'field')) {
        // A surface's grid is the set that is off: not fitted where a light of the set is bright on it.
        const clear = own.filter((sample) => !underLight(over, index, sample.shot, sample.pixel));
        if (clear.length >= ENOUGH) own = clear;
      }
      /** The live pixel a sample is fitted to: the room's, less the glows the still lays over this shape. */
      const live = (sample: Sample): Rgb => {
        if (!over) return sample.colour;
        const colour: number[] = [...sample.colour];
        for (const glow of [...glows].reverse()) {
          if (glow <= index) continue;
          const layer = (over.get(glow) as readonly Uint8Array[])[sample.shot] as Uint8Array;
          const strength = (layer[sample.pixel * 4 + 3] as number) / 255;
          if (strength > 0 && strength < 0.9)
            for (let channel = 0; channel < 3; channel++)
              colour[channel] = Math.max(
                0,
                ((colour[channel] as number) - (layer[sample.pixel * 4 + channel] as number) * strength) /
                  (1 - strength),
              );
        }
        return colour as unknown as Rgb;
      };
      const ground = null as ((sample: Sample) => Rgb) | null;
      if (shape.kind === 'text') {
        // The print's ink: the brightest of the pixels its line covers.
        own = patch(
          shape.centre as Vec3,
          (shape.size as number) * 0.5 * ((shape.texts as readonly string[])[0] as string).length,
          shape.size as number,
          Infinity,
        );
      } else if (shape.kind === 'disc' && own.length === 0) {
        const flat = shape.paints[0]?.kind === 'flat';
        // A hole of a round part shows what is in its middle; a glow lights all it reaches.
        const size = (shape.size as number) * (flat ? 1.2 : 2);
        // A light of the set: from every shot that shows it.
        own = patch(shape.centre as Vec3, size, size, shape.lit ? Infinity : index, shape.lit);
        // A glow about a part drawn after it (the power lamp's lens in its halo) is fitted to the pixels round that part.
        const part = geometry.shapes[index + 1];
        if (!flat && part?.kind === 'disc' && part.centre?.every((value, i) => value === shape.centre?.[i]))
          own = own.filter(
            ({ at }) =>
              Math.hypot(
                at[0] - (part.centre as Vec3)[0],
                at[1] - (part.centre as Vec3)[1],
                at[2] - (part.centre as Vec3)[2],
              ) >
              (part.size as number) * 1.5,
          );
      }
      // What is drawn over the vignette has the room's colours as they are.
      const after = geometry.shapes.findIndex((other) => other.kind === 'vignette');
      if (after >= 0 && index > after)
        own = own.map((sample) => ({
          ...sample,
          colour: colourOf(shown[pictures.indexOf(dark[sample.shot] as Picture)] as Picture, sample.pixel),
        }));
      const every = own.map((_, i) => i);
      if (best(own, every).length === 0) {
        missing.push(shape.name);
        shapes.push({ ...shape, paints: [] });
        continue;
      }

      const paints: Paint[] = [];
      const painted = (): PaintedShape => ({ ...shape, paints: [...paints] });
      for (const [n, spec] of shape.paints.entries()) {
        if (spec.kind === 'field') {
          paints.push(
            fitField(
              // A surface with a piece of the image needs its grid only until the image is in, and under it for
              // the soft light: six tenths of the lines.
              spec.plain
                ? spec
                : {
                    ...spec,
                    columns: Math.max(2, Math.round(spec.columns * COARSE)),
                    rows: Math.max(2, Math.round(spec.rows * COARSE)),
                  },
              own.map((sample) => ({ ...sample, colour: live(sample) })),
              dark.map(({ shot }) => shot),
              cameras,
              framing,
              !over,
            ),
          );
          continue;
        }
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
        // A glow's stops are closer together in the middle, as the page draws them (draw.ts).
        const offsets = Array.from({ length: spec.stops }, (_, i) => (i / (spec.stops - 1)) ** (glow ? 2 : 1));
        const fitted = (radius: number): number[][] => {
          const places = own.map((sample) =>
            along(spec, radius, sample.at, cameras[sample.shot] as Pinhole, growOf(shape, sample.shot)),
          );
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
            // A light of the set blooms differently in every window (its lens is a pixel or two of the finish's):
            // the middle of them all.
            const near = shape.lit || over ? within : best(own, within);
            if (near.length === 0) return null;
            const colours = near.map((i) => live(own[i] as Sample));
            if (!glow) {
              // Under glows the surface's own colour is its darker pixels' there, out of their light.
              return [...(glows ? band(colours, 0.1, 0.3) : middle(colours)), 1];
            }
            // A glow's stop: what the room has there more than the still so far, as a colour laid over it at a
            // strength, the less of it the smaller the difference.
            let [target, base] = [middle(colours), middle(near.map((i) => below(own[i] as Sample)))];
            if (shape.lit) {
              // A light of the set: each shot's own middle, and the middle of those, whatever the shots' sizes.
              // (Of the two windows most visitors have, a desktop's and a phone's, where they show it: its bloom is
              // twice as bright in one window as in another, and the middle of all nine was neither's.)
              const all = [...new Set(near.map((i) => (own[i] as Sample).shot))];
              const common = all.filter((shot) => COMMON.includes((dark[shot] as Picture).shot.name));
              const shots = (common.length ? common : all).map((shot) =>
                near.filter((i) => (own[i] as Sample).shot === shot),
              );
              // Each shot's own middle, and the mean of those, whatever the shots' sizes.
              const mean = (colours: readonly Rgb[]): Rgb =>
                [0, 1, 2].map(
                  (channel) => colours.reduce((sum, colour) => sum + (colour[channel] as number), 0) / colours.length,
                ) as unknown as Rgb;
              target = mean(shots.map((part) => middle(part.map((i) => live(own[i] as Sample)))));
              base = mean(shots.map((part) => middle(part.map((i) => below(own[i] as Sample)))));
            }
            const lift = Math.max(...target.map((value, channel) => Math.abs(value - (base[channel] as number))));
            const strength = Math.round(Math.min(1, lift / GLOW_FULL) * 100) / 100;
            if (strength < 0.02) return [...target, 0];
            return [
              ...target.map((value, channel) =>
                Math.max(0, Math.min(255, (base[channel] as number) + (value - (base[channel] as number)) / strength)),
              ),
              strength,
            ];
          });
          // A stop no shot shows takes its neighbour's colour (a glow's: none of it).
          return stops.map((stop, i) => {
            if (stop) return stop;
            if (glow) return stops.slice(i).find((other) => other !== null) ?? [0, 0, 0, 0];
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
            radius *= offsets[end] as number;
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
        if (glow)
          // A stop of no strength has the colour of the one inside it: between them only the strength falls.
          stops.forEach((stop, i) => {
            const inner = stops[i - 1];
            if (inner && (stop[3] as number) === 0)
              stops[i] = [inner[0] as number, inner[1] as number, inner[2] as number, 0];
          });
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
    return shapes;
  };

  let shapes = await pass(null);
  let over = new Map<number, Uint8Array[]>();
  for (let again = 0; again < 3 && missing.length === 0; again++) {
    over = new Map<number, Uint8Array[]>();
    for (const glow of glows)
      over.set(
        glow,
        await Promise.all(dark.map((picture) => render(framing, [shapes[glow] as PaintedShape], picture.shot, true))),
      );
    shapes = await pass(over);
  }
  if (missing.length > 0)
    throw new Error(`No shot shows the still's ${missing.join(', ')}: add one to scripts/still/live.ts`);

  // The still's image: each field's surface as the room renders it, laid flat on the field's own plane. A texel is
  // the room's pixel there in the first shot that shows the surface at that place (the nominal view's where it has
  // it; a nearer or a further eye sees behind the set and the props), less the glows the still lays over it, with
  // the finish's vignette out of it; where no shot shows it, the field's own colour.
  const after = geometry.shapes.findIndex((other) => other.kind === 'vignette');
  /** The image at a part of its full texels a side, of the shapes wanted; each piece's place goes into its paint as `key`. */
  const imageOf = (part: number, wanted: (shape: number) => boolean, key: 'tile' | 'small'): Fit['image'] => {
    const tiles: { shape: number; paint: number; width: number; height: number; rgb: Uint8Array }[] = [];
    // The shots from the nominal view's own eye (the windows that frame the whole set from the room's standing place).
    const nominalEye = (cameras[0] as Pinhole).eye;
    const nominalView = cameraFor(framing, 1440, 900, false);
    const sameEye = cameras.map((camera) =>
      camera.eye.every((value, i) => Math.abs(value - (nominalEye[i] as number)) < 1e-3),
    );
    shapes.forEach((shape, index) => {
      shape.paints.forEach((paint, n) => {
        const spec = (geometry.shapes[index] as Shape).paints[n];
        if (paint.kind !== 'field' || (spec?.kind === 'field' && spec.plain) || !wanted(index)) return;
        const [z0, z1] = paint.z;
        const [v0, v1] = paint.v;
        // The piece is the surface as the nominal view's page has it (draw.ts lays it from there onto any window's
        // page): its rows are the page's rows from the surface's first row to its last, its columns the page's from
        // the leftmost of its corners to the rightmost.
        const across = (t: number): [number, number, number] => {
          const v = v0 + (v1 - v0) * t;
          const [from, to] = [z0, z1].map((z) =>
            nominalView.project(paint.axis ? [v, paint.plane, z] : [paint.plane, v, z]),
          );
          return [(from as number[])[0] as number, (to as number[])[0] as number, (from as number[])[1] as number];
        };
        const [first, last] = [across(0), across(1)];
        const leftmost = Math.min(first[0], first[1], last[0], last[1]);
        const [spanX, spanY] = [Math.max(first[0], first[1], last[0], last[1]) - leftmost, last[2] - first[2]];
        const density =
          fineness *
          part *
          Math.min(TEXELS, Math.sqrt(TILE_MOST / (spanX * spanY)), (IMAGE_WIDTH - 2 * GUTTER) / Math.max(spanX, spanY));
        const [width, height] = [Math.max(2, Math.round(spanX * density)), Math.max(2, Math.round(spanY * density))];
        /** Each row of the piece on the surface: how far down it (0–1), and its ends on the nominal page. */
        const rowsOf = Array.from({ length: height }, (_, ty) => {
          const y = first[2] + ((ty + 0.5) / height) * spanY;
          let [low, high] = [0, 1];
          for (let i = 0; i < 30; i++) {
            const middle = (low + high) / 2;
            if (across(middle)[2] < y) low = middle;
            else high = middle;
          }
          const t = (low + high) / 2;
          const [from, to] = across(t);
          return [t, from, to] as const;
        });
        /** A texel's place on the surface: 0–1 along its rows and down them (outside that: off the surface). */
        const placeOf = (tx: number, ty: number): [number, number] => {
          const [t, from, to] = rowsOf[ty] as readonly [number, number, number];
          return [(leftmost + ((tx + 0.5) / width) * spanX - from) / (to - from), t];
        };
        // The shapes drawn on this one that its picture has in it (the print has no shape of its own in a shot).
        const own = new Set([index, ...geometry.shapes.flatMap((other, i) => (other.on === shape.name ? [i] : []))]);
        const seen = after >= 0 && index > after ? shown : pictures;
        const rgb = new Uint8Array(width * height * 3);
        // What the shots gave of each texel (their colours times how much of the texel they gave), and the field there.
        const [taken, soft, had, spots] = [
          new Float32Array(width * height * 3),
          new Float32Array(width * height * 3),
          new Float32Array(width * height),
          new Float32Array(width * height * 2),
        ];
        /** The texels a light of the set is bright on in the shot they are from. */
        const zone = new Uint8Array(width * height);
        for (let ty = 0; ty < height; ty++)
          for (let tx = 0; tx < width; tx++) {
            const [s, t] = placeOf(tx, ty);
            spots[(ty * width + tx) * 2] = s;
            spots[(ty * width + tx) * 2 + 1] = t;
            for (const [channel, value] of fieldAt(paint, s, t).entries())
              soft[(ty * width + tx) * 3 + channel] = value;
            // Off the surface's ends: no texel of it but the field's (the outline cuts the piece inside them).
            if (s < -0.02 || s > 1.02) continue;
            const [z, v] = [z0 + (z1 - z0) * s, v0 + (v1 - v0) * t];
            const place: Vec3 = paint.axis ? [v, paint.plane, z] : [paint.plane, v, z];
            // Shot by shot: each gives the part of the texel the shots before it left, less of it near its page's
            // edge, so one shot's picture goes over into the next's without a seam.
            const colour = [0, 0, 0];
            let left = 1;
            for (let shot = 0; shot < dark.length && left > 0.01; shot++) {
              const picture = dark[shot] as Picture;
              const [x, y, depth] = toPlane(cameras[shot] as Pinhole, place);
              const [px, py] = [x + picture.width / 2 - 0.5, y + picture.height / 2 - 0.5];
              const [ix, iy] = [Math.round(px), Math.round(py)];
              if (depth <= 0 || ix < 2 || iy < 2 || ix >= picture.width - 2 || iy >= picture.height - 2) continue;
              const map = owners[shot] as Int16Array;
              const pixel = iy * picture.width + ix;
              if (![0, -1, 1, -picture.width, picture.width].every((step) => own.has(map[pixel + step] as number)))
                continue;
              // Another eye than the nominal view's sees a lamp's bloom on another part of the surface behind it: of
              // such a shot, only what is out of every glow's reach.
              const sample: Sample = { at: place, colour: [0, 0, 0], shot, pixel, area: 1 };
              if (!sameEye[shot] && reached(index, sample)) continue;
              const from = (seen[pictures.indexOf(picture)] as Picture).rgb;
              const [fx, fy] = [Math.floor(px), Math.floor(py)];
              const [ax, ay] = [px - fx, py - fy];
              let found = [0, 1, 2].map((channel) => {
                const at = (dx: number, dy: number): number =>
                  from[((fy + dy) * picture.width + fx + dx) * 3 + channel] as number;
                return (at(0, 0) * (1 - ax) + at(1, 0) * ax) * (1 - ay) + (at(0, 1) * (1 - ax) + at(1, 1) * ax) * ay;
              });
              // How much of the pixel is the surface's own: none of it under a light of the set (the image is the set
              // that is off); and none under a lamp's bloom where the surface is well behind the lamp, since from
              // another eye the bloom is over another part of it (there the field's colour, and the bloom drawn over).
              let kept = 1;
              let lit = false;
              for (const glow of [...glows].reverse()) {
                if (glow <= index) continue;
                const layer = (over.get(glow) as readonly Uint8Array[])[shot] as Uint8Array;
                const strength = (layer[pixel * 4 + 3] as number) / 255;
                if (strength <= 0) continue;
                const light = geometry.shapes[glow] as Shape;
                const behind = Math.abs(place[0] - (light.centre as Vec3)[0]) > BEHIND;
                if (light.lit) lit ||= strength > LIT;
                else if (behind) kept *= Math.max(0, 1 - strength / 0.12);
                found = found.map(
                  (value, channel) =>
                    (value - (layer[pixel * 4 + channel] as number) * strength) / (1 - Math.min(0.9, strength)),
                );
              }
              const edge = Math.min(ix, iy, picture.width - 1 - ix, picture.height - 1 - iy) / picture.shot.density;
              const share = left * kept * Math.min(1, edge / FEATHER);
              if (lit && share > 0) zone[ty * width + tx] = 1;
              found.forEach((value, channel) => {
                colour[channel] = (colour[channel] as number) + value * share;
              });
              left -= share;
            }
            const at = ty * width + tx;
            had[at] = 1 - left;
            for (let channel = 0; channel < 3; channel++) taken[at * 3 + channel] = colour[channel] as number;
          }
        // The texel: the field's colour there, which is fitted to every shot at once, and over it what the shots'
        // own picture has finer than a field (the picture less the field of the same grid that is nearest to it):
        // the hard shadows, the boards, a prop's own shading. So the soft light is the one every window agrees on,
        // not the nominal view's with its own bloom and sheen in it.
        const [columns, rows] = [paint.columns.length, paint.rows.length];
        const count = columns * rows;
        const normal = new Float64Array(count * count);
        const right = [new Float64Array(count), new Float64Array(count), new Float64Array(count)];
        const nodes = (tx: number, ty: number): [number, number][] => {
          const [[column, a], [row, b]] = [
            fieldSpan(paint.columns, spots[(ty * width + tx) * 2] as number),
            fieldSpan(paint.rows, spots[(ty * width + tx) * 2 + 1] as number),
          ];
          const first = row * columns + column;
          return [
            [first, (1 - a) * (1 - b)],
            [first + 1, a * (1 - b)],
            [first + columns, (1 - a) * b],
            [first + columns + 1, a * b],
          ];
        };
        let trace = 0;
        for (let ty = 0; ty < height; ty++)
          for (let tx = 0; tx < width; tx++) {
            const at = ty * width + tx;
            const weight = had[at] as number;
            if (weight < 0.5) continue;
            const found = nodes(tx, ty);
            for (const [i, wi] of found) {
              for (const [j, wj] of found) normal[i * count + j] = (normal[i * count + j] as number) + wi * wj;
              trace += wi * wi;
              right.forEach((channel, c) => {
                channel[i] = (channel[i] as number) + (wi * (taken[at * 3 + c] as number)) / weight;
              });
            }
          }
        // A node the picture does not reach has the joint field's own colour, so no detail comes of it.
        const hold = (trace / count) * 1e-3 + 1e-6;
        for (let i = 0; i < count; i++) {
          normal[i * count + i] = (normal[i * count + i] as number) + hold;
          right.forEach((channel, c) => {
            channel[i] = (channel[i] as number) + hold * ((paint.colours[i] as Rgb)[c] as number);
          });
        }
        const nearest = solve(normal, right, count);
        /** The mean of what the shots gave within some six CSS px of a texel (of the nominal view), where they gave any. */
        const reach = Math.max(2, Math.round(density * 6));
        const around = (tx: number, ty: number, channel: number): number | null => {
          let [sum, total] = [0, 0];
          for (let y = Math.max(0, ty - reach); y <= Math.min(height - 1, ty + reach); y++)
            for (let x = Math.max(0, tx - reach); x <= Math.min(width - 1, tx + reach); x++) {
              sum += taken[(y * width + x) * 3 + channel] as number;
              total += had[y * width + x] as number;
            }
          return total > 0 ? sum / total : null;
        };
        for (let ty = 0; ty < height; ty++)
          for (let tx = 0; tx < width; tx++) {
            const at = ty * width + tx;
            const weight = had[at] as number;
            const found = nodes(tx, ty);
            for (let channel = 0; channel < 3; channel++) {
              const own = found.reduce((sum, [i, w]) => sum + w * ((nearest[channel] as Float64Array)[i] as number), 0);
              // Under a light of the set only what is finer than the light's own falling-off is the surface's (the
              // print beside the power lamp): the pixel less the pixels round it.
              const detail =
                weight <= 0
                  ? 0
                  : zone[at]
                    ? (taken[at * 3 + channel] as number) - (around(tx, ty, channel) ?? own) * weight
                    : (taken[at * 3 + channel] as number) - own * weight;
              rgb[at * 3 + channel] = Math.max(
                0,
                Math.min(255, Math.round((soft[at * 3 + channel] as number) + detail)),
              );
            }
          }
        tiles.push({ shape: index, paint: n, width, height, rgb });
      });
    });
    // Side by side, the tallest first, in rows of an image no wider than a phone's GPU takes; each with its own edge
    // repeated round it, so no neighbour shows at a piece's edge.
    const order = [...tiles].sort((a, b) => b.height - a.height);
    const places = new Map<(typeof tiles)[number], [number, number]>();
    let [x, y, row, wide] = [0, 0, 0, 0];
    for (const tile of order) {
      // (The small image in rows half as wide, where its widest piece lets it.)
      const most = Math.max(IMAGE_WIDTH * Math.min(1, part * 1.01), ...order.map((other) => other.width + 2 * GUTTER));
      if (x > 0 && x + tile.width + 2 * GUTTER > most) [x, y, row] = [0, y + row, 0];
      places.set(tile, [x + GUTTER, y + GUTTER]);
      x += tile.width + 2 * GUTTER;
      [row, wide] = [Math.max(row, tile.height + 2 * GUTTER), Math.max(wide, x)];
    }
    const image = { width: wide, height: y + row, rgb: new Uint8Array(wide * (y + row) * 3) };
    for (const tile of tiles) {
      const [left, top] = places.get(tile) as [number, number];
      for (let ty = -GUTTER; ty < tile.height + GUTTER; ty++)
        for (let tx = -GUTTER; tx < tile.width + GUTTER; tx++) {
          const from =
            (Math.max(0, Math.min(tile.height - 1, ty)) * tile.width + Math.max(0, Math.min(tile.width - 1, tx))) * 3;
          image.rgb.set(tile.rgb.subarray(from, from + 3), ((top + ty) * image.width + left + tx) * 3);
        }
      const shape = shapes[tile.shape] as PaintedShape;
      shapes[tile.shape] = {
        ...shape,
        paints: shape.paints.map((paint, n) =>
          n === tile.paint ? { ...paint, [key]: [left, top, tile.width, tile.height] } : paint,
        ),
      };
    }
    return image;
  };
  const image = imageOf(1, () => true, 'tile');
  // The small image, for a phone (inline.ts picks): only the pieces a phone's window shows any of, in the touch
  // windows the still is held to whose short side is under 600 px, at a part of the texels.
  const phones = new Set<number>();
  for (const [width, height, touch] of FAMILY) {
    if (!touch || Math.min(width, height) >= 600) continue;
    const camera = pinholeOf(cameraFor(framing, width, height, touch), height, 1);
    const counts = new Map<number, number>();
    for (const pass of geometry.passes) {
      const raster = rasterise(camera, pass.positions, pass.triangles, [
        -width / 2,
        -height / 2,
        width / 2,
        height / 2,
      ]);
      // (Not what hides what: a piece a phone might show a corner of is in.)
      let count = 0;
      for (const triangle of raster.triangle) if (triangle >= 0) count++;
      counts.set(pass.shape, (counts.get(pass.shape) ?? 0) + count);
    }
    for (const [shape, count] of counts) if (count >= 16) phones.add(shape);
  }
  const small = imageOf(SMALL, (shape) => phones.has(shape), 'small');

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
            Math.abs(
              (made[sample.pixel * 3 + channel] as number) -
                ((shown[pictures.indexOf(picture)] as Picture).rgb[sample.pixel * 3 + channel] as number),
            ) /
              3;
        sum[1] = (sum[1] as number) + 1;
      }
    });
  }
  geometry.shapes.forEach((shape, i) => {
    const [sum, count] = sums[i] as [number, number];
    if (count > 0) errors[shape.name] = sum / count;
  });
  return { shapes, errors, image, small };
}

/**
 * A surface's light as a grid on its plane (encode.ts › Paint): the plane is where its samples are, the grid covers
 * what any shot shows of it, and its colours are the least squares' over every sample, each seen through the grid as
 * the page draws it for the sample's own shot (draw.ts: a row is a line across the page, its colours evenly along
 * it; between rows, from one to the other). A node no shot shows goes on as its neighbours do.
 */
function fitField(
  spec: Extract<PaintSpec, { kind: 'field' }>,
  all: readonly Sample[],
  shots: readonly Shot[],
  cameras: readonly Pinhole[],
  framing: StillFraming,
  /** Each place from the first shot that shows it only: while the lamps' bloom is still in the samples. */
  firstOnly: boolean,
): Paint {
  let samples = all;
  const sorted = (axis: number): number[] => samples.map((sample) => sample.at[axis] as number).sort((a, b) => a - b);
  const part = (values: readonly number[], at: number): number =>
    values[Math.min(values.length - 1, Math.floor(values.length * at))] as number;
  const [xs, ys] = [sorted(0), sorted(1)];
  // A level surface (the cabinet's top) has its grid on its own plane; anything else, on the plane that faces the set's viewer.
  const axis = part(ys, 0.95) - part(ys, 0.05) < 2e-3 ? 1 : 0;
  // As the data keeps it: x to two millimetres, y to the half.
  const plane = axis ? Math.round(part(ys, 0.5) * 2000) / 2000 : Math.round(part(xs, 0.5) * 500) / 500;
  let [z0, z1, top, bottom] = [Infinity, -Infinity, -Infinity, Infinity];
  for (const sample of samples) {
    // Where the sample's ray meets the plane.
    const eye = (cameras[sample.shot] as Pinhole).eye;
    const t = (plane - (eye[axis] as number)) / ((sample.at[axis] as number) - (eye[axis] as number));
    const z = eye[2] + (sample.at[2] - eye[2]) * t;
    const v = (eye[1 - axis] as number) + ((sample.at[1 - axis] as number) - (eye[1 - axis] as number)) * t;
    [z0, z1, top, bottom] = [Math.min(z0, z), Math.max(z1, z), Math.max(top, v), Math.min(bottom, v)];
  }
  const along = axis ? 500 : 2000;
  [z0, z1] = [Math.floor(z0 * 2000) / 2000, Math.ceil(z1 * 2000) / 2000];
  [top, bottom] = [Math.ceil(top * along) / along, Math.floor(bottom * along) / along];

  // A place several shots show is fitted to the first of them: the nominal view's where it has the place, since a
  // wider window with a lamp in it has the finish's bloom of that lamp too, which the windows without it do not (a
  // lamp's own halo is a later shape, there only while the lamp is on the page).
  const CELLS = 64;
  const cellOf = (sample: Sample): number => {
    const eye = (cameras[sample.shot] as Pinhole).eye;
    const t = (plane - (eye[axis] as number)) / ((sample.at[axis] as number) - (eye[axis] as number));
    const z = eye[2] + (sample.at[2] - eye[2]) * t;
    const v = (eye[1 - axis] as number) + ((sample.at[1 - axis] as number) - (eye[1 - axis] as number)) * t;
    const cell = (value: number): number => Math.max(0, Math.min(CELLS - 1, Math.floor(value * CELLS)));
    return cell((z - z0) / (z1 - z0)) * CELLS + cell((v - top) / (bottom - top));
  };
  const first = new Int16Array(CELLS * CELLS).fill(32767);
  for (const sample of samples) first[cellOf(sample)] = Math.min(first[cellOf(sample)] as number, sample.shot);
  if (firstOnly) samples = samples.filter((sample) => sample.shot === first[cellOf(sample)]);

  /** The grid with its lines at these places (0–1 across and down), fitted to the samples: colours, and how much each node saw. */
  const fitted = (across: readonly number[], down: readonly number[]): { colours: Rgb[]; seen: Float64Array } => {
    const [columns, rows] = [across.length, down.length];
    // Each shot's rows on its page: where a row is, and where its ends are.
    const lines = shots.map((shot) => {
      const camera = cameraFor(framing, shot.width, shot.height, shot.touch);
      return down.map((place) => {
        const v = top + (bottom - top) * place;
        const [from, to] = [z0, z1].map((z) => camera.project(axis ? [v, plane, z] : [plane, v, z])) as [
          [number, number],
          [number, number],
        ];
        return { y: from[1], x1: from[0], x2: to[0] };
      });
    });
    const count = columns * rows;
    const normal = new Float64Array(count * count);
    const right = [new Float64Array(count), new Float64Array(count), new Float64Array(count)];
    const seen = new Float64Array(count);
    for (const sample of samples) {
      const shot = shots[sample.shot] as Shot;
      const own = lines[sample.shot] as (typeof lines)[number];
      const x = ((sample.pixel % (shot.width * shot.density)) + 0.5) / shot.density;
      const y = (Math.floor(sample.pixel / (shot.width * shot.density)) + 0.5) / shot.density;
      let row = 0;
      while (row < rows - 2 && y >= (own[row + 1] as (typeof own)[number]).y) row++;
      const [upper, lower] = [own[row] as (typeof own)[number], own[row + 1] as (typeof own)[number]];
      const t = Math.max(0, Math.min(1, (y - upper.y) / (lower.y - upper.y)));
      const found: [number, number][] = [];
      [upper, lower].forEach((line, i) => {
        const s = Math.max(0, Math.min(1, (x - line.x1) / (line.x2 - line.x1)));
        let column = 0;
        while (column < columns - 2 && s >= (across[column + 1] as number)) column++;
        const part = (s - (across[column] as number)) / ((across[column + 1] as number) - (across[column] as number));
        const share = i ? t : 1 - t;
        found.push([(row + i) * columns + column, share * (1 - part)]);
        found.push([(row + i) * columns + column + 1, share * part]);
      });
      for (const [i, wi] of found) {
        seen[i] = (seen[i] as number) + wi;
        for (const [j, wj] of found) normal[i * count + j] = (normal[i * count + j] as number) + wi * wj;
        right.forEach((channel, c) => {
          channel[i] = (channel[i] as number) + wi * (sample.colour[c] as number);
        });
      }
    }
    // Smoothness: a little of each node's bend along its row and its column, so the unseen ones go on evenly.
    let trace = 0;
    for (let i = 0; i < count; i++) trace += normal[i * count + i] as number;
    const bend = (trace / count) * SMOOTH + 1e-6;
    const penalise = (a: number, b: number, c: number): void => {
      const terms: [number, number][] = [
        [a, 1],
        [b, -2],
        [c, 1],
      ];
      for (const [i, wi] of terms)
        for (const [j, wj] of terms) normal[i * count + j] = (normal[i * count + j] as number) + bend * wi * wj;
    };
    for (let row = 0; row < rows; row++)
      for (let column = 0; column < columns; column++) {
        const i = row * columns + column;
        if (column > 0 && column < columns - 1) penalise(i - 1, i, i + 1);
        if (row > 0 && row < rows - 1) penalise(i - columns, i, i + columns);
        normal[i * count + i] = (normal[i * count + i] as number) + bend * 1e-4;
      }
    const solved = solve(normal, right, count);
    return {
      colours: Array.from(
        { length: count },
        (_, i) => solved.map((channel) => Math.max(0, Math.min(255, channel[i] as number))) as unknown as Rgb,
      ),
      seen,
    };
  };

  // First a grid finer than the one kept, evenly; then of its lines the ones to keep: time after time the line goes
  // whose colours are nearest to what its neighbours would give there between them, where the shots saw them.
  const even = (count: number): number[] => Array.from({ length: count }, (_, i) => i / (count - 1));
  const fine = { columns: FINE(spec.columns), rows: FINE(spec.rows) };
  const dense = fitted(even(fine.columns), even(fine.rows));
  const at = (column: number, row: number): Rgb => dense.colours[row * fine.columns + column] as Rgb;
  const kept = { columns: even(fine.columns).map((_, i) => i), rows: even(fine.rows).map((_, i) => i) };
  const cost = (lines: number[], other: number[], k: number, rows: boolean): number => {
    const [a, b] = [lines[k - 1] as number, lines[k + 1] as number];
    let sum = 0;
    for (let line = a + 1; line < b; line++)
      for (const cross of other.length ? Array.from({ length: rows ? fine.columns : fine.rows }, (_, i) => i) : []) {
        const [here, from, to] = rows
          ? [at(cross, line), at(cross, a), at(cross, b)]
          : [at(line, cross), at(a, cross), at(b, cross)];
        const weight = Math.min(
          1,
          (dense.seen[rows ? line * fine.columns + cross : cross * fine.columns + line] as number) / 4,
        );
        const t = (line - a) / (b - a);
        for (let c = 0; c < 3; c++)
          sum += weight * ((here[c] as number) - ((from[c] as number) * (1 - t) + (to[c] as number) * t)) ** 2;
      }
    return sum;
  };
  for (const [lines, other, want, rows] of [
    [kept.columns, kept.rows, spec.columns, false],
    [kept.rows, kept.columns, spec.rows, true],
  ] as const)
    while (lines.length > want) {
      let [best, least] = [1, Infinity];
      for (let k = 1; k < lines.length - 1; k++) {
        const value = cost(lines, other, k, rows);
        if (value < least) [best, least] = [k, value];
      }
      lines.splice(best, 1);
    }
  const columns = kept.columns.map((i) => Math.round((i / (fine.columns - 1)) * FIELD_STEPS));
  const rows = kept.rows.map((i) => Math.round((i / (fine.rows - 1)) * FIELD_STEPS));
  const { colours } = fitted(
    columns.map((value) => value / FIELD_STEPS),
    rows.map((value) => value / FIELD_STEPS),
  );
  return { kind: 'field', axis, plane, z: [z0, z1], v: [top, bottom], columns, rows, colours };
}

/** The lines of the finer grid a field's own are chosen from: three times as many spaces, and a divisor of the data's steps. */
const FINE = (count: number): number => [97, 49, 33, 25, 17, 13].find((lines) => lines <= (count - 1) * 3 + 1) ?? 13;

/** The shots a light of the set is fitted to: the nominal desktop window and the phone's portrait one. */
const COMMON = ['nominal', 'phone'];
/** Under this much of a light of the set (its glow's strength) a surface's own light is not told from the lamp's. */
const LIT = 0.15;
/** The small image's texels a side, as a part of the full one's (build.ts › --small tries another). */
let SMALL = 0.5;
export const setSmall = (part: number): void => {
  SMALL = part;
};
/** The grid of a surface that has a piece of the image, as a part of the lines its layer asks for. */
const COARSE = 0.6;
/** The image's texels a CSS pixel of the nominal view, at most: what a display of two pixels a CSS pixel shows. */
const TEXELS = 2;
/** A surface's piece of the image has no more texels than this: a large surface's light is soft. */
const TILE_MOST = 8e5;
/** A surface this far (metres) behind a lamp or before it shows the lamp's bloom elsewhere from another eye. */
const BEHIND = 0.2;
/** A shot's part of a texel falls to nothing over this many CSS px before its page's edge. */
const FEATHER = 48;
/** The image is no wider than this, and each piece has this many texels of its own edge round it. */
const IMAGE_WIDTH = 4096;
const GUTTER = 2;

/** Where a place (0–1) is among a field's lines: the line before it, and how far on to the next. */
function fieldSpan(lines: readonly number[], at: number): [number, number] {
  const place = Math.max(0, Math.min(FIELD_STEPS, at * FIELD_STEPS));
  let line = 0;
  while (line < lines.length - 2 && place >= (lines[line + 1] as number)) line++;
  return [line, (place - (lines[line] as number)) / ((lines[line + 1] as number) - (lines[line] as number))];
}

/** A field's colour at a place of its rectangle, 0–1 along its rows and down them. */
function fieldAt(paint: Extract<Paint, { kind: 'field' }>, s: number, t: number): number[] {
  const [[column, a], [row, b]] = [fieldSpan(paint.columns, s), fieldSpan(paint.rows, t)];
  const at = (dx: number, dy: number): Rgb => paint.colours[(row + dy) * paint.columns.length + column + dx] as Rgb;
  return [0, 1, 2].map(
    (channel) =>
      ((at(0, 0)[channel] as number) * (1 - a) + (at(1, 0)[channel] as number) * a) * (1 - b) +
      ((at(0, 1)[channel] as number) * (1 - a) + (at(1, 1)[channel] as number) * a) * b,
  );
}

/** How much a field's bend costs beside its samples (fitField). */
const SMOOTH = 1e-3;

/** Solves a symmetric positive system for several right sides (Cholesky), in place. */
function solve(matrix: Float64Array, rights: Float64Array[], n: number): Float64Array[] {
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < j; k++) {
      const factor = matrix[j * n + k] as number;
      if (factor === 0) continue;
      for (let i = j; i < n; i++)
        matrix[i * n + j] = (matrix[i * n + j] as number) - (matrix[i * n + k] as number) * factor;
    }
    const pivot = Math.sqrt(matrix[j * n + j] as number);
    for (let i = j; i < n; i++) matrix[i * n + j] = (matrix[i * n + j] as number) / pivot;
  }
  for (const right of rights) {
    for (let i = 0; i < n; i++) {
      let sum = right[i] as number;
      for (let k = 0; k < i; k++) sum -= (matrix[i * n + k] as number) * (right[k] as number);
      right[i] = sum / (matrix[i * n + i] as number);
    }
    for (let i = n - 1; i >= 0; i--) {
      let sum = right[i] as number;
      for (let k = i + 1; k < n; k++) sum -= (matrix[k * n + i] as number) * (right[k] as number);
      right[i] = sum / (matrix[i * n + i] as number);
    }
  }
  return rights;
}

function colourOf(picture: { readonly rgb: Uint8Array }, pixel: number): Rgb {
  return [picture.rgb[pixel * 3] as number, picture.rgb[pixel * 3 + 1] as number, picture.rgb[pixel * 3 + 2] as number];
}

/** The still as the page would draw these shapes for a shot's viewport, at the shot's size: sRGB, three bytes a pixel. */
export async function render(
  framing: StillFraming,
  shapes: readonly PaintedShape[],
  shot: Shot,
  /** Four bytes a pixel, the last how much of the pixel the shapes cover; else over black. */
  alone = false,
): Promise<Uint8Array> {
  const { data, texts } = encode(framing, shapes);
  const drawn = drawStill(
    data,
    texts,
    shot.width,
    shot.height,
    padInsets(shot.width, shot.height, shot.touch),
    svgField,
    Math.min(shot.density, 2, Math.sqrt(3e6 / (shot.width * shot.height))),
  );
  // The second drawing, of what the picture lights, as a group of the first.
  const svg = drawn.svg.replace(/<\/svg><svg[^>]*>(.*)<\/svg>$/, '<g>$1</g></svg>');
  const [width, height] = [shot.width * shot.density, shot.height * shot.density];
  // As the page has it: its size, and the print's face (index.html › .tv-still text).
  const document = svg.replace(
    /^<svg [^>]*>/,
    `<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" width="${width}" height="${height}" viewBox="0 0 ${shot.width} ${shot.height}"><style>text{font-family:Helvetica,Arial,sans-serif;font-weight:600;text-anchor:middle;dominant-baseline:central}</style>`,
  );
  const drawing = sharp(Buffer.from(document), { density: 72 });
  const { data: rgb } = await (alone ? drawing.ensureAlpha() : drawing.flatten({ background: '#000' }).removeAlpha())
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new Uint8Array(rgb);
}

export type { Shape };
