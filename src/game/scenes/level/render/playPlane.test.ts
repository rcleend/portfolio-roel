import { describe, expect, it } from 'vitest';
import { groundTiles, platformTile } from './playPlane';

describe('groundTiles', () => {
  const ground = [true, true, false, false, true, true];

  it('caps both lips of a pit and fills the pit', () => {
    expect(groundTiles(ground, 1)).toEqual(['pit_edge_left', 'ground_fill_right', 'ground_base_right']);
    expect(groundTiles(ground, 2)).toEqual(['pit_top', 'pit_fill', 'pit_fill']);
    expect(groundTiles(ground, 4)).toEqual(['pit_edge_right', 'ground_fill_left', 'ground_base_left']);
  });

  it('never caps the ends of the level', () => {
    expect(groundTiles(ground, 0)[0]).toMatch(/^ground_top/);
    expect(groundTiles(ground, 5)[0]).toMatch(/^ground_top/);
  });
});

describe('platformTile', () => {
  it('uses end caps and middles', () => {
    expect(platformTile(3, 6, 3)).toBe('platform_left');
    expect(platformTile(3, 6, 6)).toBe('platform_right');
    expect(platformTile(3, 6, 4)).toMatch(/^platform_mid/);
    expect(platformTile(5, 5, 5)).toBe('platform_mid');
  });
});
