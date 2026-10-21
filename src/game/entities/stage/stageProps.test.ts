import { describe, expect, it } from 'vitest';
import { Barrier } from './Barrier';
import { Checkpoint } from './Checkpoint';
import { HighlightBlock } from './HighlightBlock';
import { SlowZone } from './SlowZone';

describe('stage props', () => {
  it('gives up a highlight exactly once', () => {
    const block = new HighlightBlock(10, 8, 136, 'luna-agent');
    expect(block.rect).toEqual({ x: 160, y: 136, w: 16, h: 16 });
    expect(block.collect(1)).toBe(true);
    expect(block.collect(2)).toBe(false);
    expect(block.used).toBe(true);
  });

  it('raises a checkpoint flag once the player passes it', () => {
    const flag = new Checkpoint(500, 200);
    expect(flag.check(400, 0)).toBe(false);
    expect(flag.check(498, 1)).toBe(true);
    expect(flag.check(600, 2)).toBe(false);
    expect(flag.reached).toBe(true);
  });

  it('slows only bodies inside the vines', () => {
    const zone = new SlowZone({ x: 100, y: 168, w: 64, h: 32 }, { speed: 0.5, jump: 0.8 });
    expect(zone.contains({ x: 120, y: 172, w: 12, h: 28 })).toBe(true);
    expect(zone.contains({ x: 170, y: 172, w: 12, h: 28 })).toBe(false);
  });

  it('offers a barrier top bar to stand on', () => {
    const barrier = new Barrier(320, 200, 48, 32, 8);
    expect(barrier.rect).toEqual({ x: 320, y: 176, w: 48, h: 4 });
    expect([barrier.dx, barrier.dy]).toEqual([0, 0]);
  });
});
