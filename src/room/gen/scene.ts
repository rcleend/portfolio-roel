import { ART_SIZE, artUv } from './art';
import { type Making, MeshBuilder, type MeshData } from './kit/builder';
import { type Chart, type ChartMeshes, chartMeshes, type PackedPage, packCharts } from './kit/charts';
import { cabinet } from './props/cabinet';
import { bulbLamp, opalLamp } from './props/cabinetLamps';
import { consoleCables, floorGame, gameConsole, gamepads } from './props/console';
import { basket, chair, desk, desktop, towerAndLamp } from './props/deskCorner';
import { dresser, dresserBooksAndLead, guitar } from './props/dresserCorner';
import { lavaLamp } from './props/lavaLamp';
import { plant } from './props/plant';
import { radio } from './props/radio';
import { RADIO_MESHES } from './props/radioSpec';
import { ceilings, door, floor, rug, walls, windowFrame } from './props/shell';
import { tvSet } from './props/tvSet';
import type { Decal, MeshName, Prop } from './props/types';
import { PC_SPEC } from './roomSpec';

/** The whole room, prop by prop. */
export const PROPS: readonly Prop[] = [
  tvSet,
  cabinet,
  opalLamp,
  bulbLamp,
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
  /** How finely the props are built, 0–1 (PropSink.detail); full where it is left out. */
  readonly detail?: number;
}

export interface PropStats {
  readonly name: string;
  readonly triangles: number;
  readonly budget: number;
  /** Where its vertex-lit geometry is in each mesh it added to: the first vertex and how many. */
  readonly ranges: Readonly<Partial<Record<MeshName, readonly [start: number, count: number]>>>;
  /** Its decals among the scene's: the first and how many. */
  readonly decals: readonly [start: number, count: number];
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

// 'desk' is last: the bake's colours follow this order, and the meshes before it keep their places in them.
const MESHES: readonly MeshName[] = [
  'tv',
  'monitor',
  'props',
  'globe',
  'filament',
  'bulb',
  'glass',
  ...RADIO_MESHES,
  'desk',
];

/** Runs every prop's generator; pure, so it runs the same in a worker, on the main thread and in tests. */
export function buildScene(request: GenRequest, now: () => number = () => performance.now()): GenScene {
  const started = now();
  const builders = Object.fromEntries(MESHES.map((name) => [name, new MeshBuilder()])) as Record<MeshName, MeshBuilder>;
  const charts: Chart[] = [];
  const decals: Decal[] = [];
  const props: PropStats[] = [];
  // A chart is two triangles, or its relief's cells; a decal is two.
  const flat = (): number =>
    charts.reduce((sum, chart) => sum + (chart.relief ? chart.relief.cells[0] * chart.relief.cells[1] * 2 : 2), 0) +
    decals.length * 2;
  // The tier that draws without multisampling has the drawn making of everything, and nothing to choose between.
  const only: Making | null = (request.detail ?? 1) < 0.5 ? 'drawn' : null;
  let current: Making | null = null;
  const making = (next: Making | null): void => {
    current = next;
    for (const name of MESHES) builders[name].make(next);
  };
  for (const prop of PROPS) {
    const counts = MESHES.map((name) => builders[name].triangles);
    const standing = MESHES.map((name) => builders[name].standing);
    const before = counts.reduce((sum, count) => sum + count, 0) + flat();
    const firstDecal = decals.length;
    prop.build({
      detail: request.detail ?? 1,
      only,
      making: (which, make) => {
        if (only) {
          if (which === only) make();
          return;
        }
        making(which);
        make();
        making(null);
      },
      mesh: (name) => builders[name],
      // A drawn chart is packed late: the built room's charts stay where they were without it.
      chart: (...added) =>
        void charts.push(
          ...added.map((chart) =>
            current ? { ...chart, making: current, late: current === 'drawn' || chart.late } : chart,
          ),
        ),
      decal: (decal) => void decals.push(decal),
    });
    // The monitor is a mesh of its own (the spotlight lights and bounces it apart from the desk): whatever of the
    // desktop set lies inside the monitor's outline, whichever mesh its generator added it to.
    if (prop.name === 'desktop') {
      const { min, max } = PC_SPEC.shell;
      const slack = 0.004;
      builders.monitor.take(builders.desk, counts[MESHES.indexOf('desk')] as number, (point) =>
        point.every((value, axis) => value >= (min[axis] as number) - slack && value <= (max[axis] as number) + slack),
      );
    }
    const after = MESHES.reduce((sum, name) => sum + builders[name].triangles, 0) + flat();
    const ranges: Partial<Record<MeshName, readonly [number, number]>> = {};
    MESHES.forEach((name, index) => {
      // The drawn making's triangles are kept after every prop's (MeshBuilder.finish), outside these ranges.
      const added = builders[name].standing - (standing[index] as number);
      if (added > 0) ranges[name] = [(standing[index] as number) * 3, added * 3];
    });
    props.push({
      name: prop.name,
      triangles: after - before,
      budget: prop.budget,
      ranges,
      decals: [firstDecal, decals.length - firstDecal],
    });
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
  const take = (array: Float32Array | Uint32Array) => buffers.push(array.buffer as ArrayBuffer);
  for (const mesh of Object.values(scene.meshes))
    for (const array of Object.values(mesh)) if (ArrayBuffer.isView(array)) take(array as Float32Array);
  for (const mesh of scene.charts.display)
    for (const array of [mesh.positions, mesh.normals, mesh.uvs, ...(mesh.index ? [mesh.index] : [])]) take(array);
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
