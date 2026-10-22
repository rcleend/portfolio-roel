import { describe, expect, it } from 'vitest';
import { frames } from '@/engine/motion/progress';
import { ATTRACT_AFTER_SECONDS, TITLE_TIMES } from '../../titleTimeline';
import { layoutClouds } from './clouds';
import { STAGE } from './layout';
import { skyShade } from './sky';
import { layoutStars, starX, twinkleLevel } from './stars';

const CLOUDS = layoutClouds();
const STARS = layoutStars(CLOUDS);
const SHOWN = Array.from({ length: Math.round((TITLE_TIMES.settled + ATTRACT_AFTER_SECONDS) * 60) }, (_, f) =>
  frames(f),
);

describe('stars', () => {
  it('come in three depths, fewer the nearer, all in clear sky above the plume’s shadow line', () => {
    const counts = [0, 1, 2].map((depth) => STARS.filter((star) => star.depth === depth).length);
    expect(counts[0]).toBeGreaterThan(counts[1] ?? 0);
    expect(counts[1]).toBeGreaterThan(counts[2] ?? 0);
    expect(counts[2]).toBeGreaterThan(0);
    for (const star of STARS) {
      expect(CLOUDS.shade(star.x, star.y)).toBeNull();
      expect(star.y).toBeLessThan(STAGE.terminator + 1);
      expect(skyShade(star.x, star.y)).toBeLessThan(9);
    }
  });

  it('twinkle a single palette step at a time, never strobing, and slower under reduced motion', () => {
    const changes = (reducedMotion: boolean): number => {
      let count = 0;
      for (const star of STARS.filter((candidate) => candidate.depth > 0)) {
        SHOWN.forEach((time, i) => {
          if (i === 0) return;
          const step = twinkleLevel(star, time, reducedMotion) - twinkleLevel(star, SHOWN[i - 1] ?? 0, reducedMotion);
          expect(Math.abs(step)).toBeLessThanOrEqual(1);
          if (step !== 0) count++;
        });
      }
      return count;
    };
    expect(changes(true)).toBeLessThan(changes(false));
  });

  it('drift west with depth, a pixel at a time: the far field holds still, near stars outpace the rest', () => {
    const end = SHOWN.at(-1) ?? 0;
    const drift = (depth: number): number =>
      Math.max(...STARS.filter((star) => star.depth === depth).map((star) => star.x - starX(star, end, false)));
    expect(drift(0)).toBe(0);
    expect(drift(1)).toBeGreaterThan(0);
    expect(drift(2)).toBeGreaterThan(drift(1));
    for (const star of STARS) {
      SHOWN.forEach((time, i) => {
        if (i > 0) expect(starX(star, SHOWN[i - 1] ?? 0, false) - starX(star, time, false)).toBeLessThanOrEqual(1);
      });
    }
  });
});
