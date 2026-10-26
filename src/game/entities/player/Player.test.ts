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

  it('remembers which skill its skill pose is cast for, so a look can pose that skill its own way', () => {
    const player = new Player('artsy', 100, 200);
    const world = flat();
    player.cast('ux-elixir', 0, 0.4);
    player.update(IDLE_INTENT, DT, world, 0);
    expect(player.pose(DT)).toMatchObject({ animation: 'skill', skill: 'ux-elixir' });
    player.update(IDLE_INTENT, DT, world, 0.5);
    expect(player.pose(0.5)).toMatchObject({ animation: 'idle', skill: null });
    player.strike('victory', 1, 1);
    player.update(IDLE_INTENT, DT, world, 1);
    expect(player.pose(1)).toMatchObject({ animation: 'victory', skill: null });
  });

  it('keeps running through an attack, telling a look drawn in layers to swing it over the stride', () => {
    const player = new Player('hackerman', 100, 200);
    const world = flat();
    const run = { ...IDLE_INTENT, x: 1 as const };
    let time = 0;
    for (; time < 0.5; time += DT) player.update(run, DT, world, time);
    const stride = player.pose(time);
    expect(stride).toMatchObject({ animation: 'run', onTheMove: null });

    player.strike('attack', time, 0.3);
    player.update(run, DT, world, time);
    // A look drawn whole keeps the run, in stride; the attack rides on top for a look drawn in layers.
    expect(player.pose(time + 0.1)).toEqual({
      animation: 'run',
      skill: null,
      time: expect.closeTo(stride.time + 0.1),
      onTheMove: {
        action: 'attack',
        actionTime: expect.closeTo(0.1),
        move: 'run',
        moveTime: expect.closeTo(stride.time + 0.1),
      },
    });
  });

  it('casts in the air in the skill pose over the legs of the jump, and attacks planted in the whole pose', () => {
    const player = new Player('artsy', 100, 200);
    const world = flat();
    player.update(IDLE_INTENT, DT, world, 0);
    player.update({ ...IDLE_INTENT, jumpPressed: true, jumpHeld: true }, DT, world, DT);
    player.cast('ux-elixir', 2 * DT, 0.4);
    player.update({ ...IDLE_INTENT, jumpHeld: true }, DT, world, 2 * DT);
    expect(player.pose(2 * DT)).toMatchObject({
      animation: 'skill',
      skill: 'ux-elixir',
      onTheMove: { action: 'skill', actionTime: 0, move: 'jump' },
    });

    const planted = new Player('strategy', 100, 200);
    planted.update(IDLE_INTENT, DT, world, 0);
    planted.strike('attack', DT, 0.3);
    planted.update(IDLE_INTENT, DT, world, DT);
    expect(planted.pose(DT)).toEqual({ animation: 'attack', skill: null, time: 0, onTheMove: null });
  });

  it('swings an attack or casts from the step it starts, struck after the move is updated as the world does', () => {
    const player = new Player('hackerman', 100, 200);
    const world = flat();
    const run = { ...IDLE_INTENT, x: 1 as const };
    let time = 0;
    for (; time < 0.5; time += DT) player.update(run, DT, world, time);
    player.strike('attack', time, 0.3);
    expect(player.pose(time).onTheMove).toEqual({
      action: 'attack',
      actionTime: 0,
      move: 'run',
      moveTime: expect.any(Number),
    });

    const caster = new Player('artsy', 100, 200);
    caster.update(IDLE_INTENT, DT, world, 0);
    caster.cast('ux-elixir', 0, 0.4);
    expect(caster.pose(0)).toMatchObject({ animation: 'skill', skill: 'ux-elixir', time: 0 });
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
