import { describe, expect, it } from 'vitest';
import { KEYS, keyMoving, keyShade, keyTravel, releaseStart, rockerDegrees, sideKeyTravel } from './keyMotion';

describe('the keys', () => {
  it('tilt the rocker in 6° in 50 ms, hold at least 140 ms and spring back with a small overshoot', () => {
    const press = { key: 'play-pause', down: 0, up: 10 } as const;
    expect(keyTravel(press, 0)).toBe(0);
    expect(rockerDegrees('play-pause', keyTravel(press, 50))).toBeCloseTo(6, 9);
    expect(releaseStart(press)).toBe(140);
    expect(keyTravel(press, 139)).toBe(1);
    let lowest = Infinity;
    for (let t = 140; t < 480; t++) lowest = Math.min(lowest, keyTravel(press, t));
    expect(lowest * KEYS.rockerDegrees).toBeLessThan(0);
    expect(-lowest * KEYS.rockerDegrees).toBeLessThanOrEqual(1.5);
    expect(-lowest * KEYS.rockerDegrees).toBeGreaterThan(0.6);
    expect(keyMoving(press, 380)).toBe(false);
    expect(Math.abs(keyTravel(press, 380))).toBeLessThan(0.01);
  });

  it('take as long to go down as asked: the radio presses its own ▷II slowly', () => {
    const press = { key: 'play-pause', down: 0, up: 300, inMs: 90 } as const;
    expect(keyTravel(press, 50)).toBeLessThan(0.9);
    expect(keyTravel(press, 90)).toBe(1);
  });

  it('hold while the pointer does', () => {
    const held = { key: 'stop', down: 0, up: null } as const;
    expect(keyTravel(held, 5000)).toBe(1);
    expect(keyMoving(held, 5000)).toBe(true);
    expect(rockerDegrees('stop', 1)).toBe(-6);
  });

  it('push the side keys 2.5 mm in 35 ms and let them out over 110 ms', () => {
    const press = { key: 'next', down: 0, up: 0 } as const;
    expect(sideKeyTravel(keyTravel(press, 35))).toBeCloseTo(0.0025, 9);
    expect(keyTravel(press, 140 + 110)).toBe(0);
    expect(keyMoving(press, 251)).toBe(false);
  });

  it('draw a reduced-motion press fully down for its whole length', () => {
    const press = { key: 'play-pause', down: 0, up: 120, instant: true } as const;
    expect(keyTravel(press, 0)).toBe(1);
    expect(keyTravel(press, 119)).toBe(1);
    expect(keyTravel(press, 120)).toBe(0);
  });

  it('shade the pressed face like a key sinking into its recess, and tip its other half into the light', () => {
    expect(keyShade('play-pause', 'play-pause', 1)).toBeCloseTo(0.55, 9);
    expect(keyShade('stop', 'play-pause', 1)).toBeCloseTo(1.18, 9);
    expect(keyShade('next', 'next', 1)).toBeCloseTo(0.55, 9);
    expect(keyShade('previous', 'play-pause', 1)).toBe(1);
    expect(keyShade('play-pause', 'play-pause', 0.5)).toBeCloseTo(0.775, 9);
    expect(keyShade('play-pause', null, 1)).toBe(1);
  });
});
