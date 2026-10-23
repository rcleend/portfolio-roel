import { describe, expect, it } from 'vitest';
import { paginate } from './paginate';

const block = (height: number, keepWithNext = false) => ({ height, keepWithNext });

describe('paginate', () => {
  it('returns no pages for no blocks', () => {
    expect(paginate([], 1000)).toEqual([]);
  });

  it('fills pages greedily with whole blocks', () => {
    expect(paginate([block(400), block(400), block(400), block(100)], 1000)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('moves a heading to the next page with the block it heads', () => {
    expect(paginate([block(500), block(300), block(40, true), block(300)], 1000)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it('keeps chains of headings with the block that ends them', () => {
    expect(paginate([block(800), block(40, true), block(40, true), block(300)], 1000)).toEqual([[0], [1, 2, 3]]);
  });

  it('gives a block taller than a page a page of its own', () => {
    expect(paginate([block(300), block(1400), block(200)], 1000)).toEqual([[0], [1], [2]]);
    expect(paginate([block(1400)], 1000)).toEqual([[0]]);
  });

  it('never leaves a trailing heading alone', () => {
    expect(paginate([block(900), block(40, true)], 1000)).toEqual([[0, 1]]);
  });

  it('is deterministic', () => {
    const blocks = Array.from({ length: 40 }, (_, index) => block(37 + ((index * 53) % 211), index % 7 === 0));
    expect(paginate(blocks, 995)).toEqual(paginate(blocks, 995));
    expect(paginate(blocks, 995).flat()).toEqual(blocks.map((_, index) => index));
  });
});
