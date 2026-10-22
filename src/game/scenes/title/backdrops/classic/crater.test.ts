import { describe, expect, it } from 'vitest';
import { CRATER_CENTER, CRATER_FRAMES, CRATER_SIZE, coreMask, crownMask, paintCrater } from './crater';

describe('crater', () => {
  it('rings the molten core with the metal crown without overlapping it', () => {
    const core = coreMask();
    const crown = crownMask(0);
    expect(core.has(CRATER_CENTER.x, CRATER_CENTER.y)).toBe(true);
    expect(crown.has(CRATER_CENTER.x, CRATER_CENTER.y)).toBe(false);
    expect(crown.intersect(core).count()).toBe(0);
    expect(crown.count()).toBeGreaterThan(core.count());
  });

  it('throws its long streak up to the right and down to the left', () => {
    const crown = crownMask(0);
    const quadrant = (right: boolean, up: boolean): number => {
      let count = 0;
      for (let y = 0; y < CRATER_SIZE.height; y++) {
        for (let x = 0; x < CRATER_SIZE.width; x++) {
          const far = Math.abs(y - CRATER_CENTER.y) > 70;
          if (far && x > CRATER_CENTER.x === right && y < CRATER_CENTER.y === up && crown.has(x, y)) count++;
        }
      }
      return count;
    };
    expect(quadrant(true, true)).toBeGreaterThan(50);
    expect(quadrant(false, false)).toBeGreaterThan(50);
    expect(quadrant(false, true)).toBe(0);
  });

  it('wobbles: frames differ, but only slightly', () => {
    const counts = Array.from({ length: CRATER_FRAMES }, (_, frame) => crownMask(frame).count());
    expect(new Set(counts).size).toBeGreaterThan(1);
    const spread = Math.max(...counts) - Math.min(...counts);
    expect(spread / Math.min(...counts)).toBeLessThan(0.1);
  });

  it('paints a hot centre, a dark scorched rim and an outlined crown', () => {
    const bitmap = paintCrater(0);
    const centre = bitmap.get(CRATER_CENTER.x - 3, CRATER_CENTER.y - 3);
    expect(centre && centre.r + centre.g).toBeGreaterThan(400);
    expect(bitmap.isOpaque(0, 0)).toBe(false);
  });
});
