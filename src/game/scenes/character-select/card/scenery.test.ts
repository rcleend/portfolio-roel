import { describe, expect, it } from 'vitest';
import { Rng } from '@/engine/math/Rng';
import type { ParticleKind } from '../classThemes';
import { createParticles, particlePosition } from './particles';
import { createStars, starLevel } from './starfield';

const KINDS: readonly ParticleKind[] = ['code', 'paint', 'notes'];

describe('particles', () => {
  it.each(KINDS)('%s particles are reproducible from a seed', (kind) => {
    expect(createParticles(kind, new Rng(7), 110, 180)).toEqual(createParticles(kind, new Rng(7), 110, 180));
  });

  it.each(KINDS)('%s particles always stay within a small margin of the card', (kind) => {
    const particles = createParticles(kind, new Rng(3), 110, 180);
    for (let frame = 0; frame < 60 * 20; frame += 7) {
      for (const particle of particles) {
        const { x, y } = particlePosition(kind, particle, frame / 60, 180);
        expect(y).toBeGreaterThanOrEqual(-8);
        expect(y).toBeLessThanOrEqual(180 + 8);
        expect(x).toBeGreaterThan(-8);
        expect(x).toBeLessThan(110 + 8);
      }
    }
  });

  it('floats code upwards and lets paint and notes fall', () => {
    const drift = (kind: ParticleKind): number => {
      const [particle] = createParticles(kind, new Rng(11), 110, 1000);
      if (!particle) throw new Error('no particle');
      return particlePosition(kind, particle, 0.5, 100_000).y - particlePosition(kind, particle, 0, 100_000).y;
    };
    expect(drift('code')).toBeLessThan(0);
    expect(drift('paint')).toBeGreaterThan(0);
    expect(drift('notes')).toBeGreaterThan(0);
  });
});

describe('stars', () => {
  it('twinkle in whole steps, never below their resting level', () => {
    const stars = createStars(new Rng(5), 110, 180, 30);
    for (const star of stars) {
      for (let frame = 0; frame < 300; frame++) {
        const level = starLevel(star, frame / 60);
        expect(Number.isInteger(level)).toBe(true);
        expect(level).toBeGreaterThanOrEqual(star.base);
        expect(level).toBeLessThanOrEqual(star.flare ? 3 : 2);
      }
    }
  });

  it('flare to a cross at some point when they are bright stars', () => {
    const flaring = createStars(new Rng(5), 110, 180, 60).find((star) => star.flare);
    if (!flaring) throw new Error('expected at least one flaring star');
    const levels = Array.from({ length: 600 }, (_, frame) => starLevel(flaring, frame / 60));
    expect(levels).toContain(3);
  });
});
