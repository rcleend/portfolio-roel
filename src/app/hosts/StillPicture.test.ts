import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TV_SPEC } from '@/room/gen/roomSpec';
import { tvFixture } from '@/room/tv/tvFixtures';
import { stillFraming } from '../../../scripts/still/framing';
import { type Point, stillCamera } from '../startup/still/camera';

/** `.still-picture`'s transform, as StillPicture.css writes it. */
function cssFit(): { drop: number; distance: number; tilt: number; stretch: number } {
  const css = readFileSync(new URL('./StillPicture.css', import.meta.url), 'utf8');
  const found =
    /transform: translateY\(([\d.]+)%\) perspective\(calc\(var\(--picture-height\) \* ([\d.]+)\)\) rotateX\(-([\d.]+)deg\) scaleY\(([\d.]+)\)/.exec(
      css,
    );
  if (!found) throw new Error('StillPicture.css no longer places the picture as this test reads it');
  const [drop, distance, tilt, stretch] = found.slice(1).map(Number) as [number, number, number, number];
  return { drop, distance, tilt, stretch };
}

/** Where the transform puts a point of the box, both in the box's own units. */
function placed(x: number, y: number): [number, number] {
  const { drop, distance, tilt, stretch } = cssFit();
  const angle = (tilt * Math.PI) / 180;
  // Heights are the unit; rotateX(-tilt) about the top edge sends the foot away from the eye.
  const scale = distance / (distance + stretch * y * Math.sin(angle));
  return [0.5 + (x - 0.5) * scale, drop / 100 + stretch * y * Math.cos(angle) * scale];
}

const { content } = tvFixture();
const framing = stillFraming();

/** Where the live camera puts points of the game's picture, in the units of the still's picture box. */
function liveIn(width: number, height: number): (a: number, b: number) => [number, number] {
  const { left, right, top, bottom, front, bulge } = TV_SPEC.glass;
  const camera = stillCamera(framing, width, height, { left: 0, right: 0, bottom: 0 });
  const [boxLeft, boxTop, boxWidth, boxHeight] = camera.picture;
  return (a, b) => {
    const u = content.minU + a * (content.maxU - content.minU);
    const v = content.minV + b * (content.maxV - content.minV);
    const [s, t] = [2 * u - 1, 2 * v - 1];
    const world: Point = [
      front + bulge[0] * s * s + bulge[1] * t * t,
      top - (top - bottom) * v,
      left + (right - left) * u,
    ];
    const [x, y] = camera.project(world);
    return [(x - boxLeft) / boxWidth, (y - boxTop) / boxHeight];
  };
}

describe('the flat picture on the startup still', () => {
  const corners = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const;

  it('has its corners where the live tube has them, within a thousandth of the box', () => {
    for (const [width, height] of [
      [1440, 900],
      [1920, 1080],
      [1000, 950],
    ] as const) {
      const live = liveIn(width, height);
      for (const [a, b] of corners) {
        const [x, y] = placed(a, b);
        const [liveX, liveY] = live(a, b);
        expect(Math.abs(x - liveX)).toBeLessThan(0.001);
        expect(Math.abs(y - liveY)).toBeLessThan(0.001);
      }
    }
  });

  it('has its middle within a quarter of a percent of the live one, and every point within the glass’s bow', () => {
    const live = liveIn(1440, 900);
    expect(Math.abs(placed(0.5, 0.5)[1] - live(0.5, 0.5)[1])).toBeLessThan(0.0025);
    for (let a = 0; a <= 1; a += 0.125)
      for (let b = 0; b <= 1; b += 0.125) {
        const [x, y] = placed(a, b);
        const [liveX, liveY] = live(a, b);
        expect(Math.hypot(x - liveX, y - liveY)).toBeLessThan(0.006);
      }
  });

  it('is within a percent of the box where the camera stands closer (a short window)', () => {
    const live = liveIn(1200, 500);
    for (const [a, b] of corners) {
      const [x, y] = placed(a, b);
      const [liveX, liveY] = live(a, b);
      expect(Math.hypot(x - liveX, y - liveY)).toBeLessThan(0.01);
    }
  });
});
