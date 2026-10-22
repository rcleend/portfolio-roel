import { describe, expect, it } from 'vitest';
import { TITLE_LAYOUT } from '../../layout';
import { TITLE_TIMES } from '../../titleTimeline';
import { buildTrace, type Pixel } from './series';
import {
  barRiseStarts,
  beamAt,
  breachSpike,
  frameAt,
  glassBoost,
  growthCues,
  headIndex,
  IMPACT_BOOST,
  openingSpike,
  rasterEdge,
  rasterReach,
  risingHeight,
  scaleCount,
  stripLit,
  stripOf,
  TIP_REST,
  tipRise,
} from './timeline';

const cues = growthCues(TITLE_TIMES);
const trace = buildTrace();
const shape = { elbow: trace.elbow, last: trace.pixels.length - 1 };
const { impact } = TITLE_LAYOUT;
/** Every frame of the intro, up to the settled title. */
const INTRO = Array.from({ length: cues.settled + 1 }, (_, frame) => frame);

describe('growth cues', () => {
  it("follow the scene's beats, in whole frames", () => {
    expect(cues).toEqual({ draw: 18, turn: 52, rocket: 54, breach: 72, settled: 87 });
  });

  it('land on whole frames whatever the float drift in scene time', () => {
    let time = 0;
    for (let frame = 0; frame < cues.breach; frame++) time += 1 / 60;
    expect(frameAt(time)).toBe(cues.breach);
    expect(frameAt(TITLE_TIMES.slideEnd - 1e-9)).toBe(cues.breach);
  });
});

describe('the opening hit', () => {
  it('flares hardest on its first frames, then retracts in steps and is gone before the line starts', () => {
    const spikes = INTRO.map((frame) => openingSpike(frame, false));
    const first = spikes[0];
    expect(first?.core).toBe(Math.max(...spikes.map((spike) => spike?.core ?? 0)));
    const reaches = spikes.flatMap((spike) => (spike ? [spike.up] : []));
    expect(reaches.slice(1)).toEqual([...reaches.slice(1)].sort((a, b) => b - a));
    expect(spikes.slice(cues.draw).every((spike) => spike === null)).toBe(true);
  });

  it('overdrives the whole tube on the impact frame, then opens it as a raster from the impact row', () => {
    expect(rasterReach(0, false)).toBe(Number.POSITIVE_INFINITY);
    expect(glassBoost(0, cues, false)).toBe(IMPACT_BOOST);
    expect(glassBoost(1, cues, false)).toBe(0);
    const opening = INTRO.slice(1, cues.draw).map((frame) => rasterReach(frame, false));
    expect(opening[0]).toBe(0);
    expect(opening).toEqual([...opening].sort((a, b) => a - b));
    expect(Math.max(...opening.filter(Number.isFinite))).toBeGreaterThanOrEqual(TITLE_LAYOUT.screen.height - impact.y);
    expect(rasterReach(cues.draw, false)).toBe(Number.POSITIVE_INFINITY);
    const edge = rasterEdge(3, false);
    expect(edge && edge.to - edge.from).toBeGreaterThan(0);
  });

  it("flies the beam spot from the impact point to the line's first pixel just as the line starts", () => {
    const stops = INTRO.map((frame) => beamAt(frame, impact, trace.pixels[0] as Pixel, false));
    const flying = stops.flatMap((stop, frame) => (stop ? [frame] : []));
    expect(flying.length).toBeGreaterThan(1);
    expect(flying[flying.length - 1]).toBe(cues.draw - 1);
    expect(stops[cues.draw - 1]).toEqual(trace.pixels[0]);
    expect(openingSpike((flying[0] ?? 0) - 1, false)).not.toBeNull();
    expect(openingSpike(flying[0] ?? 0, false)).toBeNull();
  });

  it('lights the grid strip by strip, outward from the impact row, all of it by the time the line starts', () => {
    const impactStrip = stripOf(impact.y);
    const firstLit = (strip: number): number => INTRO.findIndex((frame) => stripLit(strip, impactStrip, frame, false));
    const strips = Array.from({ length: 20 }, (_, strip) => strip);
    for (const strip of strips) {
      expect(firstLit(strip)).toBe(firstLit(impactStrip) + Math.abs(strip - impactStrip));
      expect(stripLit(strip, impactStrip, cues.draw, false)).toBe(true);
    }
    const stutters = strips.filter((strip) => !stripLit(strip, impactStrip, firstLit(strip) + 1, false));
    expect(stutters.length).toBeGreaterThan(0);
  });

  it('stays calm under reduced motion: no rays, no impact frame, no raster wipe and no stutter', () => {
    const impactStrip = stripOf(impact.y);
    for (const frame of INTRO) {
      expect(openingSpike(frame, true)?.up ?? 0).toBe(0);
      expect(beamAt(frame, impact, impact, true)).toBeNull();
      expect(rasterReach(frame, true)).toBe(Number.POSITIVE_INFINITY);
      expect(glassBoost(frame, cues, true)).toBeLessThanOrEqual(0);
      expect(breachSpike(frame, cues, true)).toBeNull();
    }
    const boosts = INTRO.map((frame) => glassBoost(frame, cues, true));
    expect(boosts).toEqual([...boosts].sort((a, b) => a - b));
    for (let strip = 0; strip < 20; strip++) {
      const lit = INTRO.map((frame) => stripLit(strip, impactStrip, frame, true));
      // Once on, a strip stays on: it never stutters.
      expect(lit.slice(lit.indexOf(true)).every(Boolean)).toBe(true);
    }
  });
});

