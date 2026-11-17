/**
 * The startup still's shapes from the generated room (docs/ROOM.md › Startup): each layer of layers.ts as closed
 * outlines in the room's own space. A layer is drawn alone from the nominal TV view (1440 × 900), its outline traced
 * and every vertex of it put back where it is in the room by the layer's own depth, so the outline is right from
 * every camera of the family and what hides what is only the order the layers are drawn in. A chart's rectangle is
 * taken as it is.
 */
import type { StillFraming } from '../../src/app/startup/still/camera';
import { layersFor, type PaintSpec } from './layers';
import { fromPlane, type Pinhole, rasterise, toPlane, type Vec3 } from './raster';
import { area, outlines, type Pair, simplify, smooth } from './trace';
import { cameraFor, FAMILY, pinholeOf, type World } from './world';

export interface Shape {
  readonly name: string;
  readonly kind: 'loops' | 'disc' | 'text' | 'rim';
  /** Closed outlines in world metres; holes are loops too (the fill is even-odd). */
  readonly loops: readonly (readonly Vec3[])[];
  /** Which loops are control points of a curve (trace.ts › curve) rather than a polygon's corners. */
  readonly curved?: readonly boolean[];
  /** Its points are kept to the millimetre rather than the half. */
  readonly coarse?: number;
  readonly centre?: Vec3;
  /** A disc's radius, a text's height: metres. */
  readonly size?: number;
  /** A print's words, and where along the face (z) each is centred. */
  readonly texts?: readonly string[];
  readonly places?: readonly number[];
  /** An edge's light: the number of the shape whose outlines it runs along. */
  readonly along?: number;
  /** Shown only with the set on: a light of the set, the picture's light on the lip. */
  readonly lit?: boolean;
  readonly paints: readonly PaintSpec[];
  /** The shape its paints go over (a lamp's pool on its surface). */
  readonly over?: number;
}

/** Triangles drawn over what was drawn before them, as the shape numbered: how the still's shapes cover the view. */
export interface Pass {
  readonly shape: number;
  /** Nine floats a triangle. */
  readonly positions: ArrayLike<number>;
  readonly triangles: readonly number[];
  /** Only where the surface's point passes this. */
  readonly keep?: (at: Vec3) => boolean;
  /** Only where it is nearer than these triangles of the same positions. */
  readonly behind?: readonly number[];
}

export interface Geometry {
  readonly shapes: readonly Shape[];
  readonly passes: readonly Pass[];
}

/** Raster pixels a CSS pixel of the nominal view. */
const DENSITY = 4;
/** A chart is a shape where some framing shows this many CSS px² of it. */
const CHART_SHOWS = 1000;
/** An outline smaller than this is left out (CSS px² at the nominal view). */
const SMALLEST = 2;

