import { describe, expect, it } from 'vitest';
import { TITLE_LAYOUT } from '../../layout';
import { GLINT, TITLE_TIMES, type TitleBeats } from '../../titleTimeline';
import { INK } from './inks';
import {
  ARMS,
  armReach,
  BOOT_FRAMES,
  boxesShown,
  constructionInk,
  datumShown,
  ERASE_FRAMES,
  eraseInk,
  flare,
  framesSince,
  litRadius,
  PLOTS,
  plotPointRadius,
  plotterAt,
  RINGS,
  registrationRadius,
  revisionAt,
  ringInk,
  ripple,
  SCAN,
  SETTLED_FRAMES,
  STRIKE_FRAMES,
  scanProgress,
  warmUpExposure,
} from './timeline';

const frameOf = (seconds: number): number => Math.round(seconds * 60);
const beat = {
  slideStart: frameOf(TITLE_TIMES.slideStart),
  slideEnd: frameOf(TITLE_TIMES.slideEnd),
  flashStart: frameOf(TITLE_TIMES.flashStart),
  settled: frameOf(TITLE_TIMES.settled),
};
const range = (from: number, to: number): number[] => Array.from({ length: to - from }, (_, i) => from + i);
const isNonIncreasing = (values: readonly number[]): boolean => values.every((v, i) => v <= (values[i - 1] ?? v));
const isNonDecreasing = (values: readonly number[]): boolean => values.every((v, i) => v >= (values[i - 1] ?? v));

describe('the clock', () => {
  it('counts whole frames, so float drift in scene time never moves a beat', () => {
    let time = 0;
    for (let i = 0; i < 87; i++) time += 1 / 60;
    expect(framesSince(time)).toBe(87);
    expect(framesSince(time, TITLE_TIMES.settled)).toBe(0);
  });
});

describe('the strike', () => {
  it('lands white-hot on the first frame and has the whole sheet lit by 0.30 s', () => {
    expect(ringInk(0, 0)).toBe(INK.hot);
    expect(flare(0)?.ink).toBe(INK.hot);
    expect(plotPointRadius(0, false)).toBeGreaterThan(plotPointRadius(BOOT_FRAMES - 1, false) ?? 0);
    expect(BOOT_FRAMES).toBe(frameOf(0.3));
    const { impact, screen } = TITLE_LAYOUT;
    const corners = [
      [0, 0],
      [screen.width, 0],
      [0, screen.height],
      [screen.width, screen.height],
    ];
    const farthest = Math.max(...corners.map(([x, y]) => Math.hypot((x ?? 0) - impact.x, (y ?? 0) - impact.y)));
    expect(RINGS.radii.at(-1)).toBeGreaterThanOrEqual(farthest);
    expect(litRadius(BOOT_FRAMES)).toBe(Number.POSITIVE_INFINITY);
  });

  it('strikes each compass ring further out than the last, slowing like a shockwave', () => {
    const spacing = RINGS.radii.slice(1).map((radius, i) => radius - (RINGS.radii[i] as number));
    expect(spacing.every((gap) => gap > 0)).toBe(true);
    expect(isNonIncreasing(spacing)).toBe(true);
    expect(
      range(0, BOOT_FRAMES)
        .map(litRadius)
        .every((radius, f) => radius === RINGS.radii[Math.floor(f / 2)]),
    ).toBe(true);
  });

  it('cools every ring down the ramp in steps until it is gone, after the sheet is lit', () => {
    for (const [ring] of RINGS.radii.entries()) {
      const struck = ring * RINGS.every;
      expect(ringInk(struck - 1, ring)).toBeNull();
      const inks = range(struck, STRIKE_FRAMES + 1).map((frame) => ringInk(frame, ring));
      const lit = inks.filter((ink): ink is number => ink !== null);
      expect(lit[0]).toBe(INK.hot);
      expect(isNonIncreasing(lit)).toBe(true);
      expect(inks.at(-1)).toBeNull();
    }
    expect(STRIKE_FRAMES).toBeGreaterThan(BOOT_FRAMES);
  });

  it('retracts the cross flare into the plot point', () => {
    const reaches = range(0, 12).map((frame) => flare(frame)?.x ?? 0);
    expect(isNonIncreasing(reaches)).toBe(true);
    expect(reaches.at(-1)).toBe(0);
  });

  it('only warms the light table up in a few even steps under reduced motion, from dark to lit', () => {
    const exposures = range(0, BOOT_FRAMES + 1).map(warmUpExposure);
    expect(isNonDecreasing(exposures)).toBe(true);
    expect(exposures[0]).toBeLessThan(0);
    expect(exposures.at(-1)).toBe(0);
    expect(new Set(exposures).size).toBeLessThanOrEqual(5);
    expect(plotPointRadius(0, true)).toBe(plotPointRadius(BOOT_FRAMES - 1, true));
  });
});

