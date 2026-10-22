import { describe, expect, it } from 'vitest';
import { DRAWINGS } from './drawings';
import { PenPath } from './pen';
import { penPose, penSpeed } from './plotter';
import { PLOTS } from './timeline';

const plots = DRAWINGS.map((drawing, i) => {
  const { plot, done } = PLOTS[i] as (typeof PLOTS)[number];
  return { name: drawing.name, path: new PenPath(drawing.strokes), frames: done - plot };
});

describe('the plotter', () => {
  it('has a window on the dope sheet for every drawing', () => {
    expect(PLOTS).toHaveLength(DRAWINGS.length);
  });

  it.each(plots)('inks the $name from its first pixel to its last within its window', ({ path, frames }) => {
    const poses = Array.from({ length: frames + 1 }, (_, at) => penPose(path, at, frames));
    expect(poses[0]).toMatchObject({ inked: 1, down: true, x: path.x(0), y: path.y(0) });
    expect(poses.every((pose, i) => i === 0 || pose.inked >= (poses[i - 1]?.inked ?? 0))).toBe(true);
    expect(poses.at(-1)?.inked).toBe(path.length);
    expect(poses.at(-2)?.inked).toBeGreaterThan(path.length * 0.95);
  });

  it.each(plots)(
    'holds the pen on the newest ink, and lifts it only between strokes of the $name',
    ({ path, frames }) => {
      const strokeEnds = new Set(path.strokes.map((_, i) => path.strokes.slice(0, i + 1).flat().length));
      for (let at = 0; at < frames; at++) {
        const pose = penPose(path, at, frames);
        if (pose.down) expect([pose.x, pose.y]).toEqual([path.x(pose.inked - 1), path.y(pose.inked - 1)]);
        else expect(strokeEnds.has(pose.inked)).toBe(true);
      }
    },
  );

  it('runs every drawing at much the same speed, as one machine would', () => {
    const speeds = plots.map(({ path, frames }) => penSpeed(path, frames));
    const mean = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
    for (const speed of speeds) expect(Math.abs(speed - mean) / mean).toBeLessThan(0.15);
    expect(mean).toBeLessThan(3);
  });
});
