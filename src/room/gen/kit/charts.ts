import type { Making, Shown, Vec3 } from './builder';
import { add, cross, length, normalize, scale, twiceMade } from './builder';

/**
 * A chart: a flat rectangle of the room that takes its light from a texture (the floor, a wall, a cabinet's faces, a
 * printed cover). Generated geometry knows its own rectangles, so nothing is unwrapped: a chart is packed into a page
 * at its own texel density and baked there.
 */
export interface Chart {
  /** The page (texture) it is packed into. */
  readonly page: number;
  /** The mesh it draws with: charts of one group share a material (its varnish, its name for the finish). */
  readonly group: number;
  /** One corner and the two edges from it; the chart faces `u × v`. */
  readonly origin: Vec3;
  readonly u: Vec3;
  readonly v: Vec3;
  /** The surface function that paints it (materials.ts) and its parameters. */
  readonly material: number;
  readonly params: readonly [number, number, number, number];
  /** Texels a metre at full quality. */
  readonly density: number;
  /** Occlusion the surface knows about itself, multiplied into the ambient light. */
  readonly shade: number;
  /** The normal its light falls on, where that is not the rectangle's own (a flat sheet drawn as tilted slats). */
  readonly lit?: Vec3;
  /**
   * Packed after the page's other charts, into the room a shelf of theirs has left: a chart that only one tier has
   * then moves none of the others, whose dither and filtering are their place's.
   */
  readonly late?: boolean;
  /** The making it belongs to, where a part is made twice; both where it is left out. */
  readonly making?: Making;
  /**
   * A sheet that does not lie flat (a rug): cut into `cells` across u and v, each vertex lifted off the rectangle's
   * plane along u × v by `height(s, t)` metres (s and t run 0–1 across it). Its texels stay the flat rectangle's;
   * the light is baked on the lifted surface. A cell is two triangles, parted along its (1, 0)–(0, 1) diagonal.
   */
  readonly relief?: {
    readonly cells: readonly [number, number];
    readonly height: (s: number, t: number) => number;
    /** The slopes its light is baked with, as a multiple of the real ones (1): soft cloth reads by its shading. */
    readonly emphasis?: number;
  };
}

export interface PackedChart extends Chart {
  /** Its rectangle in the page, in texels (the gutter is outside it). */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PackedPage {
  readonly width: number;
  readonly height: number;
  readonly charts: readonly PackedChart[];
}

/** Texels between charts: bilinear filtering and the first mip levels never read a neighbour. */
export const GUTTER = 6;
/** How far past its rectangle a chart is baked, in texels, so its edge texels are whole. */
export const BLEED = 3;

/**
 * Packs each page's charts on shelves, tallest first, into the smallest power-of-two page that holds them, at most
 * `maxSize` a side: past that every chart of the page is drawn smaller until they fit.
 */
export function packCharts(charts: readonly Chart[], densityScale: number, maxSize: number): PackedPage[] {
  const pages: PackedPage[] = [];
  const count = charts.reduce((most, chart) => Math.max(most, chart.page + 1), 0);
  for (let page = 0; page < count; page++) {
    const own = charts.filter((chart) => chart.page === page);
    let factor = densityScale;
    for (;;) {
      const packed = shelves(own, factor, maxSize);
      if (packed) {
        pages.push(packed);
        break;
      }
      factor *= 0.9;
    }
  }
  return pages;
}

function shelves(charts: readonly Chart[], factor: number, maxSize: number): PackedPage | null {
  const sized = charts
    .map((chart) => ({
      chart,
      w: Math.max(2, Math.round(length(chart.u) * chart.density * factor)),
      h: Math.max(2, Math.round(length(chart.v) * chart.density * factor)),
    }))
    .sort((a, b) => Number(a.chart.late ?? false) - Number(b.chart.late ?? false) || b.h - a.h || b.w - a.w);
  for (let width = 64; width <= maxSize; width *= 2) {
    const placed: PackedChart[] = [];
    // The shelves so far: where each stands, how high it is and where its next chart goes.
    const rows: { y: number; h: number; x: number }[] = [];
    let fits = true;
    for (const { chart, w, h } of sized) {
      if (w + 2 * GUTTER > width) {
        fits = false;
        break;
      }
      const last = rows[rows.length - 1];
      let row = chart.late ? rows.find((each) => each.h >= h && each.x + w + GUTTER <= width) : last;
      if (!row || row.x + w + GUTTER > width) {
        row = { y: last ? last.y + last.h + GUTTER : GUTTER, h: 0, x: GUTTER };
        rows.push(row);
      }
      placed.push({ ...chart, x: row.x, y: row.y, w, h });
      row.x += w + GUTTER;
      row.h = Math.max(row.h, h);
    }
    const last = rows[rows.length - 1];
    const used = last ? last.y + last.h + GUTTER : GUTTER;
    if (!fits || used > maxSize) continue;
    let height = 64;
    while (height < used) height *= 2;
    return { width, height, charts: placed };
  }
  return null;
}

/** The six faces of an axis-aligned box as charts facing outward; `skip` leaves faces out (`-x`, `+y`, ...). */
export function boxCharts(
  min: Vec3,
  max: Vec3,
  base: Omit<Chart, 'origin' | 'u' | 'v'>,
  skip: readonly string[] = [],
): Chart[] {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const [dx, dy, dz] = [x1 - x0, y1 - y0, z1 - z0];
  const faces: [string, Vec3, Vec3, Vec3][] = [
    ['-x', [x0, y0, z0], [0, 0, dz], [0, dy, 0]],
    ['+x', [x1, y0, z1], [0, 0, -dz], [0, dy, 0]],
    ['-y', [x0, y0, z0], [dx, 0, 0], [0, 0, dz]],
    ['+y', [x0, y1, z1], [dx, 0, 0], [0, 0, -dz]],
    ['-z', [x1, y0, z0], [-dx, 0, 0], [0, dy, 0]],
    ['+z', [x0, y0, z1], [dx, 0, 0], [0, dy, 0]],
  ];
  return faces.filter(([name]) => !skip.includes(name)).map(([, origin, u, v]) => ({ ...base, origin, u, v }));
}

export interface ChartMeshes {
  /** Per group: the quads frames draw, with their page coordinates. */
  readonly display: readonly {
    readonly group: number;
    readonly page: number;
    readonly positions: Float32Array;
    readonly normals: Float32Array;
    readonly uvs: Float32Array;
    /** Where its charts are in two makings: the indices a frame draws, one run for each (`twiceMade`). */
    readonly index?: Uint32Array;
    readonly shown?: Shown;
  }[];
  /**
   * Per page: the quads the bake draws in the page's own space, each chart grown by BLEED texels with its surface
   * extrapolated to match and cut into cells of at most BAKE_CELL a side (six vertices a cell): world position,
   * normal, page coordinates, chart coordinates in metres, material and parameters, shade.
   */
  readonly bake: readonly {
    readonly page: number;
    readonly positions: Float32Array;
    readonly normals: Float32Array;
    readonly uvs: Float32Array;
    readonly local: Float32Array;
    /** The chart's own 0–1 coordinates (a print's). */
    readonly st: Float32Array;
    readonly material: Float32Array;
    readonly params: Float32Array;
    readonly shade: Float32Array;
  }[];
}

const CORNERS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 0],
  [1, 1],
  [0, 1],
];

