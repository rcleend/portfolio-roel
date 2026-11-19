import { describe, expect, it } from 'vitest';
import { BULB_LAMP_INTENSITY } from '../atmosphere/bulbLamp';
import { ROOM_MOODS } from '../atmosphere/moods';
import { TV_LAMP_INTENSITY as ROOM_LAMP_INTENSITY } from '../atmosphere/tvLamp';
import { QUALITY_TIERS } from '../stage/quality';
import { rigViews } from './bake/Baker';
import { type Making, MeshBuilder } from './kit/builder';
import { BAKE_CELL, BLEED, type Chart, chartMeshes, packCharts } from './kit/charts';
import { hash2, hash32, seeded } from './kit/hash';
import { MATERIAL, SLATS } from './materials';
import { LAVA } from './props/lavaWax';
import { BLIND } from './props/shell';
import { FLOOR, type MeshName } from './props/types';
import { RIG } from './rig';
import { BULB_SPEC, LAVA_BOUNDS, PC_SPEC, PICK_PROPS, TV_LAMP_SPEC, TV_SPEC } from './roomSpec';
import { buildScene, PROPS } from './scene';
import { GENERATED_TIERS, POOL_WARMTH, TV_LAMP_INTENSITY } from './tiers';

const scene = buildScene({ densityScale: 1, maxPageSize: 2048 }, () => 0);

describe('the generated room', () => {
  it('keeps every prop inside its triangle budget', () => {
    expect(scene.props.map((prop) => prop.name)).toEqual(PROPS.map((prop) => prop.name));
    for (const prop of scene.props) expect(prop.triangles, prop.name).toBeLessThanOrEqual(prop.budget);
  });

  it('builds the same room every time', () => {
    const again = buildScene({ densityScale: 1, maxPageSize: 2048 }, () => 0);
    expect(again.meshes.props.positions).toEqual(scene.meshes.props.positions);
    expect(again.charts.bake[0]?.uvs).toEqual(scene.charts.bake[0]?.uvs);
  });

  it('gives every vertex a unit normal and a finite position', () => {
    for (const mesh of Object.values(scene.meshes)) {
      expect(mesh.positions.length % 9).toBe(0);
      for (let i = 0; i < mesh.positions.length; i += 3) {
        const length = Math.hypot(mesh.normals[i] ?? 0, mesh.normals[i + 1] ?? 0, mesh.normals[i + 2] ?? 0);
        expect(Number.isFinite(mesh.positions[i])).toBe(true);
        expect(length).toBeCloseTo(1, 3);
      }
    }
  });

  it('packs charts inside their pages without overlap', () => {
    scene.charts.bake.forEach((mesh, page) => {
      const size = scene.pages[page];
      expect(size).toBeDefined();
      for (const value of mesh.uvs) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });
  });

  it('draws smaller pages on a lower tier', () => {
    const small = buildScene({ densityScale: 0.5, maxPageSize: 1024 }, () => 0);
    small.pages.forEach((page, index) => {
      expect(page.width * page.height).toBeLessThan(
        (scene.pages[index]?.width ?? 0) * (scene.pages[index]?.height ?? 0),
      );
    });
  });
});

