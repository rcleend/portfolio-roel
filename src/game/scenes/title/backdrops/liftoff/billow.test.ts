import { describe, expect, it } from 'vitest';
import { inflate, intersects, rect } from '@/engine/math/Rect';
import { frames } from '@/engine/motion/progress';
import { ATTRACT_AFTER_SECONDS, TITLE_TIMES } from '../../titleTimeline';
import { BILLOW_AT_REST, type BillowPuff, layoutBillow, type PuffPose, poseBillowPuff } from './billow';
import { KEEP_CLEAR, STAGE } from './layout';

const BILLOW = layoutBillow();

function poseAt(puff: BillowPuff, time: number): PuffPose | null {
  const pose = { x: 0, y: 0, radius: 0 };
  return poseBillowPuff(puff, time, pose) ? pose : null;
}

describe('launch-pad billow', () => {
  it('bursts out of the flame trench on the opening hit and spreads along the horizon', () => {
    expect(BILLOW.filter((puff) => poseAt(puff, frames(3)) !== null).length).toBeGreaterThan(0);
    for (const puff of BILLOW) {
      expect(Math.abs(puff.fromX - STAGE.pad.x)).toBeLessThan(30);
      expect(puff.start).toBeLessThan(TITLE_TIMES.slideStart);
    }
    const reach = BILLOW.map((puff) => puff.toX);
    expect(Math.min(...reach)).toBeLessThan(20);
    expect(Math.max(...reach)).toBeGreaterThan(STAGE.width - 20);
  });

  it('swells past its size on the way and settles back to it', () => {
    // Big enough that a swell of a few per cent still rounds to a whole pixel.
    for (const puff of BILLOW.filter((candidate) => Math.round(candidate.radius) >= 7)) {
      const radii = Array.from({ length: 90 }, (_, frame) => poseAt(puff, puff.start + frames(frame))?.radius ?? 0);
      expect(Math.max(...radii)).toBeGreaterThan(Math.round(puff.radius));
      expect(radii.at(-1)).toBe(Math.round(puff.radius));
    }
  });

  it('is at rest before the title settles, and then never moves again', () => {
    expect(BILLOW_AT_REST).toBeLessThanOrEqual(TITLE_TIMES.settled);
    for (const puff of BILLOW) {
      expect(puff.start + puff.travel).toBeLessThanOrEqual(BILLOW_AT_REST);
      expect(poseAt(puff, TITLE_TIMES.settled + ATTRACT_AFTER_SECONDS)).toEqual(poseAt(puff, TITLE_TIMES.settled));
    }
  });

  it('rests below the prompt and above the copyright, halos included', () => {
    for (const puff of BILLOW) {
      const pose = poseAt(puff, BILLOW_AT_REST);
      if (!pose) throw new Error('every puff is out by the time the bank rests');
      const disc = inflate(rect(pose.x, pose.y, 1, 1), pose.radius + 1);
      expect(intersects(disc, KEEP_CLEAR.prompt), `puff at (${pose.x}, ${pose.y})`).toBe(false);
      expect(intersects(disc, KEEP_CLEAR.copyright), `puff at (${pose.x}, ${pose.y})`).toBe(false);
    }
  });
});
