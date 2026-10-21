import { describe, expect, it } from 'vitest';
import type { CollisionWorld } from '../../world/collision';
import { TileGrid } from '../../world/grid';
import { IDLE_INTENT, MAX_HEARTS, Player } from './Player';

const DT = 1 / 60;

function flat(): CollisionWorld {
  const grid = new TileGrid(40, 15, 8);
  for (let col = 0; col < 40; col++) for (let row = 12; row < 15; row++) grid.set(col, row, 'solid');
  return { grid, surfaces: [], walls: [] };
}

describe('Player', () => {
  it('loses a heart and is knocked away from the hit, then is briefly invulnerable', () => {
    const player = new Player('hackerman', 100, 200);
    expect(player.hurt(110, 0)).toBe(true);
    expect(player.hearts).toBe(MAX_HEARTS - 1);
    expect(player.body.vx).toBeLessThan(0);
    expect(player.isInvulnerable(1)).toBe(true);
    expect(player.hurt(110, 1)).toBe(false);
    expect(player.hearts).toBe(MAX_HEARTS - 1);
    expect(player.isInvulnerable(2)).toBe(false);
  });

  it('can be hit without being shoved (on vehicles and next to pits)', () => {
    const player = new Player('artsy', 100, 200);
    player.hurt(90, 0, false);
    expect(player.body.vx).toBe(0);
    expect(player.body.vy).toBeLessThan(0);
  });

  it('ignores input while knocked back', () => {
    const player = new Player('strategy', 100, 200);
    const world = flat();
    player.update(IDLE_INTENT, DT, world, 0);
    player.hurt(120, 0);
    const x = player.centerX;
    for (let i = 1; i <= 10; i++)
      player.update({ ...IDLE_INTENT, x: 1, jumpPressed: true, jumpHeld: true }, DT, world, i * DT);
    expect(player.centerX).toBeLessThan(x);
  });

  it('faces the way it moves and respawns with grace', () => {
    const player = new Player('hackerman', 100, 200);
    const world = flat();
    player.update({ ...IDLE_INTENT, x: -1 }, DT, world, 0);
    expect(player.facing).toBe(-1);
    player.respawn(300, 200, 5);
    expect([player.centerX, player.feet]).toEqual([300, 200]);
    expect(player.isInvulnerable(5.5)).toBe(true);
  });
});
