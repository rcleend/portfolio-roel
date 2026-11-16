import { describe, expect, it } from 'vitest';
import { ROOM_MOODS } from '../atmosphere/moods';
import { TOY_ROBOT_EYE_INTENSITY } from '../atmosphere/toyRobot';
import { TV_LAMP_INTENSITY as ROOM_LAMP_INTENSITY } from '../atmosphere/tvLamp';
import { QUALITY_TIERS } from '../stage/quality';
import { rigViews } from './bake/Baker';
import { BAKE_CELL, BLEED, chartMeshes, packCharts } from './kit/charts';
import { hash2, hash32, seeded } from './kit/hash';
import { LAVA } from './props/lavaLamp';
import type { MeshName } from './props/types';
import { RIG, ROBOT, TV_LAMP } from './rig';
import { LAVA_BOUNDS, PC_SPEC, PICK_PROPS, ROBOT_SPEC, TV_LAMP_SPEC, TV_SPEC } from './roomSpec';
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
    const eye = RIG.find((light) => light.name === 'eye-0');
    expect(eye?.color[0]).toBeCloseTo(TOY_ROBOT_EYE_INTENSITY / ROOM_LAMP_INTENSITY, 6);
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
    // Within 3 mm: the buttons stand 2.3 mm proud of the front the spec's box ends at.
    for (let axis = 0; axis < 3; axis++) {
      expect(Math.abs((min[axis] as number) - (TV_SPEC.bounds.min[axis] as number)), `min ${axis}`).toBeLessThan(0.003);
      expect(Math.abs((max[axis] as number) - (TV_SPEC.bounds.max[axis] as number)), `max ${axis}`).toBeLessThan(0.003);
    }
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
    expect(TV_LAMP_SPEC.center).toEqual(TV_LAMP.center);
    expect(TV_LAMP_SPEC.radius).toBe(TV_LAMP.radius);
    expect(ROBOT_SPEC.eyes).toEqual(ROBOT.eyes);
    expect(LAVA_BOUNDS).toEqual(LAVA.bounds);
    const globe = boundsOf(scene.meshes.globe.positions);
    for (let axis = 0; axis < 3; axis++)
      expect(((globe.min[axis] as number) + (globe.max[axis] as number)) / 2).toBeCloseTo(
        TV_LAMP_SPEC.center[axis] as number,
        3,
      );
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
    for (const [name, mesh] of Object.entries(scene.meshes) as [MeshName, { positions: Float32Array }][])
      expect(next[name] ?? 0, name).toBe(mesh.positions.length / 3);
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
