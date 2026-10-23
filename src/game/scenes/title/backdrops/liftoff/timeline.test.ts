import { describe, expect, it } from 'vitest';
import { frames } from '@/engine/motion/progress';
import { GLINT, TITLE_TIMES } from '../../titleTimeline';
import { STAGE } from './layout';
import { ROCKET_SIZE } from './rocket';
import {
  BOOM_SECONDS,
  bloomRadius,
  boomProgress,
  CLIMB,
  exhaustWarmth,
  flameLength,
  flareHalfWidth,
  floodReach,
  ignitionLight,
  jetLength,
  LIFTOFF_AT,
  padRumble,
  rocketLift,
  rocketSpeed,
  rocketVisible,
  timeAtLift,
} from './timeline';

const { slideStart, flashStart, settled } = TITLE_TIMES;
/** Every frame of the intro, up to a second into the settled title. */
const INTRO = Array.from({ length: Math.round((settled + 1) * 60) }, (_, frame) => frames(frame));

describe('ignition', () => {
  it('hits hardest on the first frame and burns down in steps before the rocket lifts', () => {
    const light = INTRO.map((time) => ignitionLight(time, false));
    expect(light[0]).toBe(Math.max(...light));
    expect(light.every((level, i) => i === 0 || level <= (light[i - 1] ?? level))).toBe(true);
    expect(ignitionLight(LIFTOFF_AT, false)).toBe(0);
    expect(bloomRadius(frames(1), false)).toBeGreaterThan(bloomRadius(0, false));
    expect(bloomRadius(LIFTOFF_AT, false)).toBeLessThanOrEqual(5);
  });

  it('floods out from the pad over two frames, then fills the sky', () => {
    expect(floodReach(0)).toBeLessThan(floodReach(frames(1)));
    expect(floodReach(frames(2))).toBe(Number.POSITIVE_INFINITY);
  });

  it('catches with a flare and fire out of the trench that the smoke soon swallows', () => {
    expect(flareHalfWidth(0, false)).toBeGreaterThan(STAGE.width / 2);
    expect(flareHalfWidth(frames(10), false)).toBe(0);
    expect(jetLength(0, false)).toBeGreaterThan(0);
    expect(jetLength(LIFTOFF_AT, false)).toBe(0);
    expect(flameLength(frames(8), TITLE_TIMES)).toBeGreaterThan(flameLength(0, TITLE_TIMES));
  });

  it('only warms the sky a step under reduced motion: no white, no flare, no flash', () => {
    for (const time of INTRO) {
      expect(ignitionLight(time, true)).toBeLessThanOrEqual(1);
      expect(flareHalfWidth(time, true)).toBe(0);
      expect(bloomRadius(time, true)).toBeLessThanOrEqual(9);
    }
  });
});

describe('the climb', () => {
  it('holds on the pad through the opening hit, then creeps up during the anticipation', () => {
    expect(rocketLift(LIFTOFF_AT, TITLE_TIMES)).toBe(0);
    expect(rocketLift(0.6, TITLE_TIMES)).toBeLessThan(5);
    // Still under the logo's band when the words start to slide in.
    expect(rocketLift(slideStart, TITLE_TIMES)).toBeGreaterThan(20);
    expect(rocketLift(slideStart, TITLE_TIMES)).toBeLessThan(50);
  });

  it('accelerates all the way and clears the top of the screen as the flash hits', () => {
    const climb = INTRO.filter((time) => time > LIFTOFF_AT && time < flashStart);
    const speeds = climb.map((time) => rocketSpeed(time, TITLE_TIMES));
    expect(speeds.every((speed, i) => i === 0 || speed > (speeds[i - 1] ?? 0))).toBe(true);
    // On its last frame only the tail of the flame still shows, streaking off the top.
    const last = flashStart - frames(1);
    const nozzle = STAGE.pad.y - rocketLift(last, TITLE_TIMES);
    expect(nozzle).toBeLessThan(0);
    expect(nozzle + flameLength(last, TITLE_TIMES)).toBeGreaterThan(0);
    expect(rocketVisible(last, TITLE_TIMES)).toBe(true);
    expect(rocketVisible(flashStart, TITLE_TIMES)).toBe(false);
    expect(STAGE.pad.y - CLIMB + ROCKET_SIZE.height).toBeLessThan(0);
  });

  it('knows when it passed any height, so the plume can form right behind it', () => {
    for (const lift of [1, 30, 120, 230]) {
      expect(rocketLift(timeAtLift(lift, TITLE_TIMES), TITLE_TIMES)).toBeCloseTo(lift, 6);
    }
  });

  it('rumbles the pad by a pixel while the engine is close, and never under reduced motion', () => {
    const rumble = INTRO.map((time) => padRumble(time, TITLE_TIMES, false));
    expect(new Set(rumble)).toEqual(new Set([-1, 0, 1]));
    expect(padRumble(slideStart + 0.15, TITLE_TIMES, false)).toBe(0);
    expect(INTRO.every((time) => padRumble(time, TITLE_TIMES, true) === 0)).toBe(true);
  });

  it('lights nearby smoke like embers, cooling in steps with distance and with the ignition', () => {
    expect(exhaustWarmth(0, 0)).toBe(3);
    expect(exhaustWarmth(60, 0)).toBe(1);
    expect(exhaustWarmth(500, 0)).toBe(0);
    expect(exhaustWarmth(Number.POSITIVE_INFINITY, 4)).toBe(3);
  });
});

describe('sonic boom', () => {
  it('rings out as the title settles and is gone before the first glint', () => {
    expect(boomProgress(settled - frames(1), TITLE_TIMES, false)).toBeNull();
    expect(boomProgress(settled, TITLE_TIMES, false)).toBe(0);
    expect(boomProgress(settled + BOOM_SECONDS, TITLE_TIMES, false)).toBeNull();
    expect(BOOM_SECONDS).toBeLessThanOrEqual(GLINT.firstAfter);
  });

  it('stays silent under reduced motion', () => {
    expect(boomProgress(settled + frames(5), TITLE_TIMES, true)).toBeNull();
  });
});