export function buildGeometry(world: World, framing: StillFraming): Geometry {
  const nominal = pinholeOf(cameraFor(framing, 1440, 900, false), 900, DENSITY);
  const everything = world.triangles.map((_, i) => i);
  // What each framing of the family shows of each chart.
  const shown = new Map<number, number>();
  for (const [width, height, touch] of FAMILY) {
    const camera = pinholeOf(cameraFor(framing, width, height, touch), height, 1);
    const raster = rasterise(camera, world.positions, everything, [-width / 2, -height / 2, width / 2, height / 2]);
    const counts = new Map<number, number>();
    for (const triangle of raster.triangle) {
      const chart = triangle < 0 ? -1 : (world.triangles[triangle]?.chart ?? -1);
      if (chart >= 0) counts.set(chart, (counts.get(chart) ?? 0) + 1);
    }
    for (const [chart, count] of counts) shown.set(chart, Math.max(shown.get(chart) ?? 0, count));
  }

  const shapes: Shape[] = [];
  const passes: Pass[] = [];
  for (const layer of layersFor(nominal.eye)) {
    if (layer.kind === 'disc') {
      shapes.push({
        name: layer.name,
        kind: 'disc',
        loops: [],
        centre: layer.centre,
        size: layer.radius,
        lit: layer.lit,
        paints: layer.paints,
      });
    } else if (layer.kind === 'text') {
      const places = layer.words.map(([, z]) => z);
      shapes.push({
        name: layer.name,
        kind: 'text',
        loops: [],
        centre: [layer.centre[0], layer.centre[1], places[0] as number],
        size: layer.size,
        texts: layer.words.map(([text]) => text),
        places,
        paints: layer.paints,
      });
    } else if (layer.kind === 'rim') {
      const of = shapes.find((shape) => shape.name === layer.of);
      if (!of)
        throw new Error(`The still's "${layer.name}" is the light on "${layer.of}", which is no layer before it`);
      const all = of.loops.flat();
      const centre = [0, 1, 2].map((axis) => all.reduce((sum, p) => sum + (p[axis] as number), 0) / all.length);
      shapes.push({
        name: layer.name,
        kind: 'rim',
        along: shapes.indexOf(of),
        loops: of.loops,
        centre: centre as unknown as Vec3,
        size: layer.width,
        lit: true,
        paints: layer.paints,
      });
    } else if (layer.kind === 'charts') {
      const charts = new Map<number, number[]>();
      world.triangles.forEach((triangle, i) => {
        if (!layer.pick(triangle) || (shown.get(triangle.chart) ?? 0) < CHART_SHOWS) return;
        charts.set(triangle.chart, [...(charts.get(triangle.chart) ?? []), i]);
      });
      // The furthest first; of two as far, the one facing the viewer last.
      const order = [...charts].sort(([, a], [, b]) => depthOf(world, b) - depthOf(world, a));
      order.forEach(([, triangles], i) => {
        passes.push({ shape: shapes.length, positions: world.positions, triangles });
        const corners = rectangle(world, triangles);
        const facing = (world.triangles[triangles[0] as number] as World['triangles'][number]).normal[0] < -0.9;
        const [left, right] = [Math.min(...corners.map((p) => p[2])), Math.max(...corners.map((p) => p[2]))];
        const [x, y] = [(corners[0] as Vec3)[0], corners.reduce((sum, p) => sum + p[1], 0) / 4];
        shapes.push({
          name: order.length > 1 ? `${layer.name}-${i}` : layer.name,
          kind: 'loops',
          loops: [corners],
          paints:
            layer.wide && facing && right - left >= layer.wide.from
              ? [{ kind: 'linear', from: [x, y, left], to: [x, y, right], stops: layer.wide.stops }]
              : layer.paints,
        });
      });
    } else {
      const picked = everything.filter((i) => layer.pick(world.triangles[i] as never));
      if (picked.length === 0) throw new Error(`The still's layer "${layer.name}" picks nothing of the room`);
      if (layer.kind === 'outline') {
        const behind = layer.behind ? everything.filter((i) => layer.behind?.(world.triangles[i] as never)) : undefined;
        passes.push({ shape: shapes.length, positions: world.positions, triangles: picked, behind });
        let traced = trace(nominal, layer, world.positions, picked, undefined, layer.round, behind);
        if (layer.whole) traced = [traced.reduce((most, loop) => (loop.area > most.area ? loop : most))];
        const loops = traced.map((loop) => loop.points);
        if (!layer.round) {
          shapes.push({
            name: layer.name,
            kind: 'loops',
            loops,
            curved: traced.map((loop) => loop.curved),
            coarse: layer.coarse,
            paints: layer.paints,
          });
          continue;
        }
        // Round parts: the outline's middle and mean radius, and the same of the largest hole in it.
        const rings = loops.map(discOf).sort((a, b) => b.size - a.size);
        const [outer, hole] = [rings[0] as (typeof rings)[number], rings[1]];
        shapes.push({
          name: layer.name,
          kind: 'disc',
          loops: [],
          centre: outer.centre,
          size: outer.size,
          paints: layer.paints,
        });
        if (hole)
          shapes.push({
            name: `${layer.name}-hole`,
            kind: 'disc',
            loops: [],
            centre: hole.centre,
            size: hole.size,
            paints: [{ kind: 'flat' }],
          });
        continue;
      }
      const over = shapes.findIndex((shape) => shape.name === layer.over);
      const surface = world.triangles[picked[0] as number] as World['triangles'][number];
      const axis = surface.normal.findIndex((value) => Math.abs(value) > 0.9);
      const shadow = shadowOf(
        world.positions,
        everything.filter((i) => layer.casters(world.triangles[i] as never)),
        layer.light,
        axis,
        // A hair off the surface, towards the light.
        (surface.min[axis] as number) + Math.sign((layer.light[axis] as number) - (surface.min[axis] as number)) * 5e-4,
      );
      const shade = Array.from({ length: shadow.length / 9 }, (_, i) => i);
      const { centre, reach } = layer;
      const keep = (at: Vec3): boolean => Math.hypot(at[0] - centre[0], at[1] - centre[1], at[2] - centre[2]) <= reach;
      // The window the pool can be in: round the box its reach fills.
      const corners = Array.from({ length: 8 }, (_, i) =>
        toPlane(
          nominal,
          [0, 1, 2].map((k) => (centre[k] as number) + (i & (1 << k) ? reach : -reach)) as unknown as Vec3,
        ),
      );
      const limit = [
        Math.min(...corners.map((p) => p[0])),
        Math.min(...corners.map((p) => p[1])),
        Math.max(...corners.map((p) => p[0])),
        Math.max(...corners.map((p) => p[1])),
      ] as const;
      // The pool takes the surface within its reach, and the shadow gives its part back to the surface's own shape.
      passes.push({ shape: shapes.length, positions: world.positions, triangles: picked, keep });
      const chart = picked.map((i) => world.triangles[i] as World['triangles'][number]);
      const onSurface = (at: Vec3): boolean =>
        at.every(
          (value, k) =>
            value >= Math.min(...chart.map((t) => t.min[k] as number)) - 1e-3 &&
            value <= Math.max(...chart.map((t) => t.max[k] as number)) + 1e-3,
        );
      passes.push({ shape: over, positions: shadow, triangles: shade, keep: onSurface });
      const traced = trace(nominal, layer, world.positions, picked, { positions: shadow, triangles: shade, limit });
      shapes.push({
        name: layer.name,
        kind: 'loops',
        loops: traced.map((loop) => loop.points),
        curved: traced.map((loop) => loop.curved),
        coarse: 4,
        paints: layer.paints,
        over,
      });
    }
  }
  return { shapes, passes };
}

