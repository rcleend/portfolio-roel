import type { Vec3 } from './builder';
import { add, cross, length, normalize, scale } from './builder';

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
    .sort((a, b) => b.h - a.h || b.w - a.w);
  for (let width = 64; width <= maxSize; width *= 2) {
    const placed: PackedChart[] = [];
    let [x, y, shelf] = [GUTTER, GUTTER, 0];
    let fits = true;
    for (const { chart, w, h } of sized) {
      if (w + 2 * GUTTER > width) {
        fits = false;
        break;
      }
      if (x + w + GUTTER > width) {
        x = GUTTER;
        y += shelf + GUTTER;
        shelf = 0;
      }
      placed.push({ ...chart, x, y, w, h });
      x += w + GUTTER;
      shelf = Math.max(shelf, h);
    }
    const used = y + shelf + GUTTER;
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
  }[];
  /**
   * Per page: the quads the bake draws in the page's own space, each grown by BLEED texels with its surface
   * extrapolated to match: world position, normal, page coordinates, chart coordinates in metres, material and
   * parameters, shade.
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

export function chartMeshes(pages: readonly PackedPage[]): ChartMeshes {
  const display = new Map<
    string,
    { group: number; page: number; positions: number[]; normals: number[]; uvs: number[] }
  >();
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
        d = { group: chart.group, page: pageIndex, positions: [], normals: [], uvs: [] };
        display.set(key, d);
      }
      const [lu, lv] = [length(chart.u), length(chart.v)];
      for (const [s, t] of CORNERS) {
        const p = add(chart.origin, add(scale(chart.u, s), scale(chart.v, t)));
        d.positions.push(...p);
        d.normals.push(...normal);
        // Texel centres of the chart's outermost texels: the rectangle's edge maps half a texel in.
        d.uvs.push((chart.x + 0.5 + s * (chart.w - 1)) / page.width, (chart.y + 0.5 + t * (chart.h - 1)) / page.height);
        // The bake's quad: BLEED texels past the rectangle, on the same plane. A texel centre at 0.5 is the corner.
        const bs = s === 0 ? -(BLEED - 0.5) / (chart.w - 1) : 1 + (BLEED - 0.5) / (chart.w - 1);
        const bt = t === 0 ? -(BLEED - 0.5) / (chart.h - 1) : 1 + (BLEED - 0.5) / (chart.h - 1);
        const q = add(chart.origin, add(scale(chart.u, bs), scale(chart.v, bt)));
        b.positions.push(...q);
        b.normals.push(...normal);
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
    })),
    bake,
  };
}
