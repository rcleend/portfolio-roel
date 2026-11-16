import { ART_SIZE, artUv } from './art';
import { MeshBuilder, type MeshData } from './kit/builder';
import { type Chart, type ChartMeshes, chartMeshes, type PackedPage, packCharts } from './kit/charts';
import { cabinet } from './props/cabinet';
import { consoleCables, floorGame, gameConsole, gamepads } from './props/console';
import { basket, chair, desk, desktop, towerAndLamp } from './props/deskCorner';
import { dresser, dresserBooksAndLead, guitar } from './props/dresserCorner';
import { opalLamp, toyRobot } from './props/lampAndRobot';
import { lavaLamp } from './props/lavaLamp';
import { plant } from './props/plant';
import { radio } from './props/radio';
import { RADIO_MESHES } from './props/radioSpec';
import { ceilings, door, floor, rug, walls, windowFrame } from './props/shell';
import { tvSet } from './props/tvSet';
import type { Decal, MeshName, Prop } from './props/types';

/** Everything generated so far: the opening TV view's props and the room's shell. */
export const PROPS: readonly Prop[] = [
  tvSet,
  cabinet,
  opalLamp,
  toyRobot,
  plant,
  floor,
  rug,
  walls,
  ceilings,
  door,
  windowFrame,
  desk,
  chair,
  basket,
  towerAndLamp,
  desktop,
  dresser,
  dresserBooksAndLead,
  guitar,
  gameConsole,
  gamepads,
  consoleCables,
  floorGame,
  lavaLamp,
  radio,
];

export interface GenRequest {
  /** Chart texels a metre, as a fraction of full quality, and the largest page side (the quality tier's). */
  readonly densityScale: number;
  readonly maxPageSize: number;
}

export interface PropStats {
  readonly name: string;
  readonly triangles: number;
  readonly budget: number;
}

/** The generated room as flat arrays: built in a worker, transferred, and turned into meshes by GeneratedRoom. */
export interface GenScene {
  readonly meshes: Readonly<Record<MeshName, MeshData>>;
  readonly pages: readonly { readonly width: number; readonly height: number }[];
  readonly charts: ChartMeshes;
  /** The decals' quads: positions, art-page coordinates and tint, a vertex each. */
  readonly decals: { readonly positions: Float32Array; readonly uvs: Float32Array; readonly tints: Float32Array };
  readonly props: readonly PropStats[];
  /** How long building took, in the thread that built it (ms). */
  readonly buildMs: number;
}

const MESHES: readonly MeshName[] = ['tv', 'props', 'globe', 'eyes', 'glass', ...RADIO_MESHES];

/** Runs every prop's generator; pure, so it runs the same in a worker, on the main thread and in tests. */
export function buildScene(request: GenRequest, now: () => number = () => performance.now()): GenScene {
  const started = now();
  const builders = Object.fromEntries(MESHES.map((name) => [name, new MeshBuilder()])) as Record<MeshName, MeshBuilder>;
  const charts: Chart[] = [];
  const decals: Decal[] = [];
  const props: PropStats[] = [];
  for (const prop of PROPS) {
    const before =
      MESHES.reduce((sum, name) => sum + builders[name].triangles, 0) + (charts.length + decals.length) * 2;
    prop.build({
      mesh: (name) => builders[name],
      chart: (...added) => void charts.push(...added),
      decal: (decal) => void decals.push(decal),
    });
    const after = MESHES.reduce((sum, name) => sum + builders[name].triangles, 0) + (charts.length + decals.length) * 2;
    props.push({ name: prop.name, triangles: after - before, budget: prop.budget });
  }
  const pages: PackedPage[] = packCharts(charts, request.densityScale, request.maxPageSize);
  return {
    meshes: Object.fromEntries(MESHES.map((name) => [name, builders[name].finish()])) as Record<MeshName, MeshData>,
    pages: pages.map(({ width, height }) => ({ width, height })),
    charts: chartMeshes(pages),
    decals: decalQuads(decals),
    props,
    buildMs: now() - started,
  };
}

const QUAD: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 0],
  [1, 1],
  [0, 1],
];

function decalQuads(decals: readonly Decal[]): GenScene['decals'] {
  const positions: number[] = [];
  const uvs: number[] = [];
  const tints: number[] = [];
  for (const decal of decals) {
    const [x, y, w, h] = artUv(decal.art);
    for (const [s, t] of QUAD) {
      positions.push(
        decal.origin[0] + decal.u[0] * s + decal.v[0] * t,
        decal.origin[1] + decal.u[1] * s + decal.v[1] * t,
        decal.origin[2] + decal.u[2] * s + decal.v[2] * t,
      );
      // The art page's rows run downwards.
      uvs.push(x + s * w, y + (1 - t) * h);
      tints.push(...decal.tint);
    }
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), tints: new Float32Array(tints) };
}

/** Every buffer of a scene, for a transfer out of the worker without a copy. */
export function transferables(scene: GenScene): ArrayBuffer[] {
  const buffers: ArrayBuffer[] = [];
  const take = (array: Float32Array) => buffers.push(array.buffer as ArrayBuffer);
  for (const mesh of Object.values(scene.meshes)) for (const array of Object.values(mesh)) take(array as Float32Array);
  for (const mesh of scene.charts.display) for (const array of [mesh.positions, mesh.normals, mesh.uvs]) take(array);
  for (const mesh of scene.charts.bake)
    for (const array of [
      mesh.positions,
      mesh.normals,
      mesh.uvs,
      mesh.local,
      mesh.st,
      mesh.material,
      mesh.params,
      mesh.shade,
    ])
      take(array);
  for (const array of Object.values(scene.decals)) take(array);
  return buffers;
}

export { ART_SIZE };
