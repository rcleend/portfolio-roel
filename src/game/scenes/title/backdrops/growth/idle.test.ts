import { describe, expect, it } from 'vitest';
import { GLINT, glintProgress, promptLit, TITLE_TIMES } from '../../titleTimeline';
import {
  badgeOpen,
  cursorLit,
  idleBarHeight,
  idleFrame,
  LOOP_FRAMES,
  RECORD_TICKS,
  TAPE_LENGTH,
  TICKS,
  tickerScroll,
  tickFrame,
} from './idle';
import { BAR_STATES, barStates } from './series';
import { FPS, growthCues } from './timeline';

const cues = growthCues(TITLE_TIMES);
const states = barStates();
const BARS = states[0]?.length ?? 0;
/** Every idle frame of one loop, up to the last before the attract loop replays the intro. */
const LOOP = Array.from({ length: LOOP_FRAMES }, (_, idle) => idle);

describe('the cursor', () => {
  it('blinks in step with the prompt once settled, and is lit before', () => {
    for (const idle of LOOP.slice(0, 200)) {
      const frame = cues.settled + idle;
      expect(cursorLit(frame, cues, false)).toBe(promptLit(frame / FPS, null));
    }
    expect(cursorLit(cues.breach, cues, false)).toBe(true);
  });

  it('holds steady under reduced motion', () => {
    expect(LOOP.every((idle) => cursorLit(cues.settled + idle, cues, true))).toBe(true);
  });
});

describe('the ticker', () => {
  it('waits for the settled title, then scrolls a pixel every other frame', () => {
    expect(idleFrame(cues.settled - 1, cues)).toBeNull();
    expect(tickerScroll(cues.settled, cues, false)).toBe(0);
    const scrolls = LOOP.map((idle) => tickerScroll(cues.settled + idle, cues, false));
    const steps = scrolls.slice(1).map((scroll, i) => scroll - (scrolls[i] ?? 0));
    expect(new Set(steps)).toEqual(new Set([0, 1]));
    expect(steps.filter((step) => step === 1)).toHaveLength(LOOP_FRAMES / 2 - 1);
  });

  it('scrolls one whole tape per loop, so the tape wraps exactly where the loop does', () => {
    expect(tickerScroll(cues.settled + LOOP_FRAMES, cues, false) % TAPE_LENGTH).toBe(0);
  });

  it('scrolls at half the pace under reduced motion', () => {
    expect(tickerScroll(cues.settled + 400, cues, true)).toBe(tickerScroll(cues.settled + 400, cues, false) / 2);
  });
});

describe('the bars', () => {
  const glintFrames = LOOP.filter((idle) => glintProgress(TITLE_TIMES.settled + idle / FPS) !== null);

  it('tick halfway between two glints, never while one sweeps the logo', () => {
    for (let tick = 0; tick < TICKS; tick++) {
      const ripple = { from: tickFrame(tick), to: tickFrame(tick) + BARS + 2 * 4 };
      expect(glintFrames.some((idle) => idle >= ripple.from && idle <= ripple.to)).toBe(false);
      expect(ripple.to).toBeLessThan(LOOP_FRAMES);
    }
    expect(tickFrame(1) - tickFrame(0)).toBe(GLINT.every * FPS);
  });

  it('step a pixel at a time, never jumping, with or without reduced motion', () => {
    for (const reducedMotion of [false, true]) {
      for (let bar = 0; bar < BARS; bar++) {
        const heights = LOOP.map((idle) => idleBarHeight(states, bar, idle, reducedMotion));
        const jumps = heights.slice(1).map((height, i) => Math.abs(height - (heights[i] ?? 0)));
        expect(Math.max(...jumps)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('come back to where the intro left them by the end of the loop, so the loop has no seam', () => {
    for (let bar = 0; bar < BARS; bar++) {
      expect(idleBarHeight(states, bar, 0, false)).toBe(states[0]?.[bar]);
      expect(idleBarHeight(states, bar, LOOP_FRAMES - 1, false)).toBe(states[0]?.[bar]);
      expect(idleBarHeight(states, bar, LOOP_FRAMES - 1, true)).toBe(states[0]?.[bar]);
    }
    expect(BAR_STATES).toBe(TICKS);
  });
});

describe('the "NEW HIGH" badge', () => {
  const live = (state: number): number => states[state]?.[BARS - 1] ?? 0;

  it('pops only after a tick that takes the live bar to a new high', () => {
    for (const tick of RECORD_TICKS) {
      const record = live(tick + 1);
      for (let state = 0; state <= tick; state++) expect(record).toBeGreaterThan(live(state));
    }
    const shown = LOOP.filter((idle) => badgeOpen(idle, false) > 0);
    const firstShown = shown[0] ?? 0;
    expect(firstShown).toBeGreaterThan(tickFrame(RECORD_TICKS[0] ?? 0));
    expect(badgeOpen(null, false)).toBe(0);
  });

  it('pops open with an overshoot, holds, and snaps shut the same way', () => {
    const opens = LOOP.map((idle) => badgeOpen(idle, false));
    const start = opens.findIndex((open) => open > 0);
    expect(opens.slice(start, start + 5)).toEqual([0.25, 0.5, 1.25, 1, 1]);
    const end = opens.indexOf(0, start);
    expect(opens.slice(end - 4, end)).toEqual([1, 1.25, 0.5, 0.25]);
  });

  it('shows without the pop under reduced motion', () => {
    const opens = new Set(LOOP.map((idle) => badgeOpen(idle, true)));
    expect(opens).toEqual(new Set([0, 1]));
  });

  it('stays clear of the glints too', () => {
    const shown = LOOP.filter((idle) => badgeOpen(idle, false) > 0);
    const glints = new Set(LOOP.filter((idle) => glintProgress(TITLE_TIMES.settled + idle / FPS) !== null));
    expect(shown.filter((idle) => glints.has(idle))).toEqual([]);
  });
});
