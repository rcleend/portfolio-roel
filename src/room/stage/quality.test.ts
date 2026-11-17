import { describe, expect, it } from 'vitest';
import {
  expectedFrameMs,
  FAST_FRAME_MS,
  FIT_MARGIN,
  fittingQuality,
  GOVERNOR_WINDOW,
  pixelRatioFor,
  QUALITY_SCALES,
  type Quality,
  QualityGovernor,
  SLOW_FRAME_MS,
  startingTier,
} from './quality';

/** Feeds up to `windows` windows of `ms` frames from `clock.now` on, stopping at the first change, which it returns. */
function run(governor: QualityGovernor, clock: { now: number }, ms: number, windows = 1): Quality | null {
  for (let i = 0; i < windows * GOVERNOR_WINDOW; i++) {
    clock.now += ms;
    const changed = governor.sample(ms, clock.now);
    if (changed) return changed;
  }
  return null;
}

/** Past the frames a change leaves unjudged. */
function settle(clock: { now: number }): void {
  clock.now += 500;
}

describe('startingTier', () => {
  it('starts a desktop at full quality, a phone on the middle tier and a software renderer at the least', () => {
    expect(startingTier({ software: false, coarse: false, shortSide: 900 })).toBe('high');
    expect(startingTier({ software: false, coarse: true, shortSide: 390 })).toBe('medium');
    expect(startingTier({ software: true, coarse: false, shortSide: 900 })).toBe('low');
  });

  it('keeps a tablet and a touch laptop at full quality: the governor corrects what is too much for them', () => {
    expect(startingTier({ software: false, coarse: true, shortSide: 820 })).toBe('high');
    expect(startingTier({ software: false, coarse: false, shortSide: 390 })).toBe('high');
  });
});

describe('pixelRatioFor', () => {
  it('draws the top tier as the room always did: at most 2×, at most 3 MP', () => {
    expect(pixelRatioFor({ tier: 'high', scale: 1 }, 1440, 900, 2)).toBeCloseTo(Math.sqrt(3_000_000 / (1440 * 900)), 6);
    expect(pixelRatioFor({ tier: 'high', scale: 1 }, 390, 844, 3)).toBe(2);
    expect(pixelRatioFor({ tier: 'high', scale: 1 }, 800, 600, 1)).toBe(1);
  });

  it('gives a phone the same pixels on the middle tier, and scales them with the scale', () => {
    expect(pixelRatioFor({ tier: 'medium', scale: 1 }, 390, 844, 3)).toBe(2);
    expect(pixelRatioFor({ tier: 'medium', scale: 0.7 }, 390, 844, 3)).toBeCloseTo(1.4, 6);
    expect(pixelRatioFor({ tier: 'low', scale: 1 }, 390, 844, 3)).toBe(1.5);
  });
});

describe('fittingQuality', () => {
  // A 1440 × 900 canvas on a 2× display.
  const pixels = (quality: Quality): number => pixelRatioFor(quality, 1440, 900, 2) ** 2;
  const high: Quality = { tier: 'high', scale: 1 };

  it('never steps a quick GPU down: a frame within one and a half 60 Hz frames keeps the start', () => {
    expect(fittingQuality(high, 2, pixels)).toBe(high);
    expect(fittingQuality(high, 16.7, pixels)).toBe(high);
    expect(fittingQuality(high, (1000 / 60) * FIT_MARGIN, pixels)).toBe(high);
    expect(fittingQuality(high, Number.NaN, pixels)).toBe(high);
  });

  it('steps down the scales, then the tiers, as far as the pixels have to go', () => {
    expect(fittingQuality(high, 26, pixels)).toEqual({ tier: 'high', scale: 0.7 });
    expect(fittingQuality(high, 40, pixels)).toEqual({ tier: 'high', scale: 0.6 });
    expect(fittingQuality(high, 50, pixels)).toEqual({ tier: 'medium', scale: 0.7 });
    expect(fittingQuality(high, 100, pixels)).toEqual({ tier: 'low', scale: 0.7 });
    expect(fittingQuality(high, 2000, pixels)).toEqual({ tier: 'low', scale: 0.6 });
  });

  it('starts from where the device is, never above it', () => {
    const phone = (quality: Quality): number => pixelRatioFor(quality, 390, 844, 3) ** 2;
    expect(fittingQuality({ tier: 'medium', scale: 1 }, 30, phone)).toEqual({ tier: 'medium', scale: 0.7 });
    expect(fittingQuality({ tier: 'medium', scale: 0.7 }, 30, phone).tier).not.toBe('high');
    expect(fittingQuality({ tier: 'low', scale: 0.6 }, 500, phone)).toEqual({ tier: 'low', scale: 0.6 });
  });
});

