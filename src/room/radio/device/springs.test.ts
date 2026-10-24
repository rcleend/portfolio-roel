import { describe, expect, it } from 'vitest';
import {
  Spring,
  sampleSpin,
  spinAt,
  spinChanging,
  spinThen,
  springAt,
  springFirstStop,
  uprightTarget,
} from './springs';

describe('springAt', () => {
  it.each([0.3, 0.72, 1, 1.6])('starts where it is released and comes to rest at ζ %s', (zeta) => {
    expect(springAt(-79, 220, zeta, 1.4, 0)).toEqual({ x: -79, v: 220 });
    const late = springAt(-79, 220, zeta, 1.4, 10);
    expect(Math.abs(late.x)).toBeLessThan(1e-3);
    expect(Math.abs(late.v)).toBeLessThan(1e-2);
  });

  it.each([0.3, 0.72, 1, 1.6])('has the velocity its position changes by (ζ %s)', (zeta) => {
    for (const t of [0.01, 0.2, 0.47, 1.1]) {
      const h = 1e-6;
      const slope = (springAt(1, -3, zeta, 2, t + h).x - springAt(1, -3, zeta, 2, t - h).x) / (2 * h);
      expect(springAt(1, -3, zeta, 2, t).v).toBeCloseTo(slope, 3);
    }
  });

  it('finds the first stop of an underdamped spring', () => {
    const stop = springFirstStop(-79, 220, 0.72, 1.4);
    expect(stop).toBeCloseTo(0.469, 3);
    expect(Math.abs(springAt(-79, 220, 0.72, 1.4, stop ?? 0).v)).toBeLessThan(1e-9);
    expect(springFirstStop(1, 0, 1.2, 1)).toBeNull();
  });
});

describe('Spring', () => {
  it('retargets from its live value and velocity without a jump', () => {
    const spring = new Spring(0, 0.7, 4);
    spring.retarget(0, 1);
    const before = spring.value(120);
    const speed = spring.velocity(120);
    spring.retarget(120, 0);
    expect(spring.value(120)).toBeCloseTo(before, 12);
    expect(spring.velocity(120)).toBeCloseTo(speed, 12);
    expect(spring.settled(3000)).toBe(true);
    expect(spring.target).toBe(0);
  });
});

describe('spins', () => {
  it('integrates every kind of speed change exactly', () => {
    const segments = [
      { kind: 'coast', t0: 0, phi0: 1, omega: 2 },
      { kind: 'decay', t0: 0, phi0: 0, omega0: 14, omega1: 1, tau: 350 },
      { kind: 'ramp', t0: 0, phi0: 0, omega0: 0, omega1: 47, duration: 900, ease: 'smooth' },
      { kind: 'ramp', t0: 0, phi0: 0, omega0: 47, omega1: 0, duration: 700, ease: 'out-cubic' },
      { kind: 'settle', t0: 0, phi0: 1, omega0: 3, target: 6.28, zeta: 0.8, hz: 3 },
    ] as const;
    for (const segment of segments) {
      for (const t of [10, 300, 650, 1200]) {
        const h = 1e-3;
        const slope = ((sampleSpin(segment, t + h).phi - sampleSpin(segment, t - h).phi) / (2 * h)) * 1000;
        expect(sampleSpin(segment, t).omega).toBeCloseTo(slope, 2);
      }
    }
  });

  it('reaches play speed at the end of a spin-up and stays there', () => {
    const up = { kind: 'ramp', t0: 100, phi0: 0, omega0: 0, omega1: 47, duration: 900, ease: 'smooth' } as const;
    expect(sampleSpin(up, 100).omega).toBe(0);
    expect(sampleSpin(up, 1000).omega).toBeCloseTo(47, 9);
    expect(sampleSpin(up, 5000).omega).toBe(47);
  });

  it('switches segments at their starts and keeps the past when a change is scheduled', () => {
    const track = spinThen([{ kind: 'coast', t0: 0, phi0: 0, omega: 1 }], 0, {
      kind: 'coast',
      t0: 1000,
      phi0: 1,
      omega: 0,
    });
    expect(spinAt(track, 500).omega).toBe(1);
    expect(spinAt(track, 1500)).toEqual({ phi: 1, omega: 0 });
    expect(spinChanging(track, 500)).toBe(false);
    expect(
      spinChanging([{ kind: 'ramp', t0: 0, phi0: 0, omega0: 0, omega1: 5, duration: 100, ease: 'smooth' }], 50),
    ).toBe(true);
  });

  it('settles labels upright ahead of their travel', () => {
    const turn = 2 * Math.PI;
    expect(uprightTarget(1, 5)).toBeCloseTo(turn, 12);
    expect(uprightTarget(-1, -5)).toBeCloseTo(-turn, 12);
    expect(uprightTarget(turn + 0.2, 0)).toBeCloseTo(turn, 12);
  });
});