/** A cell's two triangles, parted along the diagonal from (1, 0) to (0, 1). */
const CELL: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 0],
  [1, 1],
  [0, 1],
];

interface Lists {
  positions: number[];
  normals: number[];
  uvs: number[];
}

/** A chart with relief: its cells, for the frame and (grown by BLEED at the rectangle's rim) for the bake. */
function relieved(
  chart: PackedChart,
  page: PackedPage,
  normal: Vec3,
  display: Lists,
  bake: Lists & { local: number[]; st: number[]; material: number[]; params: number[]; shade: number[] },
): void {
  const relief = chart.relief;
  if (!relief) return;
  const [nu, nv] = relief.cells;
  const [lu, lv] = [length(chart.u), length(chart.v)];
  const [uHat, vHat] = [normalize(chart.u), normalize(chart.v)];
  const clamp = (x: number): number => Math.min(1, Math.max(0, x));
  const height = (s: number, t: number): number => relief.height(clamp(s), clamp(t));
  const at = (s: number, t: number): Vec3 =>
    add(add(chart.origin, add(scale(chart.u, s), scale(chart.v, t))), scale(normal, height(s, t)));
  // The lifted surface's normal, from the height's slope across a twentieth of a cell.
  const [es, et] = [0.05 / nu, 0.05 / nv];
  const facing = (s: number, t: number): Vec3 => {
    const slopeU = (height(s + es, t) - height(s - es, t)) / (2 * es * lu);
    const slopeV = (height(s, t + et) - height(s, t - et)) / (2 * et * lv);
    const k = relief.emphasis ?? 1;
    return normalize(add(normal, add(scale(uHat, -slopeU * k), scale(vHat, -slopeV * k))));
  };
  const pageUv = (s: number, t: number): [number, number] => [
    (chart.x + 0.5 + s * (chart.w - 1)) / page.width,
    (chart.y + 0.5 + t * (chart.h - 1)) / page.height,
  ];
  const [bleedS, bleedT] = [(BLEED - 0.5) / (chart.w - 1), (BLEED - 0.5) / (chart.h - 1)];
  // Every lattice point once: its place and its normal.
  const lattice: { p: Vec3; n: Vec3 }[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) lattice.push({ p: at(i / nu, j / nv), n: facing(i / nu, j / nv) });
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++)
      for (const [ci, cj] of CELL) {
        const [s, t] = [(i + ci) / nu, (j + cj) / nv];
        const point = lattice[(j + cj) * (nu + 1) + i + ci] as { p: Vec3; n: Vec3 };
        display.positions.push(...point.p);
        display.normals.push(...point.n);
        display.uvs.push(...pageUv(s, t));
        // The bake's rim vertices stand BLEED texels past the rectangle, on the rim's own height.
        const rim = i + ci === 0 || i + ci === nu || j + cj === 0 || j + cj === nv;
        const bs = i + ci === 0 ? -bleedS : i + ci === nu ? 1 + bleedS : s;
        const bt = j + cj === 0 ? -bleedT : j + cj === nv ? 1 + bleedT : t;
        bake.positions.push(...(rim ? at(bs, bt) : point.p));
        bake.normals.push(...point.n);
        bake.uvs.push(...pageUv(bs, bt));
        bake.local.push(bs * lu, bt * lv);
        bake.st.push(bs, bt);
        bake.material.push(chart.material);
        bake.params.push(...chart.params);
        bake.shade.push(chart.shade);
      }
}