describe('QualityGovernor.start', () => {
  it('goes on from the measured quality, and leaves a fixed one alone', () => {
    const governor = new QualityGovernor({ tier: 'high', scale: 1 });
    governor.start({ tier: 'medium', scale: 0.7 }, 1000);
    expect(governor.quality).toEqual({ tier: 'medium', scale: 0.7 });
    const fixed = new QualityGovernor({ tier: 'high', scale: 1 }, true);
    fixed.start({ tier: 'low', scale: 0.6 }, 1000);
    expect(fixed.quality).toEqual({ tier: 'high', scale: 1 });
    expect(fixed.isFixed).toBe(true);
  });
});

describe('QualityGovernor', () => {
  it('leaves the quality alone while frames arrive on time', () => {
    const governor = new QualityGovernor({ tier: 'high', scale: 1 });
    expect(run(governor, { now: 0 }, 16.7, 20)).toBeNull();
    expect(governor.quality).toEqual({ tier: 'high', scale: 1 });
  });

  it('ignores a few long frames in a window: an upload, a collection', () => {
    const governor = new QualityGovernor({ tier: 'high', scale: 1 });
    const clock = { now: 0 };
    for (let window = 0; window < 5; window++) {
      for (let i = 0; i < GOVERNOR_WINDOW; i++) {
        const ms = i < 2 ? 120 : 16.7;
        clock.now += ms;
        expect(governor.sample(ms, clock.now)).toBeNull();
      }
    }
  });

  it('never counts a pause as a frame', () => {
    const governor = new QualityGovernor({ tier: 'high', scale: 1 });
    const clock = { now: 0 };
    for (let i = 0; i < 100; i++) {
      clock.now += 5000;
      expect(governor.sample(5000, clock.now)).toBeNull();
    }
  });

  it('steps the scale down far enough to make slow frames fast, in one step', () => {
    const governor = new QualityGovernor({ tier: 'medium', scale: 1 });
    const clock = { now: 0 };
    // 33 ms a frame: pixels at 0.7 are half, so 0.7 would still be slow; the floor is asked for at once.
    expect(run(governor, clock, 33.3)).toEqual({ tier: 'medium', scale: 0.6 });
    const gentle = new QualityGovernor({ tier: 'medium', scale: 1 });
    expect(run(gentle, { now: 0 }, 22)).toEqual({ tier: 'medium', scale: 0.7 });
  });

  it('drops a tier after two slow windows at the floor, and never climbs back', () => {
    const governor = new QualityGovernor({ tier: 'high', scale: 1 });
    const clock = { now: 0 };
    expect(run(governor, clock, 50)).toEqual({ tier: 'high', scale: 0.6 });
    settle(clock);
    // Faster than before (the step helped) and still slow.
    expect(run(governor, clock, 30)).toBeNull();
    expect(run(governor, clock, 30)).toEqual({ tier: 'medium', scale: 0.7 });
    settle(clock);
    for (let i = 0; i < 40; i++) run(governor, clock, 16.7, 500);
    expect(governor.quality).toEqual({ tier: 'medium', scale: 1 });
  });

  it('stays at the lowest tier and scale when even that is slow', () => {
    const governor = new QualityGovernor({ tier: 'low', scale: 0.6 });
    expect(run(governor, { now: 0 }, 40, 50)).toBeNull();
    expect(governor.quality).toEqual({ tier: 'low', scale: 0.6 });
  });

  it('undoes a step down that did not shorten the frames, and rests', () => {
    const governor = new QualityGovernor({ tier: 'high', scale: 1 });
    const clock = { now: 0 };
    expect(run(governor, clock, 25)).toEqual({ tier: 'high', scale: 0.7 });
    settle(clock);
    // The main thread was what was slow: fewer pixels changed nothing.
    expect(run(governor, clock, 25)).toEqual({ tier: 'high', scale: 1 });
    const rested = clock.now;
    expect(run(governor, clock, 25, 20)).toBeNull();
    expect(clock.now - rested).toBeLessThan(60_000);
    // After the rest it does not try the same again: this is how the frames come here, whatever their pixels.
    clock.now = rested + 61_000;
    expect(run(governor, clock, 25, 20)).toBeNull();
    expect(governor.frameMs).toBeCloseTo(25);
    expect(governor.changes).toBe(2);
    // Frames slower still are slow again.
    expect(run(governor, clock, 40)).toEqual({ tier: 'high', scale: 0.7 });
  });

  describe('on a display that hands out thirty frames a second (Safari in Low Power Mode)', () => {
    const capped = (start: Quality = { tier: 'medium', scale: 1 }): QualityGovernor => {
      const governor = new QualityGovernor(start);
      governor.expect(expectedFrameMs(1000 / 30));
      return governor;
    };

    it('never changes the quality for frames that come as the display hands them out', () => {
      const governor = capped();
      const clock = { now: 0 };
      // Ten minutes of them: judged against sixty a second this stepped to the floor and back every minute.
      expect(run(governor, clock, 1000 / 30, 600)).toBeNull();
      expect(governor.quality).toEqual({ tier: 'medium', scale: 1 });
      expect(governor.changes).toBe(0);
      expect(governor.capped).toBe(true);
      expect(governor.frameMs).toBeCloseTo(33.3, 1);
    });

    it("still steps down when the GPU cannot even hold the thirty, aiming under the display's frame", () => {
      const governor = capped({ tier: 'high', scale: 1 });
      expect(run(governor, { now: 0 }, 50)).toEqual({ tier: 'high', scale: 0.7 });
    });

    it("steps back up while every frame comes on the display's time", () => {
      const governor = capped({ tier: 'medium', scale: 0.7 });
      const clock = { now: 0 };
      clock.now = 20_000;
      expect(run(governor, clock, 1000 / 30)).toEqual({ tier: 'medium', scale: 0.85 });
    });

    it('judges by sixty a second again once the cap is gone', () => {
      const governor = capped({ tier: 'high', scale: 1 });
      const clock = { now: 0 };
      run(governor, clock, 1000 / 30, 3);
      // The charger is plugged in: frames come sixty a second.
      expect(run(governor, clock, 1000 / 60, 3)).toBeNull();
      expect(governor.capped).toBe(false);
      expect(governor.frameMs).toBeCloseTo(1000 / 60, 1);
      expect(run(governor, clock, 25)).toEqual({ tier: 'high', scale: 0.7 });
    });
  });

  describe('when frames come quicker than it expected', () => {
    /** Feeds one window of frames that alternate between `a` and `b` ms. */
    const mixed = (governor: QualityGovernor, clock: { now: number }, a: number, b: number): Quality | null => {
      for (let i = 0; i < GOVERNOR_WINDOW; i++) {
        const ms = i % 2 === 0 ? a : b;
        clock.now += ms;
        const changed = governor.sample(ms, clock.now);
        if (changed) return changed;
      }
      return null;
    };

    it('takes a display wrongly taken for capped by its quickest frames, and steps a slow GPU down on it', () => {
      // A busy page load showed no frame under 33 ms: the display was taken to hand out thirty a second.
      const governor = new QualityGovernor({ tier: 'medium', scale: 1 });
      governor.expect(expectedFrameMs(1000 / 30));
      const clock = { now: 0 };
      // The room's frames then come one and two display frames apart, 25 ms on average: a 60 Hz display and a GPU
      // that misses every other frame of it. Judged against thirty a second that was never slow.
      expect(mixed(governor, clock, 1000 / 60, 1000 / 30)).toEqual({ tier: 'medium', scale: 0.7 });
      expect(governor.capped).toBe(false);
      expect(governor.frameMs).toBeCloseTo(1000 / 60, 1);
    });

    it("expects the display's own frames again, not the mean of a window that was merely quicker", () => {
      const governor = new QualityGovernor({ tier: 'high', scale: 1 });
      const clock = { now: 0 };
      // A step down that changed nothing: 30 ms is how the frames come, for now.
      expect(run(governor, clock, 30)).toEqual({ tier: 'high', scale: 0.7 });
      settle(clock);
      expect(run(governor, clock, 30)).toEqual({ tier: 'high', scale: 1 });
      expect(governor.frameMs).toBeCloseTo(30);
      // The main thread is free again and frames come at 20 ms: sixty a second is what to expect, not fifty.
      clock.now += 61_000;
      expect(run(governor, clock, 20)).toBeNull();
      expect(governor.frameMs).toBeCloseTo(1000 / 60, 1);
      // So 24 ms frames are slow again, as on any 60 Hz display.
      expect(run(governor, clock, 24)).not.toBeNull();
    });

    it('keeps a capped display capped through a few frames whose timestamps came early', () => {
      const governor = new QualityGovernor({ tier: 'medium', scale: 1 });
      governor.expect(expectedFrameMs(1000 / 30));
      const clock = { now: 0 };
      for (let window = 0; window < 20; window++) {
        for (let i = 0; i < GOVERNOR_WINDOW; i++) {
          // Three frames a window a display frame early, the next as much late: the grid holds.
          const ms = i < 3 ? 1000 / 60 : i < 6 ? 50 : 1000 / 30;
          clock.now += ms;
          expect(governor.sample(ms, clock.now)).toBeNull();
        }
      }
      expect(governor.capped).toBe(true);
      expect(governor.changes).toBe(0);
    });
  });

  it("expects sixty frames a second of any display about that fast or faster, and a slower one's own", () => {
    for (const hz of [60, 62.5, 75, 90, 120, 144, 240]) expect(expectedFrameMs(1000 / hz)).toBeCloseTo(1000 / 60);
    // A little jitter either way is still sixty.
    expect(expectedFrameMs(15.4)).toBeCloseTo(1000 / 60);
    expect(expectedFrameMs(19.5)).toBeCloseTo(1000 / 60);
    expect(expectedFrameMs(1000 / 30)).toBeCloseTo(33.3, 1);
    expect(expectedFrameMs(32.4)).toBeCloseTo(32.4);
    expect(expectedFrameMs(1000 / 24)).toBeCloseTo(41.7, 1);
  });

  it('steps back up only after a wait that every step down doubles', () => {
    const governor = new QualityGovernor({ tier: 'medium', scale: 1 });
    const clock = { now: 0 };
    expect(run(governor, clock, 24)).toEqual({ tier: 'medium', scale: 0.7 });
    const steppedAt = clock.now;
    settle(clock);
    let up: Quality | null = null;
    while (!up) up = run(governor, clock, 16.7);
    expect(up).toEqual({ tier: 'medium', scale: 0.85 });
    expect(clock.now - steppedAt).toBeGreaterThanOrEqual(30_000);
    expect(clock.now - steppedAt).toBeLessThan(32_000);
  });

  it('does not step up while frames are merely not slow', () => {
    const governor = new QualityGovernor({ tier: 'medium', scale: 0.7 });
    expect(FAST_FRAME_MS).toBeLessThan(19);
    expect(SLOW_FRAME_MS).toBeGreaterThan(19);
    expect(run(governor, { now: 0 }, 19, 500)).toBeNull();
  });

  it('holds a fixed quality whatever the frames say', () => {
    const governor = new QualityGovernor({ tier: 'high', scale: 1 }, true);
    expect(run(governor, { now: 0 }, 80, 20)).toBeNull();
  });

  it('only ever names a scale of the ladder', () => {
    const governor = new QualityGovernor({ tier: 'high', scale: 1 });
    const clock = { now: 0 };
    for (const ms of [22, 16, 40, 16, 16, 90, 16, 30, 16]) {
      const changed = run(governor, clock, ms, 4);
      if (changed) expect(QUALITY_SCALES).toContain(changed.scale);
      clock.now += 300_000;
    }
  });
});
