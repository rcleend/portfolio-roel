import { describe, expect, it } from 'vitest';
import { CameraFollow, type CameraTarget } from './CameraFollow';

const DT = 1 / 60;

function settle(camera: CameraFollow, target: CameraTarget, seconds = 3): void {
  for (let i = 0; i < seconds * 60; i++) camera.update(target, DT);
}

describe('CameraFollow', () => {
  it('clamps to the start and end of the level', () => {
    const camera = new CameraFollow(320, 240, 2000);
    camera.snapTo({ x: 20, facing: 1, vx: 0 });
    expect(camera.view.x).toBe(0);
    settle(camera, { x: 1990, facing: 1, vx: 100 });
    expect(camera.view.x).toBe(1680);
  });

  it('looks ahead in the direction of travel', () => {
    const camera = new CameraFollow(320, 240, 4000);
    settle(camera, { x: 1000, facing: 1, vx: 100 });
    const ahead = camera.view.x;
    expect(1000 - ahead).toBeLessThan(160);
    settle(camera, { x: 1000, facing: -1, vx: -100 });
    expect(1000 - camera.view.x).toBeGreaterThan(160);
  });

  it('keeps the look-ahead while standing still', () => {
    const camera = new CameraFollow(320, 240, 4000);
    settle(camera, { x: 1000, facing: 1, vx: 100 });
    const moving = camera.view.x;
    settle(camera, { x: 1000, facing: -1, vx: 0 });
    expect(camera.view.x).toBe(moving);
  });

  it('never scrolls left of a locked arena wall', () => {
    const camera = new CameraFollow(320, 240, 4000);
    settle(camera, { x: 3000, facing: 1, vx: 100 });
    camera.lockLeft(2800);
    settle(camera, { x: 2810, facing: -1, vx: -100 });
    expect(camera.view.x).toBe(2800);
  });

  it('scrolls in whole pixels', () => {
    const camera = new CameraFollow(320, 240, 4000);
    for (let i = 0; i < 30; i++) {
      camera.update({ x: 500 + i * 1.7, facing: 1, vx: 100 }, DT);
      expect(Number.isInteger(camera.view.x)).toBe(true);
    }
  });
});
