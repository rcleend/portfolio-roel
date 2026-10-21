import { describe, expect, it } from 'vitest';
import { Arena } from './Arena';

describe('Arena', () => {
  it('closes once the player is inside, then drops the escalated customer after a beat', () => {
    const arena = new Arena(100, 113, 320);
    expect(arena.enter(1600, 0)).toBe(false);
    expect(arena.wall).toBeNull();
    expect(arena.enter(1640, 0)).toBe(true);
    expect(arena.enter(1650, 0.1)).toBe(false);
    expect(arena.wall).toEqual({ x: 1584, y: -240, w: 16, h: 480 });
    expect(arena.dropBoss(0.5, 1640)).toBeNull();
    const boss = arena.dropBoss(1.2, 1640);
    expect(boss?.escalated).toBe(true);
    expect(boss?.centerX).toBe(113 * 16 + 8);
    expect(arena.dropBoss(2, 1640)).toBeNull();
  });

  it('never drops the customer on top of the player', () => {
    const arena = new Arena(100, 113, 320);
    const markedX = 113 * 16 + 8;
    arena.enter(markedX, 0);
    const boss = arena.dropBoss(2, markedX);
    expect(Math.abs((boss?.centerX ?? markedX) - markedX)).toBeGreaterThan(96);
    expect(boss?.centerX).toBeGreaterThan(1600);
  });
});