/** The disc a round outline is: its points' middle and their mean distance from it. */
function discOf(loop: readonly Vec3[]): { centre: Vec3; size: number } {
  const centre = [0, 1, 2].map(
    (axis) => loop.reduce((sum, p) => sum + (p[axis] as number), 0) / loop.length,
  ) as unknown as Vec3;
  const size =
    loop.reduce((sum, p) => sum + Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]), 0) / loop.length;
  return { centre, size };
}

function depthOf(world: World, triangles: readonly number[]): number {
  let sum = 0;
  for (const i of triangles) {
    const t = world.triangles[i] as World['triangles'][number];
    // Facing the viewer counts as a little nearer, so a box's front is drawn over its sides.
    sum += (t.min[0] + t.max[0]) / 2 + t.normal[0] * 1e-3;
  }
  return sum / triangles.length;
}

/** A chart's four corners, in order round it. */
function rectangle(world: World, triangles: readonly number[]): Vec3[] {
  const corners: Vec3[] = [];
  for (const triangle of triangles)
    for (let corner = 0; corner < 3; corner++) {
      const at = triangle * 9 + corner * 3;
      const p: Vec3 = [
        world.positions[at] as number,
        world.positions[at + 1] as number,
        world.positions[at + 2] as number,
      ];
      if (!corners.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-6)) corners.push(p);
    }
  if (corners.length !== 4) throw new Error('A chart of the still is not a rectangle');
  const sum = corners.reduce<[number, number, number]>(
    (total, p) => [total[0] + p[0], total[1] + p[1], total[2] + p[2]],
    [0, 0, 0],
  );
  const centre: Vec3 = [sum[0] / 4, sum[1] / 4, sum[2] / 4];
  const from = (p: Vec3): Vec3 => [p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]];
  const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const normal = (world.triangles[triangles[0] as number] as World['triangles'][number]).normal;
  // Two directions in the rectangle's plane: to its first corner, and square to that.
  const u = from(corners[0] as Vec3);
  const v: Vec3 = [
    normal[1] * u[2] - normal[2] * u[1],
    normal[2] * u[0] - normal[0] * u[2],
    normal[0] * u[1] - normal[1] * u[0],
  ];
  const angle = (p: Vec3): number => Math.atan2(dot(from(p), v), dot(from(p), u));
  return corners.sort((a, b) => angle(a) - angle(b));
}

/**
 * The picked triangles' shadow from a point light on the plane where `axis` is `value`: each laid flat there. Only
 * what is between the light and the plane throws one; a triangle across the light's own level is cut there.
 */
function shadowOf(
  positions: ArrayLike<number>,
  picked: readonly number[],
  light: Vec3,
  axis: number,
  value: number,
): number[] {
  const flat: number[] = [];
  const side = Math.sign(value - (light[axis] as number));
  const from = (light[axis] as number) + side * 0.02;
  const cast = (p: Vec3): Vec3 => {
    const t = (value - (light[axis] as number)) / ((p[axis] as number) - (light[axis] as number));
    return [0, 1, 2].map((k) =>
      k === axis ? value : (light[k] as number) + ((p[k] as number) - (light[k] as number)) * t,
    ) as unknown as Vec3;
  };
  for (const triangle of picked) {
    const corners = [0, 1, 2].map((corner): Vec3 => {
      const at = triangle * 9 + corner * 3;
      return [positions[at] as number, positions[at + 1] as number, positions[at + 2] as number];
    });
    const beyond: Vec3[] = [];
    corners.forEach((a, i) => {
      const b = corners[(i + 1) % 3] as Vec3;
      const [inA, inB] = [(a[axis] as number) * side >= from * side, (b[axis] as number) * side >= from * side];
      if (inA) beyond.push(a);
      if (inA !== inB) {
        const t = (from - (a[axis] as number)) / ((b[axis] as number) - (a[axis] as number));
        beyond.push(
          [0, 1, 2].map((k) => (a[k] as number) + ((b[k] as number) - (a[k] as number)) * t) as unknown as Vec3,
        );
      }
    });
    for (let i = 1; i + 1 < beyond.length; i++)
      flat.push(...cast(beyond[0] as Vec3), ...cast(beyond[i] as Vec3), ...cast(beyond[i + 1] as Vec3));
  }
  return flat;
}