describe('the measuring', () => {
  it('lands the registration mark big and settles it, or simply places it under reduced motion', () => {
    const landing = range(BOOT_FRAMES, BOOT_FRAMES + 6).map((frame) => registrationRadius(frame, false) ?? 0);
    expect(landing[0]).toBeGreaterThan(landing.at(-1) ?? 0);
    expect(isNonIncreasing(landing)).toBe(true);
    expect(registrationRadius(BOOT_FRAMES - 1, false)).toBeNull();
    expect(new Set(range(BOOT_FRAMES, beat.slideEnd).map((frame) => registrationRadius(frame, true))).size).toBe(1);
  });

  it('shoots the arms one after another, each overshooting the frame a little and settling onto it', () => {
    const starts = ARMS.map((arm) => range(0, beat.slideStart).find((frame) => armReach(frame, arm, false) > 0) ?? 0);
    expect(isNonDecreasing(starts)).toBe(true);
    expect(new Set(starts).size).toBe(ARMS.length);
    for (const arm of ARMS) {
      const reach = range(0, beat.slideStart).map((frame) => armReach(frame, arm, false));
      expect(Math.max(...reach)).toBeGreaterThan(1);
      expect(Math.max(...reach)).toBeLessThan(1.05);
      expect(reach.at(-1)).toBe(1);
    }
  });

  it('draws the arms together and stops them dead under reduced motion', () => {
    for (const frame of range(0, beat.slideStart)) {
      const reaches = ARMS.map((arm) => armReach(frame, arm, true));
      expect(new Set(reaches).size).toBe(1);
      expect(reaches[0]).toBeLessThanOrEqual(1);
    }
    expect(armReach(beat.slideStart, 'down', true)).toBe(1);
  });

  it('blinks the construction boxes in, then holds them still through the slide', () => {
    const shown = range(beat.slideStart - 30, beat.slideEnd).map((frame) => boxesShown(frame, TITLE_TIMES, false));
    const firstShown = shown.indexOf(true);
    expect(firstShown).toBeGreaterThan(0);
    expect(shown.slice(firstShown).includes(false)).toBe(true);
    const slide = range(beat.slideStart, beat.slideEnd).map((frame) => boxesShown(frame, TITLE_TIMES, false));
    expect(slide.every(Boolean)).toBe(true);
    expect(range(beat.slideStart, beat.slideEnd).every((frame) => datumShown(frame, TITLE_TIMES, false))).toBe(true);
    expect(datumShown(beat.slideStart - 1, TITLE_TIMES, false)).toBe(false);
  });

  it('never blinks the boxes under reduced motion', () => {
    const shown = range(beat.slideStart - 30, beat.slideEnd).map((frame) => boxesShown(frame, TITLE_TIMES, true));
    expect(shown.slice(shown.indexOf(true)).every(Boolean)).toBe(true);
  });

  it('is satisfied by the lock: white for the two shake frames and gone before the flash', () => {
    expect(constructionInk(beat.slideEnd - 1, TITLE_TIMES, false)).toBe(INK.pale);
    expect(constructionInk(beat.slideEnd, TITLE_TIMES, false)).toBe(INK.hot);
    expect(constructionInk(beat.slideEnd + 1, TITLE_TIMES, false)).toBe(INK.hot);
    expect(beat.slideEnd + 2).toBeLessThan(beat.flashStart);
    expect(constructionInk(beat.slideEnd + 2, TITLE_TIMES, false)).toBeNull();
    expect(boxesShown(beat.slideEnd + 2, TITLE_TIMES, false)).toBe(false);
  });

  it('steps down quietly after the lock under reduced motion, never flaring', () => {
    const inks = range(beat.slideEnd - 1, beat.settled).map((frame) => constructionInk(frame, TITLE_TIMES, true));
    const drawn = inks.filter((ink): ink is number => ink !== null);
    expect(drawn).not.toContain(INK.hot);
    expect(isNonIncreasing(drawn)).toBe(true);
    expect(inks.at(-1)).toBeNull();
  });

  it('plays to the beats it is given rather than to fixed times', () => {
    const later: TitleBeats = { slideStart: 1.5, slideEnd: 1.8, flashStart: 1.85, settled: 2.05 };
    const shift = frameOf(0.6);
    for (const frame of range(BOOT_FRAMES, beat.settled)) {
      expect(boxesShown(frame + shift, later, false)).toBe(boxesShown(frame, TITLE_TIMES, false));
      expect(constructionInk(frame + shift, later, false)).toBe(constructionInk(frame, TITLE_TIMES, false));
      expect(ripple(frame + shift, later, false)).toEqual(ripple(frame, TITLE_TIMES, false));
    }
  });
});

