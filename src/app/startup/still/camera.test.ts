import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { projectedBounds, regionFromInsets } from '@/room/camera/framing';
import { TV_SPEC } from '@/room/gen/roomSpec';
import { tvFixture } from '@/room/tv/tvFixtures';
import { tvViewpoint } from '@/room/tv/tvFraming';
import { type Point, type StillFraming, stillCamera, unseen } from './camera';

const { framing } = tvFixture();
const model: StillFraming = {
  bounds: [TV_SPEC.bounds.min, TV_SPEC.bounds.max],
  picture: framing.picture.map((point) => point.toArray() as Point),
};
const UP = new Vector3(0, 1, 0);
/** Points about the set and off to its sides, at several depths. */
const PROBES: readonly Point[] = [
  [2.153, 0.486, -0.625],
  [2.657, 1.076, -0.015],
  [2.12, 0.457, -1.125],
  [2.31, 0.666, -0.84],
  [2.7, 2, 0.6],
];

/** The room's own camera for a viewport and the pad's insets, and where it puts `point` (CSS px). */
function live(width: number, height: number, insets: { left: number; right: number; bottom: number }) {
  const viewport = { width, height };
  const view = tvViewpoint(framing, viewport, regionFromInsets(viewport, { top: 0, ...insets }));
  const forward = view.target.clone().sub(view.position).normalize();
  const right = new Vector3().crossVectors(forward, UP).normalize();
  const up = new Vector3().crossVectors(right, forward);
  const tanY = Math.tan((view.fov * Math.PI) / 360);
  const project = (point: Point): [number, number] => {
    const rel = new Vector3(...point).sub(view.position);
    const depth = rel.dot(forward);
    return [
      (1 + rel.dot(right) / (depth * tanY * (width / height))) * (width / 2),
      (1 - rel.dot(up) / (depth * tanY)) * (height / 2),
    ];
  };
  const b = projectedBounds(framing.picture, view, UP, view.fov, width / height);
  const picture = [
    ((b.left + 1) / 2) * width,
    ((1 - b.top) / 2) * height,
    ((b.right - b.left) / 2) * width,
    ((b.top - b.bottom) / 2) * height,
  ];
  return { view, project, picture };
}

const NONE = { left: 0, right: 0, bottom: 0 };
const cases: [number, number, { left: number; right: number; bottom: number }][] = [];
for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
  [2560, 1080],
  [1280, 720],
  [1000, 950],
  [1200, 500],
  [500, 450],
  [700, 1000],
] as const)
  cases.push([width, height, NONE]);
// Touch screens: the pad's band under a portrait picture, its clusters beside a landscape one.
for (const [width, height] of [
  [768, 1024],
  [390, 844],
  [360, 640],
  [320, 568],
  [412, 915],
] as const)
  cases.push([width, height, { left: 0, right: 0, bottom: 228 }], [width, height, { left: 0, right: 0, bottom: 262 }]);
for (const [width, height] of [
  [1024, 768],
  [844, 390],
  [667, 375],
] as const)
  cases.push(
    [width, height, { left: 138, right: 174, bottom: 0 }],
    [width, height, { left: 185, right: 174, bottom: 0 }],
  );
for (const height of [300, 420, 545, 700, 900, 1400])
  for (let aspect = 0.4; aspect <= 3.01; aspect += 0.1) {
    const width = Math.round(height * aspect);
    cases.push([width, height, NONE]);
    cases.push([
      width,
      height,
      width < height ? { left: 0, right: 0, bottom: 228 } : { left: 138, right: 174, bottom: 0 },
    ]);
  }

describe('the startup still’s camera', () => {
  it('faces the set as the room’s does', () => {
    expect(TV_SPEC.facing).toEqual([-1, 0, 0]);
  });

  it('places every point within a twentieth of a pixel of the room’s camera, at every framing', () => {
    let worst = 0;
    for (const [width, height, insets] of cases) {
      // Clusters wider than the window leave nothing to frame into; the pad never does that to a real screen.
      if (width - insets.left - insets.right < 100) continue;
      const room = live(width, height, insets);
      const still = stillCamera(model, width, height, insets);
      expect(still.fov, `${width}×${height}`).toBe(room.view.fov);
      const errors = [
        ...PROBES.flatMap((point) => {
          const [a, b] = [still.project(point), room.project(point)];
          return [a[0] - b[0], a[1] - b[1]];
        }),
        ...still.picture.map((value, i) => value - (room.picture[i] as number)),
        ...unseen(still.eye).map((value, i) => (value - room.view.position.getComponent(i)) * 1000),
      ];
      const error = Math.max(...errors.map(Math.abs));
      expect(error, `${width}×${height} ${JSON.stringify(insets)}`).toBeLessThan(0.05);
      worst = Math.max(worst, error);
    }
    expect(cases.length).toBeGreaterThan(300);
    expect(worst).toBeLessThan(0.05);
  });
});