function trace(
  camera: Pinhole,
  layer: { readonly name: string; readonly grow?: number; readonly tolerance?: number },
  positions: ArrayLike<number>,
  triangles: readonly number[],
  /** What is cut out of it, and the window on the camera's plane it is traced in. */
  less?: {
    readonly positions: ArrayLike<number>;
    readonly triangles: readonly number[];
    readonly limit: readonly [number, number, number, number];
  },
  /** Corners only: a round part's outline is measured, not drawn. */
  plain = false,
  /** Triangles that hide what is behind them. */
  behind?: readonly number[],
): { points: Vec3[]; curved: boolean; area: number }[] {
  const raster = rasterise(camera, positions, triangles, less?.limit);
  let mask = Uint8Array.from(raster.triangle, (triangle) => (triangle >= 0 ? 1 : 0));
  if (behind) {
    const front = rasterise(camera, positions, behind, undefined, raster);
    for (let i = 0; i < mask.length; i++) if ((front.depth[i] as number) < (raster.depth[i] as number)) mask[i] = 0;
  }
  if (less) {
    const shadow = rasterise(camera, less.positions, less.triangles, undefined, raster);
    for (let i = 0; i < mask.length; i++) if ((shadow.triangle[i] as number) >= 0) mask[i] = 0;
  }
  const { width, height } = raster;
  const depth = Float32Array.from(raster.depth);
  const reach = Math.round((layer.grow ?? 0) * DENSITY);
  if (reach > 0) {
    // A part finer than a pixel (the filament's wire) is widened, each new pixel as deep as the part beside it.
    const grown = new Uint8Array(mask.length);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        let nearest = Infinity;
        for (let dy = -reach; dy <= reach; dy++)
          for (let dx = -reach; dx <= reach; dx++) {
            const [sx, sy] = [x + dx, y + dy];
            if (dx * dx + dy * dy > reach * reach || sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
            if (mask[sy * width + sx] === 1) nearest = Math.min(nearest, raster.depth[sy * width + sx] as number);
          }
        if (nearest < Infinity) {
          grown[y * width + x] = 1;
          depth[y * width + x] = nearest;
        }
      }
    mask = grown;
  }
  const tolerance = (layer.tolerance ?? 0.3) * DENSITY;
  const loops: { points: Vec3[]; curved: boolean; area: number }[] = [];
  /** A lattice corner is as deep as the nearest of the layer's pixels round it. */
  const depthAt = ([x, y]: Pair): number => {
    let nearest = Infinity;
    for (const [px, py] of [
      [x - 1, y - 1],
      [x, y - 1],
      [x - 1, y],
      [x, y],
    ] as const)
      if (px >= 0 && py >= 0 && px < width && py < height && mask[py * width + px] === 1)
        nearest = Math.min(nearest, depth[py * width + px] as number);
    return nearest;
  };
  for (const loop of outlines(mask, width, height)) {
    const size = Math.abs(area(loop));
    if (size < SMALLEST * DENSITY * DENSITY) continue;
    const corners = simplify(loop, tolerance);
    if (corners.length < 3) continue;
    // As a curve where that takes fewer points: its control points stand off the outline, each as deep as the
    // outline's point it stands for.
    const controls =
      // A curve cannot follow a mesh's own facets (a third of a pixel on the set's corners) more closely than a polygon.
      plain || corners.length < 10 || tolerance < 0.4 * DENSITY
        ? null
        : smooth(
            loop.map(([x, y]): Pair => [x / DENSITY, y / DENSITY]),
            tolerance / DENSITY,
            corners.length,
          );
    const curved = controls !== null;
    loops.push({
      curved,
      area: size,
      points: curved
        ? controls.map((control) =>
            fromPlane(
              camera,
              control.at[0] * DENSITY + raster.left,
              control.at[1] * DENSITY + raster.top,
              depthAt(loop[control.of] as Pair),
            ),
          )
        : corners.map((corner) => fromPlane(camera, corner[0] + raster.left, corner[1] + raster.top, depthAt(corner))),
    });
  }
  if (loops.length === 0) throw new Error(`The still's layer "${layer.name}" has no outline`);
  // The largest first: the order is the generators' and nothing else's.
  return loops;
}
