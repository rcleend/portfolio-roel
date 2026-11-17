import { describe, expect, it } from 'vitest';
import {
  BakePace,
  COMPOSE_SLICES_A_PAGE,
  composeSlices,
  LATE_FRAME_MS,
  LEAST_SHARE,
  MAX_GAP_MS,
  OPENING_BUDGET_MS,
  overBudget,
  PIECE_GPU_LIMIT_MS,
  STRAINED_SHARE,
} from './pace';

describe('BakePace', () => {
  it('sizes a unit by what a piece was seen to take, within the most it may hold', () => {
    const pace = new BakePace(1);
    // Nothing timed yet: the guess.
    expect(pace.pieces(4, 60, 1, true)).toBe(4);
    pace.read(2, 4);
    expect(pace.pieces(4, 60, 1, true)).toBe(8);
    pace.read(0.4, 8);
    expect(pace.pieces(4, 60, 1, true)).toBe(60);
    expect(pace.pieces(4, 12.9, 1, true)).toBe(12);
  });

  it('always does one piece behind the frames and one view otherwise, however slow the GPU', () => {
    const pace = new BakePace(1);
    for (let unit = 0; unit < 5; unit++) pace.read(400, 1);
    expect(pace.pieces(4, 60, 1, true)).toBe(1);
    expect(pace.pieces(12, 144, 6, false)).toBe(6);
  });

  it('does not shrink a paced unit for one reading taken behind a frame, nor call the GPU slow for it', () => {
    const pace = new BakePace(1);
    pace.read(4, 8);
    pace.read(4, 8);
    // This unit's fence waited out a frame that was on the GPU ahead of it.
    pace.read(80, 8);
    expect(pace.pieceMs(true)).toBe(0.5);
    expect(pace.pieces(4, 60, 1, true)).toBe(8);
    expect(pace.gapMs()).toBe(0);
    // With nothing else drawing a reading is the bake's own time: the latest counts.
    expect(pace.pieceMs(false)).toBe(10);
    expect(pace.pieces(8, 60, 1, false)).toBe(1);
  });

  it('spaces the units out once three in a row say a piece is over the limit, and never stops them', () => {
    const pace = new BakePace(1);
    pace.read(8, 1);
    pace.read(9, 1);
    pace.read(8, 1);
    expect(pace.pieceMs(true)).toBeGreaterThan(PIECE_GPU_LIMIT_MS);
    // The bake's share of the GPU: 8 ms of it, then 24 ms without.
    expect(pace.gapMs()).toBeCloseTo(8 * (1 / STRAINED_SHARE - 1));
    for (let unit = 0; unit < 3; unit++) pace.read(900, 1);
    expect(pace.gapMs()).toBe(MAX_GAP_MS);
    expect(pace.pieces(4, 60, 1, true)).toBe(1);
    // A quick unit again: the slow ones were the GPU busy with something else.
    pace.read(1, 1);
    expect(pace.gapMs()).toBe(0);
  });

  it('starts each pass from its guess', () => {
    const pace = new BakePace(1);
    for (let unit = 0; unit < 3; unit++) pace.read(9, 1);
    expect(pace.gapMs()).toBeGreaterThan(0);
    pace.reset(2);
    expect(pace.pieces(12, 144, 1, false)).toBe(6);
    expect(pace.pieces(12, 144, 1, true)).toBe(6);
    expect(pace.gapMs()).toBe(0);
  });
});

