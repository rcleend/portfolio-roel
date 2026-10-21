import { describe, expect, it } from 'vitest';
import { type Body, type CollisionWorld, moveBody, type Surface } from './collision';
import { TileGrid } from './grid';

const DT = 1 / 60;

/** A 20 × 15 grid whose row 12 starts at y 200, like the real levels, with ground on rows 12–14. */
function groundWorld(extra: Partial<CollisionWorld> = {}): CollisionWorld {
  const grid = new TileGrid(20, 15, 8);
  for (let col = 0; col < 20; col++) for (let row = 12; row < 15; row++) grid.set(col, row, 'solid');
  return { grid, surfaces: [], walls: [], ...extra };
}

function body(x: number, y: number, vx = 0, vy = 0): Body {
  return { x, y, w: 12, h: 28, vx, vy };
}

describe('moveBody', () => {
  it('lands on solid ground and stops falling', () => {
    const world = groundWorld();
    const b = body(40, 168, 0, 300);
    const contacts = moveBody(b, DT, world);
    expect(contacts.grounded).toBe(true);
    expect(b.y + b.h).toBe(200);
    expect(b.vy).toBe(0);
  });

  it('stays grounded when standing still under gravity', () => {
    const world = groundWorld();
    const b = body(40, 172, 0, 20);
    expect(moveBody(b, DT, world).grounded).toBe(true);
    expect(b.y).toBe(172);
  });

  it('never tunnels through ground at high speed', () => {
    const world = groundWorld();
    const b = body(40, 100, 0, 60 * 120);
    moveBody(b, DT, world);
    expect(b.y + b.h).toBe(200);
  });

  it('stops at walls and reports the side', () => {
    const world = groundWorld();
    world.grid.set(5, 11, 'solid');
    const b = body(64, 172, 400);
    const contacts = moveBody(b, DT, world);
    expect(contacts.wall).toBe(1);
    expect(b.x + b.w).toBe(80);
    expect(b.vx).toBe(0);

    const left = body(100, 172, -400);
    expect(moveBody(left, DT, world).wall).toBe(-1);
    expect(left.x).toBe(96);
  });

  it('treats the level edges as walls', () => {
    const world = groundWorld();
    const b = body(2, 172, -400);
    moveBody(b, DT, world);
    expect(b.x).toBe(0);
  });

  it('falls into pits', () => {
    const world = groundWorld();
    for (let row = 12; row < 15; row++) world.grid.set(3, row, 'empty');
    const b = body(50, 172, 0, 100);
    for (let i = 0; i < 60; i++) {
      b.vy += 1000 * DT;
      moveBody(b, DT, world);
    }
    expect(b.y).toBeGreaterThan(240);
  });

  it('bumps solid ceilings and reports the cells it hit', () => {
    const world = groundWorld();
    world.grid.set(3, 8, 'solid');
    const b = body(50, 156, 0, -400);
    const contacts = moveBody(b, DT, world);
    expect(contacts.ceilingCells).toEqual([{ col: 3, row: 8 }]);
    expect(b.y).toBe(152);
    expect(b.vy).toBe(0);
  });

  describe('one-way platforms', () => {
    const platformWorld = () => {
      const world = groundWorld();
      for (let col = 2; col < 6; col++) world.grid.set(col, 9, 'oneWay');
      return world;
    };

    it('lets a body jump up through them', () => {
      const world = platformWorld();
      const b = body(40, 160, 0, -600);
      const contacts = moveBody(b, DT, world);
      expect(contacts.ceilingCells).toEqual([]);
      expect(b.y).toBeCloseTo(150);
    });

    it('catches a body falling onto them from above', () => {
      const world = platformWorld();
      const b = body(40, 120, 0, 300);
      expect(moveBody(b, DT, world).grounded).toBe(true);
      expect(b.y + b.h).toBe(152);
    });

    it('does not catch a body whose feet are already below the top', () => {
      const world = platformWorld();
      const b = body(40, 128, 0, 120);
      expect(moveBody(b, DT, world).grounded).toBe(false);
      expect(b.y).toBe(130);
    });

    it('never blocks sideways movement', () => {
      const world = platformWorld();
      const b = body(10, 140, 400);
      expect(moveBody(b, DT, world).wall).toBe(0);
    });
  });

  describe('moving surfaces', () => {
    it('lands on a surface and carries the rider by its displacement', () => {
      const world = groundWorld();
      let car: Surface = { rect: { x: 100, y: 150, w: 80, h: 8 }, dx: 0, dy: 0 };
      const surfaces: Surface[] = [car];
      const moving: CollisionWorld = { ...world, surfaces };
      const b = body(120, 118, 0, 300);
      let contacts = moveBody(b, DT, moving);
      expect(contacts.surface).toBe(car);
      expect(b.y + b.h).toBe(150);

      for (let i = 0; i < 30; i++) {
        car = { rect: { ...car.rect, x: car.rect.x + 1.5 }, dx: 1.5, dy: 0 };
        surfaces[0] = car;
        b.vy += 1000 * DT;
        contacts = moveBody(b, DT, moving, contacts.surface === null ? null : car);
        expect(contacts.surface).toBe(car);
      }
      expect(b.x).toBeCloseTo(165);
      expect(b.y + b.h).toBe(150);
    });

    it('carries a rider up and down with a vertically moving surface', () => {
      const world = groundWorld();
      let lift: Surface = { rect: { x: 100, y: 150, w: 48, h: 8 }, dx: 0, dy: 0 };
      const surfaces: Surface[] = [lift];
      const moving: CollisionWorld = { ...world, surfaces };
      const b = body(110, 122, 0, 10);
      let contacts = moveBody(b, DT, moving);
      expect(contacts.surface).toBe(lift);
      for (let i = 0; i < 20; i++) {
        lift = { rect: { ...lift.rect, y: lift.rect.y - 1 }, dx: 0, dy: -1 };
        surfaces[0] = lift;
        b.vy += 1000 * DT;
        contacts = moveBody(b, DT, moving, lift);
        expect(contacts.grounded).toBe(true);
      }
      expect(b.y + b.h).toBe(130);
    });

    it('drops a rider who walks off the edge', () => {
      const world = groundWorld();
      const car: Surface = { rect: { x: 100, y: 150, w: 40, h: 8 }, dx: 0, dy: 0 };
      const moving: CollisionWorld = { ...world, surfaces: [car] };
      const b = body(150, 122, 0, 20);
      expect(moveBody(b, DT, moving, car).grounded).toBe(false);
    });
  });

  describe('walls', () => {
    it('blocks movement into a closed gate from both sides and can be stood on', () => {
      const gate = { x: 100, y: 120, w: 16, h: 80 };
      const world = groundWorld({ walls: [gate] });
      const fromLeft = body(80, 172, 600);
      expect(moveBody(fromLeft, DT, world).wall).toBe(1);
      expect(fromLeft.x + fromLeft.w).toBe(100);
      const fromRight = body(118, 172, -600);
      expect(moveBody(fromRight, DT, world).wall).toBe(-1);
      expect(fromRight.x).toBe(116);
      const above = body(102, 88, 0, 600);
      expect(moveBody(above, DT, world).grounded).toBe(true);
      expect(above.y + above.h).toBe(120);
    });
  });
});