describe('the parts made twice, for frames with and without multisampling (docs/ROOM.md › Lines without multisampling)', () => {
  /** A tier's charts, as its generators add them: each with its making, the drawn ones packed late (scene.ts). */
  const chartsOf = (tier: keyof typeof GENERATED_TIERS): Chart[] => {
    const charts: Chart[] = [];
    const builder = new MeshBuilder();
    const only = GENERATED_TIERS[tier].detail < 0.5 ? ('drawn' as const) : null;
    let current: Making | null = null;
    for (const prop of PROPS)
      prop.build({
        detail: GENERATED_TIERS[tier].detail,
        only,
        making: (which, make) => {
          if (only && which !== only) return;
          current = only ? null : which;
          make();
          current = null;
        },
        mesh: () => builder,
        chart: (...added) =>
          void charts.push(
            ...added.map((chart) =>
              current ? { ...chart, making: current, late: current === 'drawn' || chart.late } : chart,
            ),
          ),
        decal: () => {},
      });
    return charts;
  };
  const tiers = ['high', 'medium', 'low'] as const;
  const built = (tier: (typeof tiers)[number]) =>
    buildScene(
      {
        densityScale: GENERATED_TIERS[tier].density,
        maxPageSize: GENERATED_TIERS[tier].pageSize,
        detail: GENERATED_TIERS[tier].detail,
      },
      () => 0,
    );

  it('has both makings in a room that may be drawn either way, and the drawn one alone in the lowest tier', () => {
    expect(tiers.map((tier) => QUALITY_TIERS[tier].samples > 0)).toEqual([true, true, false]);
    for (const tier of ['high', 'medium'] as const) {
      const { props } = built(tier).meshes;
      const index = [...(props.index ?? [])];
      const [first, count] = props.shown?.drawn ?? [0, 0];
      const vertices = props.positions.length / 3;
      // The built making's run is the mesh without the drawn making's vertices, which are its last, in order.
      expect(props.shown?.built).toEqual([0, first]);
      expect(index.slice(0, first)).toEqual([...Array(first).keys()]);
      expect(first).toBeLessThan(vertices);
      // The drawn making's run: some of those again, then every vertex of its own, and nothing of the built one's
      // alone.
      const drawn = index.slice(first, first + count);
      expect(drawn.slice(-(vertices - first))).toEqual(Array.from({ length: vertices - first }, (_, i) => first + i));
      expect(new Set(drawn).size).toBe(drawn.length);
      expect(drawn.length - (vertices - first)).toBeLessThan(first);
      expect(chartsOf(tier).some((chart) => chart.material === MATERIAL.slats && chart.making === 'drawn')).toBe(true);
    }
    const low = built('low');
    expect(low.meshes.props.index).toBeUndefined();
    expect(low.charts.display.every((mesh) => !mesh.index)).toBe(true);
    expect(chartsOf('low').some((chart) => chart.material === MATERIAL.slats)).toBe(true);
  });

  it('packs the drawn charts late: they move and shrink none of the built room', () => {
    for (const tier of ['high', 'medium'] as const) {
      const charts = chartsOf(tier);
      const place = (list: readonly Chart[]) =>
        packCharts(list, GENERATED_TIERS[tier].density, GENERATED_TIERS[tier].pageSize).map((page) => [
          page.width,
          page.height,
          ...page.charts.filter((chart) => chart.making !== 'drawn').map(({ x, y, w, h }) => [x, y, w, h]),
        ]);
      expect(charts.filter((chart) => chart.making === 'drawn').every((chart) => chart.late)).toBe(true);
      expect(place(charts)).toEqual(place(charts.filter((chart) => chart.making !== 'drawn')));
    }
  });

  it("draws the blind's slats where its generator builds them", () => {
    const sheet = chartsOf('low').find((chart) => chart.material === MATERIAL.slats);
    if (!sheet) throw new Error('The lowest tier has no drawn blind');
    expect(SLATS.count).toBe(BLIND.slats);
    expect(SLATS.pitch).toBeCloseTo((BLIND.top - BLIND.bottom) / (BLIND.slats - 1), 4);
    expect(SLATS.closes).toBeCloseTo(BLIND.skew / (BLIND.slats - 1), 4);
    // Its u runs up it from the lowest slat's foot, its v from the right end along the crooked bottom rail.
    expect(sheet.origin[1] - BLIND.skew).toBeCloseTo(BLIND.bottom - SLATS.foot, 6);
    expect(sheet.u[0]).toBe(0);
    expect(sheet.v[1]).toBeCloseTo(-BLIND.skew, 6);
    expect(sheet.origin[1] + sheet.u[1] - BLIND.skew).toBeCloseTo(BLIND.head, 6);
  });

  it('moves and shrinks no other chart of the page the blind is packed into, in the lowest tier', () => {
    const tier = GENERATED_TIERS.low;
    const low = chartsOf('low');
    const place = (charts: readonly Chart[]) =>
      packCharts(charts, tier.density, tier.pageSize).map((page) =>
        page.charts.filter((chart) => !chart.late).map(({ x, y, w, h }) => [x, y, w, h]),
      );
    expect(low.some((chart) => chart.late)).toBe(true);
    expect(place(low)).toEqual(place(low.filter((chart) => !chart.late)));
  });
});