describe('BakePace behind late frames', () => {
  it('halves what a unit takes for every late frame, down to an eighth, and rests longer between units', () => {
    const pace = new BakePace(0.1);
    expect(pace.pieces(4, 60, 1, true)).toBe(40);
    expect(pace.gapMs()).toBe(0);
    pace.frame(LATE_FRAME_MS + 1);
    expect(pace.pieces(4, 60, 1, true)).toBe(20);
    expect(pace.gapMs()).toBe(MAX_GAP_MS / 2);
    for (let frame = 0; frame < 10; frame++) pace.frame(40);
    expect(pace.pieces(4, 60, 1, true)).toBe(40 * LEAST_SHARE);
    expect(pace.gapMs()).toBe(MAX_GAP_MS * (1 - LEAST_SHARE));
    // Still one piece at least, and a whole view's worth for a visitor who waits: that pace is not the frames' to set.
    expect(new BakePace(50).pieces(4, 60, 1, true)).toBe(1);
    expect(pace.pieces(12, 60, 6, false)).toBe(60);
  });

  it('comes back a tenth at a time while the frames are on time', () => {
    const pace = new BakePace(0.1);
    for (let frame = 0; frame < 10; frame++) pace.frame(40);
    pace.frame(16.7);
    expect(pace.pieces(4, 60, 1, true)).toBe(5);
    for (let frame = 0; frame < 30; frame++) pace.frame(16.7);
    expect(pace.pieces(4, 60, 1, true)).toBe(40);
    expect(pace.gapMs()).toBe(0);
  });
});

describe('overBudget', () => {
  it('says when the opening pass would keep the visitor waiting', () => {
    // An Apple M4: 0.6 ms a view, 143 views.
    expect(overBudget(0.6, 143)).toBe(false);
    expect(overBudget(OPENING_BUDGET_MS / 143 - 0.01, 143)).toBe(false);
    expect(overBudget(OPENING_BUDGET_MS / 143 + 0.01, 143)).toBe(true);
    // The lowest tier's sample counts take the same GPU about half as long.
    expect(overBudget(8, 77)).toBe(false);
  });
});

describe('composeSlices', () => {
  /** A quad as two triangles, `width` × `height`, at `x`. */
  const quad = (x: number, width: number, height: number): number[] => [
    ...[x, 0, x + width, 0, x + width, height],
    ...[x, 0, x + width, height, x, height],
  ];

  it('cuts a page into runs of whole triangles that cover every vertex once, in order', () => {
    const clip = Array.from({ length: 40 }, (_, i) => quad(i, 1, 1)).flat();
    const slices = composeSlices(clip, 8);
    expect(slices).toHaveLength(8);
    let next = 0;
    for (const slice of slices) {
      expect(slice.start).toBe(next);
      expect(slice.count % 3).toBe(0);
      expect(slice.count).toBeGreaterThan(0);
      next += slice.count;
    }
    expect(next).toBe(clip.length / 2);
  });

  it('gives every slice about the same area, however unequal the charts', () => {
    // One chart as large as the sixty small ones together.
    const clip = [...quad(0, 60, 1), ...Array.from({ length: 60 }, (_, i) => quad(100 + i, 1, 1)).flat()];
    const slices = composeSlices(clip, 4);
    const area = (slice: { start: number; count: number }): number => {
      let sum = 0;
      for (let v = slice.start; v < slice.start + slice.count; v += 3) {
        const [ax, ay, bx, by, cx, cy] = clip.slice(v * 2, v * 2 + 6) as [number, number, number, number, number, number];
        sum += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
      }
      return sum;
    };
    const areas = slices.map(area);
    expect(areas.reduce((sum, value) => sum + value, 0)).toBeCloseTo(120);
    // No slice holds more than a share and the one triangle that carried it over.
    for (const value of areas) expect(value).toBeLessThanOrEqual(120 / 4 + 30);
    expect(slices.length).toBeGreaterThanOrEqual(3);
  });

  it('cuts a single chart where its triangles end, and gives a page without charts one empty slice', () => {
    expect(composeSlices(quad(0, 1, 1))).toEqual([
      { start: 0, count: 3 },
      { start: 3, count: 3 },
    ]);
    expect(composeSlices([])).toEqual([{ start: 0, count: 0 }]);
    expect(COMPOSE_SLICES_A_PAGE).toBeGreaterThan(1);
  });
});
