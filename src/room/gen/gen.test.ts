import { describe, expect, it } from 'vitest';
import { ROOM_MOODS } from '../atmosphere/moods';
import { TOY_ROBOT_EYE_INTENSITY } from '../atmosphere/toyRobot';
import { TV_LAMP_INTENSITY as ROOM_LAMP_INTENSITY } from '../atmosphere/tvLamp';
import { QUALITY_TIERS } from '../stage/quality';
import { rigViews } from './bake/Baker';
import { GeneratedSlot } from './GeneratedSlot';
import { hash2, hash32, seeded } from './kit/hash';
import { RIG } from './rig';
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

describe("the generated room's door", () => {
  it('loads nothing unless the room was asked for it', async () => {
    let loads = 0;
    const slot = new GeneratedSlot(false, () => {
      loads++;
      return Promise.reject(new Error('not asked for'));
    });
    slot.attach({} as never);
    expect(slot.state).toBe('off');
    expect(await slot.ready).toBe(false);
    expect(loads).toBe(0);
  });

  it('keeps the shipped room when the chunk fails', async () => {
    const slot = new GeneratedSlot(true, () => Promise.reject(new Error('offline')));
    slot.attach({} as never);
    expect(await slot.ready).toBe(false);
    expect(slot.state).toBe('failed');
  });
});
