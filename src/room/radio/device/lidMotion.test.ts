import { describe, expect, it } from 'vitest';
import { closeFrom, LID, LID_DISC_GATE_DEGREES, lidAt, lidMoments, lidReaches, openFrom } from './lidMotion';

const OPENING = { kind: 'opening', start: 0 } as const;
const SWING = LID.pushMs + LID.popMs;

describe('the lid', () => {
  it('pushes, pops off its latch and swings open as the storyboard says', () => {
    expect(lidAt(OPENING, 0).degrees).toBeCloseTo(0, 12);
    expect(lidAt(OPENING, LID.pushMs).degrees).toBeCloseTo(-0.6, 9);
    expect(lidAt(OPENING, SWING).degrees).toBeCloseTo(5, 9);
    // From the click (the push is 700 ms after it): 72° at +1079, 80° at +1137, the peak 87.2° at +1309.
    expect(lidAt(OPENING, 1079 - 700).degrees).toBeCloseTo(72, 0);
    expect(lidAt(OPENING, 1137 - 700).degrees).toBeCloseTo(80, 0);
    const peak = lidMoments(OPENING).find((moment) => moment.cue === 'lid-stop');
    expect(peak?.at).toBeCloseTo(SWING + 469, 0);
    expect(lidAt(OPENING, SWING + 469).degrees).toBeGreaterThan(87.0);
    expect(lidAt(OPENING, SWING + 469).degrees).toBeLessThan(87.45);
  });

  it('is within 0.3° of open from 781 ms into the swing and never past 90°', () => {
    for (let t = 0; t < 3000; t += 1) {
      const { degrees } = lidAt(OPENING, t);
      expect(degrees).toBeLessThan(90);
      if (t >= SWING + 781) expect(Math.abs(degrees - LID.openDegrees)).toBeLessThanOrEqual(0.3);
    }
    expect(lidAt(OPENING, 4000).moving).toBe(false);
  });

  it('has no jump at any join', () => {
    for (const plan of [OPENING, { kind: 'closing', start: 0, from: 84 } as const]) {
      for (let t = 1; t < 2000; t += 0.5) {
        expect(Math.abs(lidAt(plan, t).degrees - lidAt(plan, t - 0.5).degrees)).toBeLessThan(1.2);
      }
    }
  });

  it.each([84, 87.2, 40, 3])('falls shut from %s° exactly onto the latch, then rebounds 0.9°', (from) => {
    const plan = { kind: 'closing', start: 100, from } as const;
    expect(lidAt(plan, 100).degrees).toBe(from);
    expect(lidAt(plan, 100 + LID.closeMs).degrees).toBe(0);
    expect(lidAt(plan, 100 + LID.closeMs + LID.reboundMs / 2).degrees).toBeCloseTo(0.9, 9);
    expect(lidAt(plan, 100 + LID.closeMs + LID.reboundMs).degrees).toBe(0);
    expect(lidMoments(plan)).toEqual([
      { cue: 'lid-close', at: 100 },
      { cue: 'lid-latch', at: 100 + LID.closeMs },
    ]);
  });

  it('turns back from its live angle and speed mid-close', () => {
    const closing = closeFrom({ kind: 'open' }, 0);
    const back = openFrom(closing, 150, 0);
    expect(back.kind).toBe('swing');
    expect(lidAt(back, 150).degrees).toBeCloseTo(lidAt(closing, 150).degrees, 9);
    expect(lidAt(back, 3000).degrees).toBeCloseTo(84, 1);
  });

  it('opens a latched lid with the whole push and pop, never before it is asked to', () => {
    expect(openFrom({ kind: 'closed' }, 100, 700)).toEqual({ kind: 'opening', start: 700 });
    expect(openFrom({ kind: 'closed' }, 900, 700)).toEqual({ kind: 'opening', start: 900 });
    expect(closeFrom({ kind: 'opening', start: 700 }, 300)).toEqual({ kind: 'closed' });
  });

  it('says when the discs may rise: as it passes 80°', () => {
    const at = lidReaches(OPENING, LID_DISC_GATE_DEGREES, 0);
    expect(at).toBeCloseTo(1137 - 700, -1);
    expect(lidAt(OPENING, at ?? 0).degrees).toBeCloseTo(80, 3);
    expect(lidReaches({ kind: 'closed' }, 80, 0)).toBeNull();
  });

  it('above 80° stays clear of any disc rising through the slot', () => {
    // A rising disc is 1.2 mm thick in the slot plane (z −2.115), 46 mm in front of the hinge; the lid is 5 mm
    // thick and 223 mm long. It crosses the slot plane at y = 1.044 + d·tan θ only while d / cos θ ≤ 223 mm.
    const d = 0.046 - 0.005;
    for (let degrees = LID_DISC_GATE_DEGREES; degrees <= 90; degrees += 0.25) {
      const angle = (degrees * Math.PI) / 180;
      expect(d / Math.cos(angle)).toBeGreaterThan(0.223);
    }
    const below = (79 * Math.PI) / 180;
    expect(d / Math.cos(below)).toBeLessThan(0.223);
  });
});
