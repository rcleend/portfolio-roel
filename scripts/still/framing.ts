/**
 * The TV view's framing model for the startup still (docs/ROOM.md › Startup): the set's bounds and the game's
 * picture on the glass as the room measures them (tv/tvFixtures.ts), the picture's outline cut down to the points
 * that are ever the outermost in any camera of the family, which is all the framing asks of it.
 */
import type { Vector3 } from 'three';
import { type Point, type StillFraming, stillCamera } from '../../src/app/startup/still/camera';
import { TV_SPEC } from '../../src/room/gen/roomSpec';
import { tvFixture } from '../../src/room/tv/tvFixtures';

export function stillFraming(): StillFraming {
  const { framing } = tvFixture();
  const bounds: [Point, Point] = [TV_SPEC.bounds.min, TV_SPEC.bounds.max];
  const picture = framing.picture.map((point: Vector3) => point.toArray() as Point);
  const full: StillFraming = { bounds, picture };
  // Every window from a narrow phone's to a very wide one's, with and without the touch pad's strips.
  const outermost = new Set<number>();
  for (let height = 300; height <= 1500; height += 150)
    for (let aspect = 0.35; aspect <= 3.6; aspect += 0.05) {
      const width = Math.round(height * aspect);
      for (const insets of [
        { left: 0, right: 0, bottom: 0 },
        width < height ? { left: 0, right: 0, bottom: 228 } : { left: 138, right: 174, bottom: 0 },
      ]) {
        if (width - insets.left - insets.right < 100) continue;
        const camera = stillCamera(full, width, height, insets);
        const placed = picture.map((point) => camera.project(point));
        for (const axis of [0, 1])
          for (const sign of [-1, 1]) {
            let best = 0;
            placed.forEach((p, i) => {
              if ((p[axis] as number) * sign > ((placed[best] as number[])[axis] as number) * sign) best = i;
            });
            outermost.add(best);
          }
      }
    }
  return { bounds, picture: [...outermost].sort((a, b) => a - b).map((i) => picture[i] as Point) };
}
