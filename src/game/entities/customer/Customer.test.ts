import { describe, expect, it } from 'vitest';
import { Rng } from '@/engine/math/Rng';
import type { CollisionWorld } from '../../world/collision';
import { TileGrid } from '../../world/grid';
import { Customer, type CustomerContext } from './Customer';
import { ESCALATED_CUSTOMER, REGULAR_CUSTOMER } from './tuning';

const DT = 1 / 60;

function flatWorld(columns = 60): CollisionWorld {
  const grid = new TileGrid(columns, 15, 8);
  for (let col = 0; col < columns; col++) for (let row = 12; row < 15; row++) grid.set(col, row, 'solid');
  return { grid, surfaces: [], walls: [] };
}

class Harness {
  time = 0;
  shouts: number[] = [];
  landings = 0;
  readonly rng = new Rng(7);
  player = { x: 0, feet: 200 };
  speedScale = 1;
  calm = false;
  readonly collision: CollisionWorld;

  constructor(collision = flatWorld()) {
    this.collision = collision;
  }

  context(): CustomerContext {
    return {
      time: this.time,
      player: this.player,
      collision: this.collision,
      speedScale: this.speedScale,
      calm: this.calm,
      view: { x: 0, y: 0, w: 2000, h: 240 },
      rng: this.rng,
      shout: (_customer, index) => this.shouts.push(index),
      landed: () => this.landings++,
    };
  }

  run(customer: Customer, seconds: number): void {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      this.time += DT;
      customer.update(DT, this.context());
    }
  }
}

describe('Customer', () => {
  it('patrols near home until the player comes into view', () => {
    const harness = new Harness();
    harness.player = { x: 900, feet: 200 };
    const customer = new Customer(REGULAR_CUSTOMER, 300, 200);
    harness.run(customer, 6);
    expect(customer.mood.kind).toBe('patrol');
    expect(Math.abs(customer.centerX - 300)).toBeLessThanOrEqual(48);
  });

  it('walks up to shouting distance and shouts complaint bubbles', () => {
    const harness = new Harness();
    harness.player = { x: 160, feet: 200 };
    const customer = new Customer(REGULAR_CUSTOMER, 320, 200);
    harness.run(customer, 6);
    expect(customer.facing).toBe(-1);
    expect(customer.centerX - harness.player.x).toBeLessThanOrEqual(REGULAR_CUSTOMER.keepDistance + 1);
    expect(harness.shouts.length).toBeGreaterThanOrEqual(1);
  });

  it('stays quiet while calmed by the UX Elixir', () => {
    const harness = new Harness();
    harness.calm = true;
    harness.player = { x: 200, feet: 200 };
    harness.run(new Customer(REGULAR_CUSTOMER, 280, 200), 8);
    expect(harness.shouts).toEqual([]);
  });

  it('is won over when frustration reaches zero', () => {
    const customer = new Customer(REGULAR_CUSTOMER, 300, 200);
    for (let hit = 1; hit < REGULAR_CUSTOMER.frustration; hit++) {
      expect(customer.hit({ damage: 1, direction: 1 }, hit)).toBe('hurt');
    }
    expect(customer.frustration).toBe(1);
    expect(customer.hit({ damage: 1, direction: 1 }, 9)).toBe('won');
    expect(customer.won).toBe(true);
    expect(customer.hit({ damage: 1, direction: 1 }, 1.5)).toBe('ignored');
  });

  it('is won over in one decisive hit, while the escalated customer only takes triple damage', () => {
    const regular = new Customer(REGULAR_CUSTOMER, 300, 200);
    expect(regular.hit({ damage: 1, direction: 1, decisive: true }, 0)).toBe('won');
    const escalated = new Customer(ESCALATED_CUSTOMER, 300, 200);
    escalated.hit({ damage: 1, direction: 1, decisive: true }, 0);
    expect(escalated.frustration).toBe(ESCALATED_CUSTOMER.frustration - 3);
  });

  it('strolls away from the player after celebrating', () => {
    const harness = new Harness();
    harness.player = { x: 200, feet: 200 };
    const customer = new Customer(REGULAR_CUSTOMER, 300, 200);
    customer.hit({ damage: 99, direction: 1 }, 0);
    harness.run(customer, 0.5);
    expect(customer.centerX).toBeCloseTo(300, 0);
    harness.run(customer, 2);
    expect(customer.centerX).toBeGreaterThan(330);
  });

  it('counts how far it walks in pixels of its art, for legs that keep pace with the ground', () => {
    const harness = new Harness();
    harness.calm = true;
    harness.player = { x: 220, feet: 200 };
    const regular = new Customer(REGULAR_CUSTOMER, 400, 200);
    harness.run(regular, 2);
    expect(regular.centerX).toBeLessThan(400 - REGULAR_CUSTOMER.walkSpeed);
    expect(regular.walked).toBeCloseTo(400 - regular.centerX, 6);
    const won = new Customer(ESCALATED_CUSTOMER, 400, 200, { kind: 'won', since: harness.time });
    harness.run(won, 2);
    expect(won.centerX).toBeGreaterThan(440);
    expect(won.walked).toBeCloseTo((won.centerX - 400) / ESCALATED_CUSTOMER.scale, 6);
  });

  it('counts no steps against a wall', () => {
    const collision = flatWorld();
    for (let row = 0; row < 12; row++) collision.grid.set(14, row, 'solid');
    const harness = new Harness(collision);
    harness.calm = true;
    harness.player = { x: 100, feet: 200 };
    const customer = new Customer(REGULAR_CUSTOMER, 260, 200);
    harness.run(customer, 3);
    const walked = customer.walked;
    harness.run(customer, 1);
    expect(customer.body.x).toBe(15 * 16);
    expect(customer.walked).toBe(walked);
  });

  it('cannot move or shout while stunned', () => {
    const harness = new Harness();
    harness.player = { x: 200, feet: 200 };
    const customer = new Customer(REGULAR_CUSTOMER, 400, 200);
    harness.run(customer, 0.1);
    customer.stun(3, harness.time);
    const x = customer.centerX;
    harness.run(customer, 2.9);
    expect(customer.mood.kind).toBe('stunned');
    expect(customer.centerX).toBeCloseTo(x, 5);
    expect(harness.shouts).toEqual([]);
    harness.run(customer, 0.2);
    expect(customer.mood.kind).toBe('approach');
  });

  it('never walks off a ledge', () => {
    const collision = flatWorld();
    for (let row = 12; row < 15; row++) for (let col = 10; col < 14; col++) collision.grid.set(col, row, 'empty');
    const harness = new Harness(collision);
    harness.player = { x: 100, feet: 200 };
    const customer = new Customer(REGULAR_CUSTOMER, 240, 200);
    harness.run(customer, 8);
    expect(customer.feet).toBe(200);
    expect(customer.body.x).toBeGreaterThanOrEqual(14 * 16 - 1);
  });

  it('drops in, lands, then shouts double volleys and charges (escalated)', () => {
    const harness = new Harness();
    harness.player = { x: 100, feet: 200 };
    const boss = new Customer(ESCALATED_CUSTOMER, 600, 40, { kind: 'entering' });
    harness.run(boss, 1);
    expect(harness.landings).toBe(1);
    expect(boss.feet).toBe(200);
    let charged = false;
    for (let i = 0; i < 60 * 10 && !charged; i++) {
      harness.run(boss, DT);
      charged = boss.charging;
    }
    expect(charged).toBe(true);
    expect(harness.shouts.filter((index) => index === 1).length).toBeGreaterThan(0);
  });
});
