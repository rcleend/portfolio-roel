import { describe, expect, it } from 'vitest';
import { DESIGNS } from '../paint/designs';
import { ATLAS_HEIGHT, ATLAS_WIDTH, atlasPlan, GUTTER, type Rect, tapesOf, wallGeometry } from './geometry';
import { ITEMS } from './layout';

describe('the layout', () => {
  it('hangs twenty-nine pieces, six of them on the corkboard, and prints a design on each', () => {
    expect(ITEMS).toHaveLength(29);
    expect(ITEMS.filter((item) => item.cork)).toHaveLength(6);
    expect(Object.keys(DESIGNS).sort()).toEqual(ITEMS.map((item) => item.key).sort());
  });

  it('tapes a corner across its diagonal, 4 mm onto the sheet', () => {
    // The retail poster (58 × 79 cm), as the walls' first, modelled node laid its tape.
    const poster = ITEMS.find((item) => item.key === 'B1');
    if (!poster) throw new Error('No B1');
    const [bottomLeft, , , topLeft] = tapesOf(poster);
    expect(bottomLeft?.u).toBeCloseTo(-0.28763, 5);
    expect(bottomLeft?.v).toBeCloseTo(-0.39212, 5);
    expect(((bottomLeft?.angle ?? 0) * 180) / Math.PI).toBeCloseTo(-36.26, 2);
    expect(((topLeft?.angle ?? 0) * 180) / Math.PI).toBeCloseTo(-143.74, 2);
    expect(topLeft?.lifted).toBe(true);
  });
});

describe('the atlas plan', () => {
  it('keeps every island inside the atlas, on even texels, a gutter clear of every other', () => {
    const plan = atlasPlan();
    const tapes: Rect[] = plan.tapes.map((tape) => tape.rect);
    // The tapes' block is a card of the plan that the strips subdivide.
    const islands = [...[...plan.cards].filter(([key]) => key !== 'tapes').map(([, rect]) => rect), ...tapes];
    expect(islands.length).toBeGreaterThan(100);
    for (const { x, y, w, h } of islands) {
      for (const value of [x, y, w, h]) expect(value % 2).toBe(0);
      expect(x).toBeGreaterThanOrEqual(GUTTER);
      expect(y).toBeGreaterThanOrEqual(GUTTER);
      expect(x + w).toBeLessThanOrEqual(ATLAS_WIDTH - GUTTER);
      expect(y + h).toBeLessThanOrEqual(ATLAS_HEIGHT - GUTTER);
    }
    const apart = (p: Rect, q: Rect): boolean =>
      p.x + p.w + 2 * GUTTER <= q.x ||
      q.x + q.w + 2 * GUTTER <= p.x ||
      p.y + p.h + 2 * GUTTER <= q.y ||
      q.y + q.h + 2 * GUTTER <= p.y;
    const touching: string[] = [];
    islands.forEach((p, i) => {
      for (let j = i + 1; j < islands.length; j++) if (!apart(p, islands[j] as Rect)) touching.push(`${i}/${j}`);
    });
    expect(touching).toEqual([]);
  });
});

describe("the walls' geometry", () => {
  const wall = wallGeometry();

  it('is the modelled node it replaced, triangle for triangle', () => {
    // The walls were first a model (posters.glb): 1,343 card and 192 skirt triangles on 1,801 and 384 vertices.
    expect(wall.cards.indices.length / 3).toBe(1343);
    expect(wall.cards.positions.length / 3).toBe(1801);
    expect(wall.skirts.indices.length / 3).toBe(192);
    expect(wall.skirts.positions.length / 3).toBe(384);
  });

  it("puts each piece where the modelled node's boxes had it", () => {
    const box = (key: string) => {
      const found = wall.boxes.find((each) => each.key === key);
      if (!found) throw new Error(`No box for ${key}`);
      return [...found.min, ...found.max];
    };
    // That model's `decor` boxes, to the tenth of a millimetre they were written at.
    const modelled: Record<string, number[]> = {
      A1: [-1.9017, 2.6744, -2.4049, -1.4979, 3.2456, -2.3872],
      B1: [-0.3164, 1.7115, -2.4049, 0.3359, 2.5884, -2.3906],
      B3: [-0.8569, 2.7156, -2.4049, -0.3831, 3.2044, -2.4032],
    };
    for (const [key, numbers] of Object.entries(modelled)) {
      box(key).forEach((value, i) => {
        expect(value, `${key} ${i}`).toBeCloseTo(numbers[i] as number, 3);
      });
    }
    expect(wall.boxes).toHaveLength(30);
  });

  it('turns no face to the wall', () => {
    const { positions, indices } = wall.cards;
    const at = (index: number) =>
      [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]] as number[];
    let away = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [at(indices[i] as number), at(indices[i + 1] as number), at(indices[i + 2] as number)];
      const [ux, uy, uz] = [0, 1, 2].map((k) => (b[k] as number) - (a[k] as number)) as [number, number, number];
      const [vx, vy, vz] = [0, 1, 2].map((k) => (c[k] as number) - (a[k] as number)) as [number, number, number];
      const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx] as const;
      const length = Math.hypot(...normal);
      if (length < 1e-12) continue;
      // Into the room from the back wall is +z, from the slope (-0.603, -0.797, 0); a pin's and the corkboard frame's
      // sides face along the wall, where this is 0.
      const onBack = (a[2] as number) < -2.3;
      const facing = (onBack ? normal[2] : -0.603 * normal[0] - 0.797 * normal[1]) / length;
      if (facing < -0.5) away++;
    }
    expect(away).toBe(0);
  });
});