describe('integer hashes', () => {
  it('are the published lowbias32 values, so every GPU and this code agree', () => {
    expect(hash32(0)).toBe(0);
    expect(hash32(1)).toBeGreaterThan(0);
    expect(hash2(3, 7)).toBe(hash2(3, 7));
    expect(hash2(3, 7)).not.toBe(hash2(7, 3));
    const random = seeded(1);
    const values = [random(), random(), random()];
    expect(new Set(values).size).toBe(3);
    for (const value of values) expect(value).toBeGreaterThanOrEqual(0);
  });
});

describe('the bake', () => {
  it('renders every light from every point of its emitter, fewer on the lowest tier', () => {
    const full = rigViews(0);
    const least = rigViews(1);
    const expected = RIG.reduce((sum, light) => sum + light.samples[0] * (light.kind === 'omni' ? 6 : 1), 0);
    expect(full).toHaveLength(expected);
    expect(least.length).toBeLessThan(full.length);
    // Each light's views share its light out: a spot's colours add up to its own.
    const pool = full.filter((view) => view.light.name === 'pool');
    expect(pool.reduce((sum, view) => sum + view.color[0], 0)).toBeCloseTo(
      RIG.find((l) => l.name === 'pool')?.color[0] ?? 0,
      5,
    );
  });

  it('keeps its copies of the finish in step with the room', () => {
    expect(TV_LAMP_INTENSITY).toBe(ROOM_LAMP_INTENSITY);
    const bulb = RIG.find((light) => light.name === 'bulb');
    expect(bulb?.color[0]).toBeCloseTo(BULB_LAMP_INTENSITY / ROOM_LAMP_INTENSITY, 6);
    expect(POOL_WARMTH.original).toBe(0);
    for (const mood of ['honey', 'rose', 'midnight'] as const)
      expect(POOL_WARMTH[mood]).toBe(ROOM_MOODS[mood].finish.warmth);
  });

  it('has settings for every quality tier, none larger than the one above', () => {
    expect(Object.keys(GENERATED_TIERS)).toEqual(Object.keys(QUALITY_TIERS));
    expect(GENERATED_TIERS.medium.pageSize).toBeLessThanOrEqual(GENERATED_TIERS.high.pageSize);
    expect(GENERATED_TIERS.low.shadowSize).toBeLessThanOrEqual(GENERATED_TIERS.medium.shadowSize);
  });
});

/** The bounds of `count` vertices of a position array from vertex `start`. */
function boundsOf(positions: Float32Array, start = 0, count = positions.length / 3) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let vertex = start; vertex < start + count; vertex++)
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[vertex * 3 + axis] as number;
      min[axis] = Math.min(min[axis] as number, value);
      max[axis] = Math.max(max[axis] as number, value);
    }
  return { min, max };
}