/** A bake cell's longest side, in metres. */
export const BAKE_CELL = 0.5;

/** Where a chart side of `metres` is cut into cells, in the chart's 0–1 coordinate, `bleed` past both ends. */
function cuts(metres: number, bleed: number): number[] {
  const cells = Math.max(1, Math.ceil(metres / BAKE_CELL));
  return Array.from({ length: cells + 1 }, (_, i) => (i === 0 ? -bleed : i === cells ? 1 + bleed : i / cells));
}

export function chartMeshes(pages: readonly PackedPage[]): ChartMeshes {
  // A chart is two triangles, or its relief's cells: `kinds` has each triangle's making (twiceMade).
  const display = new Map<string, Lists & { group: number; page: number; kinds: number[] }>();
  const bake: ChartMeshes['bake'][number][] = [];
  pages.forEach((page, pageIndex) => {
    const b = {
      positions: [] as number[],
      normals: [] as number[],
      uvs: [] as number[],
      local: [] as number[],
      st: [] as number[],
      material: [] as number[],
      params: [] as number[],
      shade: [] as number[],
    };
    for (const chart of page.charts) {
      const normal = normalize(cross(chart.u, chart.v));
      const key = `${chart.group}/${pageIndex}`;
      let d = display.get(key);
      if (!d) {
        d = { group: chart.group, page: pageIndex, positions: [], normals: [], uvs: [], kinds: [] };
        display.set(key, d);
      }
      const triangles = chart.relief ? chart.relief.cells[0] * chart.relief.cells[1] * 2 : 2;
      for (let t = 0; t < triangles; t++) d.kinds.push(chart.making === 'built' ? 1 : chart.making === 'drawn' ? 2 : 0);
      const [lu, lv] = [length(chart.u), length(chart.v)];
      if (chart.relief) {
        relieved(chart, page, normal, d, b);
        continue;
      }
      const lit = chart.lit ?? normal;
      for (const [s, t] of CORNERS) {
        const p = add(chart.origin, add(scale(chart.u, s), scale(chart.v, t)));
        d.positions.push(...p);
        d.normals.push(...lit);
        // Texel centres of the chart's outermost texels: the rectangle's edge maps half a texel in.
        d.uvs.push((chart.x + 0.5 + s * (chart.w - 1)) / page.width, (chart.y + 0.5 + t * (chart.h - 1)) / page.height);
      }
      // The bake's quads: the chart, BLEED texels past its rectangle on the same plane (a texel centre at 0.5 is the
      // corner), cut into cells so the bake can light the part of a floor or a wall a view shows before the rest.
      const across = cuts(lu, (BLEED - 0.5) / (chart.w - 1));
      const up = cuts(lv, (BLEED - 0.5) / (chart.h - 1));
      for (let j = 0; j + 1 < up.length; j++)
        for (let i = 0; i + 1 < across.length; i++)
          for (const [s, t] of CORNERS) {
            const bs = across[i + s] as number;
            const bt = up[j + t] as number;
            b.positions.push(...add(chart.origin, add(scale(chart.u, bs), scale(chart.v, bt))));
            b.normals.push(...lit);
            b.uvs.push(
              (chart.x + 0.5 + bs * (chart.w - 1)) / page.width,
              (chart.y + 0.5 + bt * (chart.h - 1)) / page.height,
            );
            b.local.push(bs * lu, bt * lv);
            b.st.push(bs, bt);
            b.material.push(chart.material);
            b.params.push(...chart.params);
            b.shade.push(chart.shade);
          }
    }
    bake.push({
      page: pageIndex,
      positions: new Float32Array(b.positions),
      normals: new Float32Array(b.normals),
      uvs: new Float32Array(b.uvs),
      local: new Float32Array(b.local),
      st: new Float32Array(b.st),
      material: new Float32Array(b.material),
      params: new Float32Array(b.params),
      shade: new Float32Array(b.shade),
    });
  });
  return {
    display: [...display.values()].map((d) => ({
      group: d.group,
      page: d.page,
      positions: new Float32Array(d.positions),
      normals: new Float32Array(d.normals),
      uvs: new Float32Array(d.uvs),
      // A page's drawn charts are packed last (`late`), so they are a group's last too.
      ...(d.kinds.some((kind) => kind > 0) ? twiceMade(d.kinds) : {}),
    })),
    bake,
  };
}
