import { describe, expect, it } from 'vitest';
import { frames } from '@/engine/motion/progress';
import { ATTRACT_AFTER_SECONDS, TITLE_TIMES } from '../../titleTimeline';
import type { PuffPose } from './billow';
import { STAGE } from './layout';
import { layoutPlume, type PlumePuff, posePlumePuff } from './plume';
import { timeAtLift } from './timeline';

const PLUME = layoutPlume();
const { settled } = TITLE_TIMES;
/** The settled title's every frame, plus half a second for a button press just before the attract loop replays. */
const LOOP = Array.from(
  { length: Math.round((ATTRACT_AFTER_SECONDS + 0.5) * 60) },
  (_, frame) => settled + frames(frame),
);

function poseAt(puff: PlumePuff, time: number): PuffPose | null {
  const pose = { x: 0, y: 0, radius: 0 };
  return posePlumePuff(puff, time, TITLE_TIMES, pose) ? pose : null;
}

describe('exhaust plume', () => {
  it('forms right behind the rocket, from the pad to above the top of the screen', () => {
    for (const puff of PLUME) {
      const passed = timeAtLift(puff.lift, TITLE_TIMES);
      expect(poseAt(puff, passed - frames(1))).toBeNull();
      expect(poseAt(puff, passed)?.radius).toBe(1);
      expect(passed).toBeLessThanOrEqual(TITLE_TIMES.flashStart);
    }
    const rows = PLUME.map((puff) => puff.y);
    expect(Math.max(...rows)).toBeGreaterThan(STAGE.horizon - 20);
    expect(Math.min(...rows)).toBeLessThan(0);
  });

  it('never jumps in the idle loop: each puff moves and widens a pixel at a time, at most', () => {
    for (const puff of PLUME) {
      let previous = poseAt(puff, settled);
      for (const time of LOOP) {
        const pose = poseAt(puff, time);
        if (!pose || !previous) throw new Error('the whole column has formed by the time the title settles');
        expect(Math.abs(pose.x - previous.x)).toBeLessThanOrEqual(1);
        expect(pose.radius - previous.radius).toBeGreaterThanOrEqual(0);
        expect(pose.radius - previous.radius).toBeLessThanOrEqual(1);
        previous = pose;
      }
    }
  });

  it('shears into a lazy S: low down the wind blows one way, high up the other', () => {
    const drift = (puff: PlumePuff): number =>
      (poseAt(puff, settled + ATTRACT_AFTER_SECONDS)?.x ?? 0) - (poseAt(puff, settled)?.x ?? 0);
    const low = PLUME.filter((puff) => puff.y > 110 && puff.y < 160);
    const high = PLUME.filter((puff) => puff.y < 40);
    expect(low.every((puff) => drift(puff) > 0)).toBe(true);
    expect(high.every((puff) => drift(puff) < 0)).toBe(true);
  });

  it('catches the sun above the terminator and stands in the Earth’s shadow below it', () => {
    for (const puff of PLUME) expect(puff.sunlit).toBe(puff.y < STAGE.terminator);
  });
});
