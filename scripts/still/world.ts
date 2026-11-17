/**
 * The room's TV corner as the startup still's generator sees it: every triangle the generators make (the props'
 * meshes, the charts' rectangles, the TV's glass), each knowing what it is of, and the still's family of cameras.
 */

import {
  type StillCamera,
  type StillFraming,
  type StillInsets,
  stillCamera,
  unseen,
} from '../../src/app/startup/still/camera';
import { TV_SPEC } from '../../src/room/gen/roomSpec';
import { buildScene, type GenScene } from '../../src/room/gen/scene';
import type { Pinhole, Vec3 } from './raster';

export interface Triangle {
  /** The prop's name (scene.ts › PROPS), `chart` for a chart's rectangle, `glass` for the TV's. */
  readonly of: string;
  /** The mesh it is in, or the chart's group and its number among the charts. */
  readonly mesh: string;
  readonly chart: number;
  readonly min: Vec3;
  readonly max: Vec3;
  readonly normal: Vec3;
  /** Its corners' mean albedo (linear); a chart has none. */
  readonly albedo: Vec3;
}

export interface World {
  readonly scene: GenScene;
  /** Nine floats a triangle. */
  readonly positions: Float32Array;
  readonly triangles: readonly Triangle[];
}

const GROUPS = ['cabinet', 'wall', 'floor', 'desk', 'dresser', 'rug'];

export function loadWorld(): World {
  const scene = buildScene({ densityScale: 1, maxPageSize: 4096 });
  const positions: number[] = [];
  const triangles: Triangle[] = [];
  const add = (corners: ArrayLike<number>, at: number, of: string, mesh: string, chart: number, albedo: Vec3): void => {
    const p = Array.from({ length: 9 }, (_, i) => corners[at + i] as number);
    const corner = (i: number): Vec3 => [p[i * 3] as number, p[i * 3 + 1] as number, p[i * 3 + 2] as number];
    const [a, b, c] = [corner(0), corner(1), corner(2)];
    const each = (pick: (...values: number[]) => number): Vec3 => [
      pick(a[0], b[0], c[0]),
      pick(a[1], b[1], c[1]),
      pick(a[2], b[2], c[2]),
    ];
    const [u, v]: [Vec3, Vec3] = [
      [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
    ];
    const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const length = Math.hypot(...n) || 1;
    positions.push(...p);
    triangles.push({
      of,
      mesh,
      chart,
      min: each(Math.min),
      max: each(Math.max),
      normal: [n[0] / length, n[1] / length, n[2] / length],
      albedo,
    });
  };
  for (const prop of scene.props)
    for (const [mesh, [start, count]] of Object.entries(prop.ranges)) {
      const data = scene.meshes[mesh as keyof GenScene['meshes']];
      for (let vertex = start; vertex < start + count; vertex += 3) {
        const albedo = [0, 1, 2].map(
          (channel) =>
            ((data.albedo[vertex * 3 + channel] as number) +
              (data.albedo[vertex * 3 + 3 + channel] as number) +
              (data.albedo[vertex * 3 + 6 + channel] as number)) /
            3,
        );
        add(data.positions, vertex * 3, prop.name, mesh, -1, albedo as unknown as Vec3);
      }
    }
  let chart = 0;
  for (const display of scene.charts.display)
    for (let at = 0; at < display.positions.length; at += 18, chart++) {
      // A relieved chart (the rug) is many cells: one number each is harmless, none of them is the still's.
      add(display.positions, at, 'chart', GROUPS[display.group] as string, chart, [0, 0, 0]);
      add(display.positions, at + 9, 'chart', GROUPS[display.group] as string, chart, [0, 0, 0]);
    }
  // The glass as tv/tvGlass.ts makes it: a grid bulging towards the viewer, a parabola each way.
  const { left, right, top, bottom, front, bulge, columns, rows } = TV_SPEC.glass;
  const at = (column: number, row: number): Vec3 => {
    const [u, v] = [column / columns, row / rows];
    const [s, t] = [2 * u - 1, 2 * v - 1];
    return [front + bulge[0] * s * s + bulge[1] * t * t, top - (top - bottom) * v, left + (right - left) * u];
  };
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const [a, b, c, d] = [at(column, row), at(column, row + 1), at(column + 1, row), at(column + 1, row + 1)];
      add([...a, ...b, ...c], 0, 'glass', 'glass', -1, [0, 0, 0]);
      add([...c, ...b, ...d], 0, 'glass', 'glass', -1, [0, 0, 0]);
    }
  return { scene, positions: new Float32Array(positions), triangles };
}

/** The viewports the still is held to (docs/ROOM.md › Startup), with the touch pad's insets where a screen has one. */
export const FAMILY: readonly (readonly [width: number, height: number, touch: boolean])[] = [
  [1440, 900, false],
  [1920, 1080, false],
  [2560, 1080, false],
  [1280, 720, false],
  [1000, 950, false],
  [1200, 500, false],
  [500, 450, false],
  [700, 1000, false],
  [1024, 768, true],
  [768, 1024, true],
  [390, 844, true],
  [360, 640, true],
  [320, 568, true],
  [412, 915, true],
  [844, 390, true],
  [667, 375, true],
];

/** The touch pad's strips (app/overlays/touchpad/TouchPad.css): a band under a portrait picture, clusters beside a landscape one. */
export function padInsets(width: number, height: number, touch: boolean): StillInsets {
  if (!touch) return { left: 0, right: 0, bottom: 0 };
  return width >= height ? { left: 138, right: 174, bottom: 0 } : { left: 0, right: 0, bottom: 228 };
}

const COS = Math.cos((4 * Math.PI) / 180);
const SIN = Math.sin((4 * Math.PI) / 180);

/** The still's camera for a viewport as a pinhole, `density` raster pixels a CSS pixel. */
export function pinholeOf(camera: StillCamera, height: number, density: number): Pinhole {
  return {
    eye: unseen(camera.eye),
    right: [0, 0, 1],
    up: [SIN, COS, 0],
    forward: [COS, -SIN, 0],
    scale: (height / 2 / Math.tan((camera.fov * Math.PI) / 360)) * density,
  };
}

export function cameraFor(framing: StillFraming, width: number, height: number, touch: boolean): StillCamera {
  return stillCamera(framing, width, height, padInsets(width, height, touch));
}