describe('the line', () => {
  const heads = (reducedMotion: boolean): number[] =>
    INTRO.map((frame) => headIndex(frame, cues, shape, reducedMotion));

  it('starts at the y axis as the power-up ends and only ever moves forwards', () => {
    for (const reducedMotion of [false, true]) {
      const path = heads(reducedMotion);
      expect(path[cues.draw - 1]).toBe(-1);
      expect(path[cues.draw]).toBe(0);
      expect(path).toEqual([...path].sort((a, b) => a - b));
    }
  });

  it('crawls into the trough, holds at the turn, then rockets to break the ceiling exactly as the words lock', () => {
    const path = heads(false);
    expect(path[cues.turn]).toBe(shape.elbow);
    expect(path[cues.rocket]).toBe(shape.elbow);
    expect(path[cues.breach - 1]).toBeLessThan(shape.last);
    expect(path[cues.breach]).toBe(shape.last);
    // Slowing into the turn…
    const drawing = path.slice(cues.draw, cues.turn + 1);
    const late = drawing.slice(-6);
    expect((late[late.length - 1] ?? 0) - (late[0] ?? 0)).toBeLessThan((drawing[6] ?? 0) - (drawing[0] ?? 0));
    // …and accelerating up the blade.
    const rocket = path.slice(cues.rocket, cues.breach + 1);
    const steps = rocket.slice(1).map((index, i) => index - (rocket[i] ?? 0));
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
  });

  it('keeps the same beats under reduced motion', () => {
    const path = heads(true);
    expect(path[cues.turn]).toBe(shape.elbow);
    expect(path[cues.breach - 1]).toBeLessThan(shape.last);
    expect(path[cues.breach]).toBe(shape.last);
  });
});

describe('the scale and the bars', () => {
  it('counts the scale up to its top while the line draws, and holds it there', () => {
    const counts = INTRO.map((frame) => scaleCount(frame, cues, 100));
    expect(counts[cues.draw]).toBe(0);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[cues.turn]).toBe(100);
    expect(counts.every(Number.isInteger)).toBe(true);
  });

  it('springs a bar past its height and back, or straight up and slower under reduced motion', () => {
    const lively = INTRO.map((frame) => risingHeight(20, 30, frame, false));
    expect(lively[29]).toBe(0);
    expect(Math.max(...lively)).toBeGreaterThan(20);
    expect(lively[cues.settled]).toBe(20);
    const calm = INTRO.map((frame) => risingHeight(20, 30, frame, true));
    expect(Math.max(...calm)).toBe(20);
    expect(calm.indexOf(20)).toBeGreaterThan(lively.indexOf(20));
  });

  it('raises the bars as the head passes them, and those past the turn one per frame as it arrives', () => {
    const headX = (frame: number): number => trace.pixels[headIndex(frame, cues, shape, false)]?.x ?? 0;
    const centers = [40, 120, 200, 260, 272, 284];
    const starts = barRiseStarts(centers, headX, cues);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(starts.slice(0, 3).every((start, i) => headX(start) >= (centers[i] ?? 0))).toBe(true);
    expect(starts.slice(3)).toEqual([cues.turn - 2, cues.turn - 1, cues.turn]);
    expect(Math.max(...starts)).toBeLessThanOrEqual(cues.rocket);
  });
});

describe('the breach', () => {
  it('overloads the tube as the line breaks through, holds under the flash, then cools a level at a time', () => {
    const boosts = INTRO.concat(Array.from({ length: 30 }, (_, i) => cues.settled + 1 + i)).map((frame) =>
      glassBoost(frame, cues, false),
    );
    expect(boosts[cues.breach - 1]).toBe(0);
    expect(boosts.slice(cues.breach, cues.settled).every((boost) => boost === IMPACT_BOOST)).toBe(true);
    const cooling = boosts.slice(cues.settled);
    expect(cooling).toEqual([...cooling].sort((a, b) => b - a));
    expect(cooling[cooling.length - 1]).toBe(0);
    const steps = cooling.slice(1).map((boost, i) => (cooling[i] ?? 0) - boost);
    expect(Math.max(...steps)).toBe(1);
  });

  it('punches the head up through the ceiling, overshoots and comes to rest, or goes straight to rest', () => {
    const rises = INTRO.map((frame) => tipRise(frame, cues, false));
    expect(rises[cues.breach - 1]).toBe(0);
    const after = rises.slice(cues.breach);
    expect(Math.max(...after)).toBeGreaterThan(TIP_REST);
    expect(after[after.length - 1]).toBe(TIP_REST);
    expect(tipRise(cues.breach, cues, true)).toBe(TIP_REST);
  });

  it('lights the breach with a spike that burns out before the settled title', () => {
    expect(breachSpike(cues.breach - 1, cues, false)).toBeNull();
    expect(breachSpike(cues.breach, cues, false)).not.toBeNull();
    expect(breachSpike(cues.settled, cues, false)).toBeNull();
  });
});