describe('the ripple', () => {
  it('leaves the lock with the words, runs on under the flash and is still spreading as it clears', () => {
    expect(ripple(beat.slideEnd - 1, TITLE_TIMES, false)).toBeNull();
    expect(ripple(beat.slideEnd, TITLE_TIMES, false)?.radius).toBe(0);
    expect(ripple(beat.settled, TITLE_TIMES, false)?.radius).toBeGreaterThan(0);
    const radii = range(beat.slideEnd, beat.slideEnd + 60).map((frame) => ripple(frame, TITLE_TIMES, false)?.radius);
    expect(radii.at(-1)).toBeUndefined();
  });

  it('is slower and fainter under reduced motion', () => {
    const at = beat.settled + 10;
    const calm = ripple(at, TITLE_TIMES, true);
    const full = ripple(at, TITLE_TIMES, false);
    expect(calm?.radius).toBeLessThan(full?.radius ?? 0);
    expect(calm?.ink).toBeLessThan(full?.ink ?? 0);
  });
});

describe('the plotter', () => {
  const glints = range(0, Math.ceil(SETTLED_FRAMES / frameOf(GLINT.every)) + 1).map((n) => {
    const start = frameOf(GLINT.firstAfter + n * GLINT.every);
    return [start, start + frameOf(GLINT.duration)] as const;
  });

  it('draws one wireframe at a time, erasing each before the next and the last before the intro replays', () => {
    PLOTS.forEach(({ plot, done, erase }, i) => {
      expect(plot).toBeLessThan(done);
      expect(done).toBeLessThan(erase);
      const next = PLOTS[i + 1]?.plot ?? SETTLED_FRAMES;
      expect(erase + ERASE_FRAMES).toBeLessThanOrEqual(next);
    });
  });

  it('finishes each drawing well clear of the logo glints, so the corner and the logo take turns', () => {
    const clearance = frameOf(0.4);
    for (const { done } of PLOTS) {
      for (const [start, end] of glints) expect(done < start - clearance || done > end + clearance).toBe(true);
    }
  });

  it('climbs the revision from A, a letter per finished drawing', () => {
    expect(revisionAt(0)).toEqual({ count: 0, since: null });
    PLOTS.forEach(({ done }, i) => {
      expect(revisionAt(done - 1).count).toBe(i);
      expect(revisionAt(done)).toEqual({ count: i + 1, since: 0 });
    });
    expect(revisionAt(SETTLED_FRAMES - 1).count).toBe(PLOTS.length);
  });

  it('starts and ends the loop on a clean sheet and repeats seamlessly', () => {
    expect(plotterAt(0)).toBeNull();
    expect(plotterAt(SETTLED_FRAMES - 1)).toBeNull();
    for (const frame of range(0, SETTLED_FRAMES).filter((f) => f % 7 === 0)) {
      expect(plotterAt(frame + SETTLED_FRAMES)).toEqual(plotterAt(frame));
      expect(revisionAt(frame + SETTLED_FRAMES)).toEqual(revisionAt(frame));
    }
  });

  it('plots, holds and erases each drawing in turn', () => {
    const { plot, done, erase } = PLOTS[0] as (typeof PLOTS)[number];
    expect(plotterAt(plot)).toEqual({ drawing: 0, phase: 'plot', at: 0, of: done - plot });
    expect(plotterAt(done)).toMatchObject({ drawing: 0, phase: 'hold', at: 0 });
    expect(plotterAt(erase)).toMatchObject({ drawing: 0, phase: 'erase', at: 0, of: ERASE_FRAMES });
    expect(plotterAt(erase + ERASE_FRAMES)).toBeNull();
  });

  it('erases in flat ramp steps rather than fading', () => {
    const inks = range(0, ERASE_FRAMES).map(eraseInk);
    expect(isNonIncreasing(inks)).toBe(true);
    expect(inks.every(Number.isInteger)).toBe(true);
    expect(inks[0]).toBe(INK.mid);
  });

  it('passes the scan line once a loop while a drawing rests, between glints, and never under reduced motion', () => {
    const passing = range(0, SETTLED_FRAMES).filter((frame) => scanProgress(frame, false) !== null);
    expect(passing).toHaveLength(SCAN.frames);
    expect(passing.every((frame) => plotterAt(frame)?.phase === 'hold')).toBe(true);
    for (const [start, end] of glints) expect(passing.some((frame) => frame >= start && frame < end)).toBe(false);
    expect(range(0, SETTLED_FRAMES).some((frame) => scanProgress(frame, true) !== null)).toBe(false);
  });
});
