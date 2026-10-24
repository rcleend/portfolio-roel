import { describe, expect, it } from 'vitest';
import {
  Spring,
  sampleSpin,
  spinAt,
  spinChanging,
  spinThen,
  springAt,
  springFirstStop,
  springPeakShare,
  TURN_MAX_BRAKE,
  turnPeakSpeed,
  uprightTarget,
  uprightTurn,
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

  it.each([0.5, 0.8, 0.85, 1])('knows its top speed from rest: a share of the offset times ω₀ (ζ %s)', (zeta) => {
    const hz = 3;
    let peak = 0;
    for (let ms = 0; ms < 2000; ms += 0.25) peak = Math.max(peak, Math.abs(springAt(2, 0, zeta, hz, ms / 1000).v));
    expect(peak / (2 * 2 * Math.PI * hz)).toBeCloseTo(springPeakShare(zeta), 3);
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
      { kind: 'turn', t0: 0, phi0: 1, omega0: 3, target: 6.28, duration: 1100 },
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

describe('uprightTurn', () => {
  const turn = 2 * Math.PI;
  const MAX = 5;
  /** Speeds and angles over a turn, sampled every 2 ms. */
  const sweep = (segment: ReturnType<typeof uprightTurn>) => {
    if (segment.kind !== 'turn') throw new Error('a turn');
    const samples = [];
    for (let t = segment.t0; t <= segment.t0 + segment.duration + 20; t += 2) samples.push(sampleSpin(segment, t));
    return { segment, samples, peak: Math.max(...samples.map((sample) => Math.abs(sample.omega))) };
  };

  it('leaves at the live angle and speed and arrives upright at rest', () => {
    const { segment, samples } = sweep(uprightTurn(100, 2.5, 1, { nominalMs: 320, maxSpeed: MAX }));
    expect(samples[0]).toEqual({ phi: 2.5, omega: 1 });
    expect(segment.target).toBeCloseTo(turn, 12);
    expect(sampleSpin(segment, segment.t0 + segment.duration)).toEqual({ phi: turn, omega: 0 });
    expect(spinChanging([segment], segment.t0 + segment.duration)).toBe(false);
  });

  it('finds its own peak speed exactly', () => {
    for (const [delta, omega0, seconds] of [
      [3, 1, 0.6],
      [-2, 1, 0.5],
      [0.4, 14, 0.09],
      [6, -1, 2],
    ] as const) {
      const { peak } = sweep({ kind: 'turn', t0: 0, phi0: 0, omega0, target: delta, duration: seconds * 1000 });
      expect(turnPeakSpeed(delta, omega0, seconds)).toBeCloseTo(peak, 1);
    }
  });

  it('never turns a label faster than the bound, from any angle, taking longer only when it must', () => {
    for (let phi0 = 0; phi0 < turn; phi0 += 0.05) {
      const { segment, peak } = sweep(uprightTurn(0, phi0, 1, { nominalMs: 320, maxSpeed: MAX }));
      expect(peak).toBeLessThanOrEqual(MAX + 1e-9);
      // Just short of upright it stops sooner rather than run past it and back (3·Δ/ω₀).
      if (segment.kind === 'turn' && segment.target - phi0 >= 0.32 / 3) {
        expect(segment.duration).toBeGreaterThanOrEqual(320);
      }
    }
  });

  it('is upright on time, turning back from just past upright when that is the gentler way', () => {
    let worst = 0;
    for (let phi0 = 0; phi0 < turn; phi0 += 0.05) {
      const { segment, peak } = sweep(
        uprightTurn(0, phi0, 1, { nominalMs: 320, maxSpeed: MAX, withinMs: 840, mayTurnBack: true }),
      );
      if (segment.kind === 'turn') expect(segment.duration).toBeLessThanOrEqual(840);
      worst = Math.max(worst, peak);
    }
    // Half a turn in 840 ms is the hardest case: 1.5 · π / 0.84 s.
    expect(worst).toBeLessThan(5.7);
    expect(uprightTurn(0, 0.5, 1, { nominalMs: 320, maxSpeed: MAX }).kind === 'turn').toBe(true);
    const ahead = uprightTurn(0, 0.5, 1, { nominalMs: 320, maxSpeed: MAX });
    const back = uprightTurn(0, 0.5, 1, { nominalMs: 320, maxSpeed: MAX, mayTurnBack: true });
    expect(ahead.kind === 'turn' && ahead.target).toBeCloseTo(turn, 12);
    expect(back.kind === 'turn' && back.target).toBeCloseTo(0, 12);
  });

  it('brakes a fast spin to a stop without running past upright and back', () => {
    for (let phi0 = 0; phi0 < turn; phi0 += 0.1) {
      const { segment, samples, peak } = sweep(uprightTurn(0, phi0, 14, { nominalMs: 320, maxSpeed: MAX }));
      expect(peak).toBeCloseTo(14, 9);
      expect(samples.every((sample) => sample.omega >= -1e-9)).toBe(true);
      if (segment.kind === 'turn') expect(segment.duration).toBeGreaterThanOrEqual((2000 * 14) / TURN_MAX_BRAKE - 1e-6);
    }
  });
});