describe("the room's spec (roomSpec.ts) against the generators", () => {
  it('has the TV set where its generator builds it', () => {
    const { min, max } = boundsOf(scene.meshes.tv.positions);
    // Within a millimetre, and nothing in front of the box: the buttons and the jacks end on its front plane.
    for (let axis = 0; axis < 3; axis++) {
      expect(Math.abs((min[axis] as number) - (TV_SPEC.bounds.min[axis] as number)), `min ${axis}`).toBeLessThan(0.001);
      expect(Math.abs((max[axis] as number) - (TV_SPEC.bounds.max[axis] as number)), `max ${axis}`).toBeLessThan(0.001);
    }
    expect(min[0]).toBeGreaterThanOrEqual(TV_SPEC.bounds.min[0] - 1e-6);
    // The LED's lens is on the front panel, clear of the plinth and inside the set's width.
    expect(TV_SPEC.led[0]).toBeLessThan(TV_SPEC.bounds.min[0]);
    expect(TV_SPEC.led[0]).toBeGreaterThan(TV_SPEC.bounds.min[0] - 0.003);
  });

  it("keeps the TV's glass behind the set's front face and its picture inside the lip's opening", () => {
    const { glass, bounds } = TV_SPEC;
    // The glass bulges towards the viewer (−x) and never passes the front face.
    expect(glass.front).toBeGreaterThan(bounds.min[0]);
    expect(glass.left).toBeGreaterThan(bounds.min[2]);
    expect(glass.right).toBeLessThan(bounds.max[2]);
    expect(glass.top).toBeLessThan(bounds.max[1]);
    // The lip's innermost ring is the set's vertices deepest inside the casing's front: those behind the glass's
    // middle, in front of its seam, within the glass's rectangle. Every one of them lies behind the glass there, so
    // the glass closes the opening and the lip never pokes through it.
    const positions = scene.meshes.tv.positions;
    let ring = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const [x, y, z] = [positions[i] as number, positions[i + 1] as number, positions[i + 2] as number];
      if (z <= glass.left || z >= glass.right || y <= glass.bottom || y >= glass.top || x > 2.19) continue;
      const s = (2 * (z - glass.left)) / (glass.right - glass.left) - 1;
      const t = (2 * (glass.top - y)) / (glass.top - glass.bottom) - 1;
      const surface = glass.front + glass.bulge[0] * s * s + glass.bulge[1] * t * t;
      if (x > surface - 0.0005) ring++;
      // Nothing of the casing stands more than a hair in front of the glass inside the lip's inner opening.
      if (Math.abs(s) < 0.86 && Math.abs(t) < 0.86) expect(x, `${x}, ${y}, ${z}`).toBeGreaterThan(surface - 0.0005);
    }
    expect(ring).toBeGreaterThan(0);
  });

  it('has the monitor as a mesh of its own inside its outline, the keyboard and the mouse left with the desk', () => {
    const monitor = scene.meshes.monitor.positions;
    expect(monitor.length).toBeGreaterThan(0);
    const { min, max } = boundsOf(monitor);
    for (let axis = 0; axis < 3; axis++) {
      expect(min[axis]).toBeGreaterThan((PC_SPEC.shell.min[axis] as number) - 0.005);
      expect(max[axis]).toBeLessThan((PC_SPEC.shell.max[axis] as number) + 0.005);
      // And it fills that outline: the spec is the monitor's, not a box around the desk.
      expect(Math.abs((min[axis] as number) - (PC_SPEC.shell.min[axis] as number)), `min ${axis}`).toBeLessThan(0.005);
      expect(Math.abs((max[axis] as number) - (PC_SPEC.shell.max[axis] as number)), `max ${axis}`).toBeLessThan(0.005);
    }
    const desktop = scene.props.find((prop) => prop.name === 'desktop');
    expect(desktop?.ranges.monitor).toEqual([0, monitor.length / 3]);
    const [start, count] = desktop?.ranges.desk ?? [0, 0];
    expect(count).toBeGreaterThan(0);
    const rest = boundsOf(scene.meshes.desk.positions, start, count);
    // The keyboard and the mouse: in front of the monitor's face, on the desk top.
    expect(rest.min[2]).toBeGreaterThan(PC_SPEC.shell.max[2]);
    // (The keyboard's tilted tray dips a centimetre into the desk top at its near edge.)
    expect(rest.min[1]).toBeGreaterThan(PC_SPEC.deskTopY - 0.012);
    expect(rest.min[0]).toBeCloseTo(PC_SPEC.keyboard.min[0], 2);
    // (The mouse lies a little further back than the keyboard's far edge.)
    expect(rest.min[2]).toBeGreaterThan(PC_SPEC.keyboard.min[2] - 0.03);
    expect(rest.max[2]).toBeCloseTo(PC_SPEC.keyboard.max[2], 2);
  });

  it("keeps the monitor's glass inside the bezel's opening and behind its face", () => {
    const { glass, shell } = PC_SPEC;
    expect(glass.rimZ + glass.bulge).toBeLessThan(shell.max[2]);
    expect(glass.minX).toBeGreaterThan(shell.min[0]);
    expect(glass.maxX).toBeLessThan(shell.max[0]);
    expect(glass.minY).toBeGreaterThan(shell.min[1]);
    expect(glass.maxY).toBeLessThan(shell.max[1]);
    // The bezel's lip ends on the glass's own rectangle, in front of the rim's plane and never more than a
    // centimetre from it: the glass closes the opening, and nowhere does it stand in front of the lip that frames it.
    const positions = scene.meshes.monitor.positions;
    let lip = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const [x, y, z] = [positions[i] as number, positions[i + 1] as number, positions[i + 2] as number];
      const within =
        x > glass.minX - 1e-4 && x < glass.maxX + 1e-4 && y > glass.minY - 1e-4 && y < glass.maxY + 1e-4 && z > -1.69;
      if (!within) continue;
      lip++;
      const s = Math.min(1, Math.abs((2 * (x - glass.minX)) / (glass.maxX - glass.minX) - 1));
      const t = Math.min(1, Math.abs((2 * (glass.maxY - y)) / (glass.maxY - glass.minY) - 1));
      const surface = glass.rimZ + glass.bulge * (1 - s * s) * (1 - t * t);
      expect(z - surface, `${x}, ${y}, ${z}`).toBeGreaterThan(0);
      expect(z - surface, `${x}, ${y}, ${z}`).toBeLessThan(0.01);
    }
    expect(lip).toBeGreaterThan(0);
  });

  it('has the lamps where the rig lights from, and the lava lamp where it is built', () => {
    expect(RIG.find((light) => light.name === 'opal')?.position).toEqual(TV_LAMP_SPEC.center);
    expect(RIG.find((light) => light.name === 'bulb')?.position).toEqual(BULB_SPEC.filament);
    expect(LAVA_BOUNDS).toEqual(LAVA.bounds);
    const globe = boundsOf(scene.meshes.globe.positions);
    for (let axis = 0; axis < 3; axis++)
      expect(((globe.min[axis] as number) + (globe.max[axis] as number)) / 2).toBeCloseTo(
        TV_LAMP_SPEC.center[axis] as number,
        3,
      );
    // The bulb's light comes from the middle of its filament, inside its glass.
    const filament = boundsOf(scene.meshes.filament.positions);
    const glass = boundsOf(scene.meshes.bulb.positions);
    for (let axis = 0; axis < 3; axis++) {
      expect(((filament.min[axis] as number) + (filament.max[axis] as number)) / 2).toBeCloseTo(
        BULB_SPEC.filament[axis] as number,
        2,
      );
      expect(filament.min[axis] as number).toBeGreaterThan(glass.min[axis] as number);
      expect(filament.max[axis] as number).toBeLessThan(glass.max[axis] as number);
    }
  });

  it("stands the bare-bulb lamp on the cabinet top, clear of the set, the wall and the top's edges", () => {
    const lamp = scene.props.find((prop) => prop.name === 'bulb-lamp');
    const [start, count] = lamp?.ranges.props ?? [0, 0];
    const positions = scene.meshes.props.positions;
    // What stands on the top: everything of it in front of the top's back edge (the flex drops behind it).
    let foot = Infinity;
    for (let vertex = start; vertex < start + count; vertex++) {
      const [x, y, z] = [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]] as [
        number,
        number,
        number,
      ];
      if (x > 2.69) {
        // Behind the cabinet: between its back and the skirting, down to the boards.
        expect(x).toBeLessThan(2.73);
        expect(y).toBeGreaterThanOrEqual(FLOOR);
        continue;
      }
      foot = Math.min(foot, y);
      expect(y, `${x}, ${y}, ${z}`).toBeGreaterThanOrEqual(BULB_SPEC.origin[1]);
      expect(x).toBeGreaterThan(2.12);
      expect(z).toBeGreaterThan(-1.125);
      expect(z).toBeLessThan(TV_SPEC.bounds.min[2]);
    }
    // Its base rests on the top, and its glass ends under the set's own top.
    expect(foot - BULB_SPEC.origin[1]).toBeLessThan(0.001);
    expect(boundsOf(scene.meshes.bulb.positions).max[1] as number).toBeLessThan(TV_SPEC.bounds.max[1]);
  });

  it('names props that exist for the pointer to pick', () => {
    const names = PROPS.map((prop) => prop.name);
    for (const picked of Object.values(PICK_PROPS)) for (const name of picked) expect(names).toContain(name);
  });

  it("knows where each prop's vertices and decals are", () => {
    const next: Partial<Record<MeshName, number>> = {};
    let decal = 0;
    for (const prop of scene.props) {
      for (const [name, range] of Object.entries(prop.ranges) as [MeshName, readonly [number, number]][]) {
        // The monitor is cut out of the desktop set after it is built: its range starts where the mesh did.
        expect(range[0], `${prop.name} ${name}`).toBe(next[name] ?? 0);
        expect(range[1] % 3).toBe(0);
        expect(range[1]).toBeGreaterThan(0);
        next[name] = range[0] + range[1];
      }
      expect(prop.decals[0]).toBe(decal);
      decal += prop.decals[1];
    }
    // The drawn making's vertices come after every prop's (MeshBuilder.finish).
    for (const [name, mesh] of Object.entries(scene.meshes) as [MeshName, { positions: Float32Array }][])
      expect(next[name] ?? 0, name).toBe(scene.meshes[name].shown?.built[1] ?? mesh.positions.length / 3);
    expect(decal).toBe(scene.decals.positions.length / 18);
  });
});

