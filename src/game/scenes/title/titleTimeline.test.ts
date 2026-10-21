import { describe, expect, it } from 'vitest';
import { frames } from '@/engine/motion/progress';
import {
  ATTRACT_AFTER_SECONDS,
  attractDue,
  craterVisible,
  crossed,
  FIREBALL_RADIUS,
  fireballGlow,
  fireballRadius,
  flashCoverage,
  GLINT,
  glintProgress,
  isSettled,
  lockShake,
  logoVisible,
  promptLit,
  slideRemaining,
  TITLE_TIMES,
} from './titleTimeline';

describe('impact', () => {
  it('collapses the fireball to nothing just as the crater appears', () => {
    expect(fireballRadius(0)).toBe(FIREBALL_RADIUS);
    expect(fireballRadius(TITLE_TIMES.fireballEnd / 2)).toBeLessThan(FIREBALL_RADIUS);
    expect(fireballRadius(TITLE_TIMES.fireballEnd)).toBe(0);
    expect(craterVisible(TITLE_TIMES.fireballEnd - frames(1))).toBe(false);
    expect(craterVisible(TITLE_TIMES.crater)).toBe(true);
  });

  it('lights the card with the fireball in flat steps', () => {
    expect(fireballGlow(0)).toBe(1);
    expect(fireballGlow(TITLE_TIMES.fireballEnd)).toBe(0);
    const levels = new Set(Array.from({ length: 20 }, (_, i) => fireballGlow(i / 60)));
    expect(levels.size).toBeLessThanOrEqual(4);
  });
});

describe('logo slide', () => {
  it('starts off-screen, decelerates hard and arrives on time', () => {
    expect(logoVisible(TITLE_TIMES.slideStart - frames(1))).toBe(false);
    expect(slideRemaining(TITLE_TIMES.slideStart)).toBe(1);
    const third = TITLE_TIMES.slideStart + (TITLE_TIMES.slideEnd - TITLE_TIMES.slideStart) / 3;
    expect(slideRemaining(third)).toBeLessThan(0.25);
    expect(slideRemaining(TITLE_TIMES.slideEnd)).toBe(0);
  });

  it('shakes for exactly two frames when the words lock, unless motion is reduced', () => {
    const shakes = Array.from({ length: 6 }, (_, i) => lockShake(TITLE_TIMES.slideEnd + frames(i - 1), false));
    expect(shakes.filter((offset) => offset.x !== 0 || offset.y !== 0)).toHaveLength(2);
    expect(lockShake(TITLE_TIMES.slideEnd, true)).toEqual({ x: 0, y: 0 });
  });
});

describe('flash', () => {
  it('whites out the screen between the lock and the settled title', () => {
    expect(flashCoverage(TITLE_TIMES.flashStart - frames(1), false)).toBe(0);
    expect(flashCoverage(TITLE_TIMES.flashStart, false)).toBe(1);
    expect(flashCoverage(TITLE_TIMES.settled - frames(1), false)).toBe(0.5);
    expect(flashCoverage(TITLE_TIMES.settled, false)).toBe(0);
  });

  it('never flashes under reduced motion', () => {
    for (let i = 0; i < 120; i++) expect(flashCoverage(i / 60, true)).toBe(0);
  });
});

describe('prompt', () => {
  it('stays dark during the intro, then blinks 32 frames on and 16 off', () => {
    expect(promptLit(TITLE_TIMES.settled - frames(1), null)).toBe(false);
    expect(isSettled(TITLE_TIMES.settled)).toBe(true);
    expect(promptLit(TITLE_TIMES.settled, null)).toBe(true);
    expect(promptLit(TITLE_TIMES.settled + frames(33), null)).toBe(false);
    expect(promptLit(TITLE_TIMES.settled + frames(49), null)).toBe(true);
  });

  it('blinks fast after a press, whatever the intro was doing', () => {
    const lit = Array.from({ length: 12 }, (_, i) => promptLit(0, frames(i)));
    expect(lit).toEqual([true, true, true, false, false, false, true, true, true, false, false, false]);
  });
});

describe('cues and loops', () => {
  it('fires a cue once, on the step that reaches it', () => {
    expect(crossed(1.2, 1.25, 1.25)).toBe(true);
    expect(crossed(1.25, 1.27, 1.25)).toBe(false);
    expect(crossed(1.1, 1.2, 1.25)).toBe(false);
  });

  it('replays the intro after the settled title has been left alone', () => {
    expect(attractDue(TITLE_TIMES.settled + ATTRACT_AFTER_SECONDS - frames(1))).toBe(false);
    expect(attractDue(TITLE_TIMES.settled + ATTRACT_AFTER_SECONDS)).toBe(true);
  });

  it('sweeps a glint across the settled logo now and then', () => {
    const first = TITLE_TIMES.settled + GLINT.firstAfter;
    expect(glintProgress(first - frames(1))).toBeNull();
    expect(glintProgress(first)).toBe(0);
    expect(glintProgress(first + GLINT.duration / 2)).toBeCloseTo(0.5, 5);
    expect(glintProgress(first + GLINT.duration + frames(1))).toBeNull();
    expect(glintProgress(first + GLINT.every)).toBeCloseTo(0, 5);
  });
});
