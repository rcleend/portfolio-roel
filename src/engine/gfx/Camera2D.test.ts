import { describe, expect, it } from 'vitest';
import { Camera2D } from './Camera2D';

describe('Camera2D', () => {
  it('centres on a target and clamps to the level bounds', () => {
    const camera = new Camera2D(320, 240, { x: 0, y: 0, w: 1000, h: 240 });
    camera.centerOn(100, 120);
    expect(camera.view).toEqual({ x: 0, y: 0 });
    camera.centerOn(990, 120);
    expect(camera.view).toEqual({ x: 680, y: 0 });
  });

  it('ignores movement inside the dead zone', () => {
    const camera = new Camera2D(320, 240);
    camera.centerOn(160, 120);
    camera.follow(170, 120, 1);
    expect(camera.view.x).toBe(0);
    camera.follow(200, 120, 1);
    expect(camera.view.x).toBe(24);
  });

  it('shakes in whole pixels and settles', () => {
    const camera = new Camera2D(320, 240);
    camera.shake(3, 0.1);
    camera.update(1 / 60);
    const shaken = camera.view;
    expect(Number.isInteger(shaken.x) && Number.isInteger(shaken.y)).toBe(true);
    for (let i = 0; i < 10; i++) camera.update(1 / 60);
    expect(camera.view).toEqual({ x: 0, y: 0 });
  });
});