describe("the bake's cells", () => {
  const chart = {
    page: 0,
    group: 0,
    origin: [1, 0.5, -2] as const,
    u: [1.3, 0, 0] as const,
    v: [0, 0, 0.7] as const,
    material: 2,
    params: [1, 2, 3, 4] as const,
    density: 200,
    shade: 0.8,
  };
  const pages = packCharts([chart], 1, 2048);
  const packed = pages[0]?.charts[0];
  const mesh = chartMeshes(pages).bake[0];
  if (!packed || !mesh) throw new Error('The chart was not packed');

  it('cuts a chart into cells of six vertices, none longer than BAKE_CELL inside the chart', () => {
    // 1.3 m × 0.7 m: three cells across, two up.
    expect(mesh.positions.length / 18).toBe(6);
    expect(mesh.shade).toHaveLength(36);
    expect([...mesh.material]).toEqual(new Array(36).fill(2));
    for (let cell = 0; cell < 6; cell++) {
      const local = mesh.local.subarray(cell * 12, cell * 12 + 12);
      const us = [0, 2, 4, 6, 8, 10].map((i) => local[i] as number);
      const vs = [1, 3, 5, 7, 9, 11].map((i) => local[i] as number);
      const bleed = [(BLEED - 0.5) / (packed.w - 1), (BLEED - 0.5) / (packed.h - 1)];
      expect(Math.max(...us) - Math.min(...us)).toBeLessThanOrEqual(BAKE_CELL + 1.3 * (bleed[0] as number) + 1e-6);
      expect(Math.max(...vs) - Math.min(...vs)).toBeLessThanOrEqual(BAKE_CELL + 0.7 * (bleed[1] as number) + 1e-6);
    }
  });

  it('tiles the chart: the same quad as one cell would be, BLEED texels past its rectangle', () => {
    const st = mesh.st;
    const [bs, bt] = [(BLEED - 0.5) / (packed.w - 1), (BLEED - 0.5) / (packed.h - 1)];
    const s = Array.from({ length: 36 }, (_, i) => st[i * 2] as number);
    const t = Array.from({ length: 36 }, (_, i) => st[i * 2 + 1] as number);
    expect(Math.min(...s)).toBeCloseTo(-bs, 6);
    expect(Math.max(...s)).toBeCloseTo(1 + bs, 6);
    expect(Math.min(...t)).toBeCloseTo(-bt, 6);
    expect(Math.max(...t)).toBeCloseTo(1 + bt, 6);
    // Each cell's area in chart coordinates; together they are the whole quad's, so none overlaps or is missing.
    let area = 0;
    for (let cell = 0; cell < 6; cell++) {
      const at = cell * 6;
      area += ((s[at + 1] as number) - (s[at] as number)) * ((t[at + 2] as number) - (t[at + 1] as number));
    }
    expect(area).toBeCloseTo((1 + 2 * bs) * (1 + 2 * bt), 6);
    // Every attribute is the chart's own function of (s, t), as it was for the single quad.
    for (let i = 0; i < 36; i++) {
      expect(mesh.local[i * 2]).toBeCloseTo((s[i] as number) * 1.3, 5);
      expect(mesh.local[i * 2 + 1]).toBeCloseTo((t[i] as number) * 0.7, 5);
      expect(mesh.positions[i * 3]).toBeCloseTo(1 + (s[i] as number) * 1.3, 5);
      expect(mesh.positions[i * 3 + 2]).toBeCloseTo(-2 + (t[i] as number) * 0.7, 5);
      expect(mesh.uvs[i * 2]).toBeCloseTo(
        (packed.x + 0.5 + (s[i] as number) * (packed.w - 1)) / (pages[0]?.width ?? 1),
        5,
      );
    }
  });
});
