import { describe, expect, it } from 'vitest';
import { createWaxPose, LAVA, poseWax, WAX, WAX_TRIANGLES, waxIndices, waxPositions } from './lavaLamp';

const height = LAVA.top - LAVA.bottom;
const glassAt = (y: number): number => LAVA.radius[0] + (LAVA.radius[1] - LAVA.radius[0]) * (y / height);

describe("the lava lamp's wax", () => {
  it('is the same wax at the same time', () => {
    const [a, b] = [createWaxPose(), createWaxPose()];
    poseWax(123.4, a);
    poseWax(7, b);
    poseWax(123.4, b);
    expect(b).toEqual(a);
  });

  it('stays inside the bottle, at every moment of an hour', () => {
    const pose = createWaxPose();
    for (let seconds = 0; seconds < 3600; seconds += 0.73) {
      poseWax(seconds, pose);
      for (let k = 0; k < WAX.rings; k++) {
        const [y, radius] = [pose.y[k] as number, pose.radius[k] as number];
        expect(Number.isFinite(radius) && radius >= 0).toBe(true);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(height);
        expect(radius + Math.hypot(pose.cx[k] as number, pose.cz[k] as number)).toBeLessThan(glassAt(y));
        // Rings never cross: the lathe's triangles keep facing outwards.
        if (k > 0) expect(y).toBeGreaterThanOrEqual(pose.y[k - 1] as number);
      }
    }
  });

  it('moves slowly: no ring grows or shrinks faster than 4 cm a second (a neck closing), tips aside', () => {
    const [a, b] = [createWaxPose(), createWaxPose()];
    let fastest = 0;
    for (let seconds = 0; seconds < 600; seconds += 1.37) {
      poseWax(seconds, a);
      poseWax(seconds + 1 / 60, b);
      for (let k = 0; k < WAX.rings; k++)
        if ((a.radius[k] as number) > 0.004 && (b.radius[k] as number) > 0.004)
          fastest = Math.max(fastest, Math.abs((b.radius[k] as number) - (a.radius[k] as number)) * 60);
    }
    expect(fastest).toBeLessThan(0.04);
  });

  it('always has wax in the pool and, most of the time, a blob clear of it', () => {
    const pose = createWaxPose();
    let apart = 0;
    for (let seconds = 0; seconds < 600; seconds++) {
      poseWax(seconds, pose);
      expect(pose.radius[0]).toBeGreaterThan(0.02);
      let gaps = 0;
      for (let k = 1; k < WAX.rings; k++)
        if ((pose.radius[k] as number) > 0 && (pose.radius[k - 1] as number) === 0) gaps++;
      if (gaps > 0) apart++;
    }
    expect(apart).toBeGreaterThan(300);
  });

  it('is a lathe of a few hundred vertices', () => {
    const pose = createWaxPose();
    poseWax(95, pose);
    const positions = new Float32Array(WAX.rings * WAX.segments * 3);
    waxPositions(pose, positions);
    const indices = waxIndices();
    expect(indices).toHaveLength(WAX_TRIANGLES * 3);
    expect(Math.max(...indices)).toBe(WAX.rings * WAX.segments - 1);
    expect(WAX_TRIANGLES).toBeLessThanOrEqual(1200);
    for (let i = 0; i < positions.length; i += 3) {
      expect(positions[i + 1]).toBeGreaterThanOrEqual(LAVA.bottom - 1e-6);
      expect(positions[i + 1]).toBeLessThanOrEqual(LAVA.top + 1e-6);
      expect(Math.hypot((positions[i] as number) - LAVA.x, (positions[i + 2] as number) - LAVA.z)).toBeLessThan(0.065);
    }
  });
});
