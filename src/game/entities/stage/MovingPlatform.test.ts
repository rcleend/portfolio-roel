import { describe, expect, it } from 'vitest';
import type { MoverStyle } from '../../world/stage';
import { MovingPlatform } from './MovingPlatform';

const STYLE: MoverStyle = {
  prop: 'car',
  roofInset: 5,
  roofMargin: 10,
  speed: 60,
  dwell: 0.5,
  railColor: '#000000',
  railShade: '#000000',
};
const DT = 1 / 60;

function run(platform: MovingPlatform, seconds: number, ridden: boolean): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) platform.update(DT, ridden);
}

describe('MovingPlatform', () => {
  it('waits at home until ridden, then crosses after its dwell', () => {
    const car = new MovingPlatform(STYLE, 96, 48, 100, 500, 200);
    run(car, 2, false);
    expect(car.x).toBe(100);
    run(car, 0.4, true);
    expect(car.x).toBe(100);
    run(car, 0.5, true);
    expect(car.x).toBeGreaterThan(100);
    run(car, 10, true);
    expect(car.x).toBe(500 - 96);
  });

  it('reports its displacement so riders are carried', () => {
    const car = new MovingPlatform(STYLE, 96, 48, 100, 500, 200);
    run(car, 1, true);
    car.update(DT, true);
    expect(car.dx).toBeCloseTo(1, 5);
    expect(car.dy).toBe(0);
  });

  it('heads home when nobody rides it', () => {
    const car = new MovingPlatform(STYLE, 96, 48, 100, 500, 200);
    run(car, 2, true);
    run(car, 12, false);
    expect(car.x).toBe(100);
  });

  it('exposes a walkable roof inset from the prop edges, resting on the ground', () => {
    const car = new MovingPlatform(STYLE, 96, 48, 100, 500, 200);
    expect(car.top).toBe(152);
    expect(car.rect).toEqual({ x: 110, y: 157, w: 76, h: 4 });
  });
});

describe('MovingPlatform rider grace', () => {
  it('keeps going while its rider is briefly airborne', () => {
    const car = new MovingPlatform(STYLE, 96, 48, 100, 500, 200);
    run(car, 2, true);
    const x = car.x;
    run(car, 1, false);
    expect(car.x).toBeGreaterThan(x);
  });
});
