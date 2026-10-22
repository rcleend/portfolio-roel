import { describe, expect, it } from 'vitest';
import { burstFrom, type Confetto, type ConfettoPose, placeConfetto } from './confetti';
import { CHART } from './layout';

const BREACH = { x: 310, y: CHART.top };

function poses(piece: Confetto): ConfettoPose[] {
  const out: ConfettoPose[] = [];
  for (let age = 0; ; age++) {
    const pose: ConfettoPose = { x: 0, y: 0, spin: 0, heat: 0 };
    if (!placeConfetto(piece, age, pose)) return out;
    out.push(pose);
  }
}

describe('the burst at the breach', () => {
  const lively = burstFrom(BREACH, false);
  const calm = burstFrom(BREACH, true);

  it('is the same burst every time', () => {
    expect(burstFrom(BREACH, false)).toEqual(lively);
    expect(burstFrom(BREACH, true)).toEqual(calm);
  });

  it('places a piece as a pure function of its age', () => {
    const piece = lively[lively.length - 1] as Confetto;
    const first: ConfettoPose = { x: 0, y: 0, spin: 0, heat: 0 };
    const again: ConfettoPose = { x: 0, y: 0, spin: 0, heat: 0 };
    placeConfetto(piece, 30, first);
    placeConfetto(piece, 12, again);
    placeConfetto(piece, 30, again);
    expect(again).toEqual(first);
  });

  it('throws its pieces out fast, then lets them flutter down and cool until they are gone', () => {
    for (const piece of lively) {
      const path = poses(piece);
      expect(path.length).toBeGreaterThan(0);
      const heats = path.map((pose) => pose.heat);
      expect(heats).toEqual([...heats].sort((a, b) => a - b));
      expect(heats[0]).toBe(0);
      // Late in its life a piece only drifts: down at a steady rate, barely sideways.
      const [before, last] = path.slice(-2);
      if (before && last) {
        expect(last.y).toBeGreaterThanOrEqual(before.y);
        expect(Math.abs(last.x - before.x)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('spins in 90° steps, a step at a time', () => {
    const spinning = lively.filter((piece) => piece.spin > 0);
    expect(spinning.length).toBeGreaterThan(0);
    for (const piece of spinning) {
      const spins = poses(piece).map((pose) => pose.spin);
      for (let i = 1; i < spins.length; i++) {
        expect([0, 1]).toContain(((spins[i] ?? 0) - (spins[i - 1] ?? 0) + 4) % 4);
      }
    }
  });

  it('never falls through the chart floor', () => {
    for (const piece of [...lively, ...calm]) {
      for (const pose of poses(piece)) expect(pose.y).toBeLessThan(CHART.bottom);
    }
  });

  it('has depth: far specks drift slower than the near markers', () => {
    const speed = (piece: Confetto): number => Math.hypot(piece.vx, piece.vy);
    const far = lively.filter((piece) => piece.shape === 'speck');
    const near = lively.filter((piece) => piece.shape !== 'speck');
    expect(far.length).toBeGreaterThan(0);
    const average = (pieces: readonly Confetto[], of: (piece: Confetto) => number): number =>
      pieces.reduce((sum, piece) => sum + of(piece), 0) / pieces.length;
    expect(average(far, speed)).toBeLessThan(average(near, speed));
    expect(average(far, (piece) => piece.fall)).toBeLessThan(average(near, (piece) => piece.fall));
  });

  it('is fewer, slower pieces that never spin under reduced motion', () => {
    expect(calm.length).toBeLessThan(lively.length);
    expect(calm.every((piece) => piece.spin === 0)).toBe(true);
    const fastest = (pieces: readonly Confetto[]): number =>
      Math.max(...pieces.map((piece) => Math.hypot(piece.vx, piece.vy)));
    expect(fastest(calm)).toBeLessThan(fastest(lively) / 4);
  });
});
