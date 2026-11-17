/**
 * The startup still's shapes from the generated room (docs/ROOM.md › Startup): each layer of layers.ts as closed
 * outlines in the room's own space. A layer is drawn alone from the nominal TV view (1440 × 900), its outline traced
 * and every vertex of it put back where it is in the room by the layer's own depth, so the outline is right from
 * every camera of the family and what hides what is only the order the layers are drawn in. A chart's rectangle is
 * taken as it is.
 */
import type { StillFraming } from '../../src/app/startup/still/camera';
import type { Vignette } from './encode';
import { pageVignette } from './finish';
import { LAYERS, type LayerSpec, type PaintSpec } from './layers';
import { fromPlane, type Pinhole, rasterise, type Vec3 } from './raster';
import { area, outlines, type Pair, simplify, smooth } from './trace';
import { cameraFor, FAMILY, pinholeOf, type World } from './world';

export interface Shape {
  readonly name: string;
  readonly kind: 'loops' | 'disc' | 'text' | 'rim' | 'vignette';
  /** The finish's vignette, where the shape is it. */
  readonly vignette?: Vignette;
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
  /** An edge's light: the number of the shape whose outlines it runs along (0: the picture's), and of the one it is cut to. */
  readonly along?: number;
  readonly within?: number;
  readonly strengths?: readonly number[];
  /** Shown only with the set on: a light of the set, the picture's light on the lip. */
  readonly lit?: boolean;
  /** An outline only, for the shape after it where the eye's depth along the view is more than this (nearer the set). */
  readonly near?: number;
  /** A disc that is a lamp's bloom: sized in the room's buffer pixels (draw.ts). */
  readonly bloom?: boolean;
  /** The shape whose rendered picture has this one in it: drawn only until that picture is in. */
  readonly on?: string;
  /** What the picture lights. */
  readonly tube?: boolean;
  readonly paints: readonly PaintSpec[];
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

export function buildGeometry(world: World, framing: StillFraming, layers: readonly LayerSpec[] = LAYERS): Geometry {
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
  for (const layer of layers) {
    if (layer.kind === 'disc') {
      shapes.push({
        name: layer.name,
        kind: 'disc',
        loops: [],
        centre: layer.centre,
        size: layer.radius,
        lit: layer.lit,
        // A lamp's bloom, but the power lamp's, whose halo is a part of the set.
        bloom: !layer.lit && layer.paints.some((paint) => paint.kind === 'radial' && paint.glow),
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
        on: layer.on,
        places,
        paints: layer.paints,
      });
    } else if (layer.kind === 'vignette') {
      const except = shapes.findIndex((shape) => shape.name === layer.except);
      if (except < 0) throw new Error(`The still's vignette leaves out "${layer.except}", which is no layer before it`);
      shapes.push({
        name: layer.name,
        kind: 'vignette',
        loops: [],
        along: except,
        vignette: pageVignette(),
        paints: [],
      });
    } else if (layer.kind === 'rim') {
      const index = (name: string): number => {
        const found = shapes.findIndex((shape) => shape.name === name);
        if (found < 1)
          throw new Error(`The still's "${layer.name}" is the light on "${name}", which is no layer before it`);
        return found;
      };
      const within = index(layer.within);
      const all = (shapes[within] as Shape).loops.flat();
      const centre = [0, 1, 2].map((axis) => all.reduce((sum, p) => sum + (p[axis] as number), 0) / all.length);
      shapes.push({
        name: layer.name,
        kind: 'rim',
        along: layer.of === 'picture' ? 0 : index(layer.of),
        within,
        strengths: Array.from({ length: layer.steps }, () => 0),
        loops: [],
        centre: centre as unknown as Vec3,
        size: layer.width,
        tube: true,
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
        shapes.push({
          name: order.length > 1 ? `${layer.name}-${i}` : layer.name,
          kind: 'loops',
          loops: [corners],
          paints:
            layer.wide && facing && right - left >= layer.wide.from
              ? [{ kind: 'field', columns: layer.wide.columns, rows: layer.wide.rows }]
              : layer.paints,
        });
      });
    } else {
      const picked = everything.filter((i) => layer.pick(world.triangles[i] as never));
      if (picked.length === 0) throw new Error(`The still's layer "${layer.name}" picks nothing of the room`);
      if (layer.kind === 'outline') {
        const behind = layer.behind ? everything.filter((i) => layer.behind?.(world.triangles[i] as never)) : undefined;
        let traced = trace(nominal, layer, world.positions, picked, layer.round, behind);
        if (layer.whole) traced = [traced.reduce((most, loop) => (loop.area > most.area ? loop : most))];
        const loops = traced.map((loop) => loop.points);
        if (layer.near) {
          // The same outline from the nearer eye, before the shape itself: the page draws the shape with it in the
          // windows whose eye is nearer to that one than to the nominal view's (its depth along the view, between).
          const view = cameraFor(framing, layer.near[0], layer.near[1], false);
          const seen = trace(pinholeOf(view, layer.near[1], DENSITY), layer, world.positions, picked, false, behind);
          shapes.push({
            name: `${layer.name}-near`,
            kind: 'loops',
            loops: seen.map((loop) => loop.points),
            curved: seen.map((loop) => loop.curved),
            near: (view.eye[2] + cameraFor(framing, 1440, 900, false).eye[2]) / 2,
            paints: [],
          });
        }
        passes.push({ shape: shapes.length, positions: world.positions, triangles: picked, behind });
        if (!layer.round) {
          shapes.push({
            name: layer.name,
            kind: 'loops',
            loops,
            curved: traced.map((loop) => loop.curved),
            coarse: layer.coarse,
            on: layer.on,
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
          on: layer.on,
          paints: layer.paints,
        });
        if (hole)
          shapes.push({
            name: `${layer.name}-hole`,
            kind: 'disc',
            loops: [],
            centre: hole.centre,
            size: hole.size,
            on: layer.on,
            paints: [{ kind: 'flat' }],
          });
      }
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

function trace(
  camera: Pinhole,
  layer: { readonly name: string; readonly grow?: number; readonly close?: boolean; readonly tolerance?: number },
  positions: ArrayLike<number>,
  triangles: readonly number[],
  /** Corners only: a round part's outline is measured, not drawn. */
  plain = false,
  /** Triangles that hide what is behind them. */
  behind?: readonly number[],
): { points: Vec3[]; curved: boolean; area: number }[] {
  const raster = rasterise(camera, positions, triangles);
  let mask = Uint8Array.from(raster.triangle, (triangle) => (triangle >= 0 ? 1 : 0));
  if (behind) {
    const front = rasterise(camera, positions, behind, undefined, raster);
    for (let i = 0; i < mask.length; i++) if ((front.depth[i] as number) < (raster.depth[i] as number)) mask[i] = 0;
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
    if (layer.close) {
      // Only its gaps closed: shrunk again by as much, so its own edges are where they were.
      const shrunk = new Uint8Array(mask.length);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          let whole = mask[y * width + x] === 1;
          for (let dy = -reach; dy <= reach && whole; dy++)
            for (let dx = -reach; dx <= reach && whole; dx++) {
              const [sx, sy] = [x + dx, y + dy];
              if (dx * dx + dy * dy > reach * reach) continue;
              whole = sx >= 0 && sy >= 0 && sx < width && sy < height && mask[sy * width + sx] === 1;
            }
          shrunk[y * width + x] = whole ? 1 : 0;
        }
      mask = shrunk;
    }
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
