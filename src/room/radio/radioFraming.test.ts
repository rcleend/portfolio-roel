import { MathUtils, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Viewpoint } from '../camera/cameraPath';
import { boxCorners } from '../camera/framing';
import { projectToPage } from '../camera/pageProjection';
import { radioLayout } from './device/deckLayout';
import { DISC_RADIUS, discSlots } from './discLayout';
import { RADIO_FIXTURE, RADIO_VIEWPORTS } from './radioFixtures';
import { lampTruck, RADIO_PITCH_DEGREES, radioDirection, radioViewpoint, slotRing } from './radioFraming';
import { openLidCorners } from './radioModel';

type Viewport = (typeof RADIO_VIEWPORTS)[number];

function frame(viewport: Viewport, count = 5) {
  const insets = { top: 0, left: 0, right: viewport.right, bottom: viewport.bottom };
  const slots = discSlots(count, viewport.width / viewport.height);
  return { slots, insets, pose: radioViewpoint(RADIO_FIXTURE, slots, viewport, insets) };
}

function ndc(points: Vector3[], pose: Viewpoint, viewport: Viewport) {
  return projectToPage(points, pose, viewport).map(({ x, y }) => ({
    x: (x / viewport.width) * 2 - 1,
    y: 1 - (y / viewport.height) * 2,
  }));
}

/** What the table pins at each viewport: lens, distance, truck, radio centre, disc sizes, rocker and LCD. */
function measure(viewport: Viewport) {
  const { slots, pose } = frame(viewport);
  const centre = RADIO_FIXTURE.bodyBounds.getCenter(new Vector3());
  const [middle] = projectToPage([centre], pose, viewport);
  const diameters = slots.map((slot) => {
    const xs = projectToPage(slotRing(slot, DISC_RADIUS), pose, viewport).map((p) => p.x);
    return Math.max(...xs) - Math.min(...xs);
  });
  const { keys } = radioLayout(['a'], null, slots, pose, viewport, 1);
  const lcd = projectToPage(
    [new Vector3(0.9862, 1.0529, -1.8884), new Vector3(1.0436, 1.0692, -1.8921)],
    pose,
    viewport,
  );
  return {
    fov: pose.fov,
    distance: pose.position.distanceTo(pose.target),
    truck: pose.truck,
    centre: ((middle?.x ?? 0) / viewport.width) * 100,
    disc: [Math.min(...diameters), Math.max(...diameters)],
    rocker: [keys['play-pause'].width, keys['play-pause'].height + keys.stop.height],
    lcd: [Math.abs((lcd[1]?.x ?? 0) - (lcd[0]?.x ?? 0)), Math.abs((lcd[1]?.y ?? 0) - (lcd[0]?.y ?? 0))],
  };
}

describe('radioViewpoint', () => {
  it('looks along the radio facing reversed, pitched 24° down, with no yaw or roll', () => {
    const direction = radioDirection(RADIO_FIXTURE.facing);
    const pitch = MathUtils.degToRad(RADIO_PITCH_DEGREES);
    expect(direction.x).toBe(0);
    expect(direction.y).toBeCloseTo(-Math.sin(pitch), 12);
    expect(direction.z).toBeCloseTo(-Math.cos(pitch), 12);
    for (const viewport of RADIO_VIEWPORTS) {
      const { pose } = frame(viewport);
      const forward = pose.target.clone().sub(pose.position).normalize();
      expect(forward.distanceTo(direction)).toBeLessThan(1e-9);
    }
  });

  it.each(RADIO_VIEWPORTS)(
    'keeps the radio, the open lid and every slot in the free region at $width × $height',
    (viewport) => {
      const { slots, insets, pose } = frame(viewport);
      const body = RADIO_FIXTURE.bodyBounds;
      const portrait = viewport.width / viewport.height < 0.9;
      const subject = portrait
        ? boxCorners(new Vector3(0.93, 1.02, body.min.z), new Vector3(1.245, body.max.y, body.max.z))
        : boxCorners(body.min, body.max);
      const right = 1 - (insets.right / viewport.width) * 2;
      const bottom = -1 + (insets.bottom / viewport.height) * 2;
      // The truck shifts everything left by at most its own amount; nothing leaves the frame.
      for (const point of ndc(
        [...subject, ...openLidCorners(), ...slots.flatMap((slot) => slotRing(slot))],
        pose,
        viewport,
      )) {
        expect(point.x).toBeGreaterThanOrEqual(-1);
        expect(point.x).toBeLessThanOrEqual(right + 1e-9);
        expect(point.y).toBeGreaterThanOrEqual(bottom - 1e-9);
        expect(point.y).toBeLessThanOrEqual(1);
      }
    },
  );

  it.each(RADIO_VIEWPORTS)(
    'keeps the lava lamp beyond the left edge, trucking no more than needed, at $width × $height',
    (viewport) => {
      const { pose } = frame(viewport);
      const lamp = boxCorners(RADIO_FIXTURE.lampBounds.min, RADIO_FIXTURE.lampBounds.max);
      for (const corner of ndc(lamp, pose, viewport)) expect(corner.x).toBeLessThanOrEqual(-1.04 + 1e-6);
      if (pose.truck > 0) {
        // A truck is exactly enough: one corner sits on the band's edge.
        expect(Math.max(...ndc(lamp, pose, viewport).map((corner) => corner.x))).toBeCloseTo(-1.04, 6);
      }
      const direction = radioDirection(RADIO_FIXTURE.facing);
      expect(lampTruck(pose.position, direction, pose.fov, viewport.width / viewport.height, lamp)).toBeLessThan(1e-9);
    },
  );

  it.each(RADIO_VIEWPORTS)('stands within 1.25 m of its target or widens to 50° at $width × $height', (viewport) => {
    const { pose } = frame(viewport);
    expect(pose.position.distanceTo(pose.target) <= 1.25 + 1e-9 || pose.fov === 50).toBe(true);
    expect(pose.fov).toBeGreaterThanOrEqual(30);
  });

  // Measured with the shipped geometry (docs/ROOM.md › The CD player): ±3 px, ±1°.
  it.each(RADIO_VIEWPORTS)('frames $width × $height as pinned', (viewport) => {
    const key = `${viewport.width}x${viewport.height}`;
    const actual = measure(viewport);
    const pinned = PINNED[key];
    if (!pinned) throw new Error(`No pinned frame for ${key}`);
    expect(Math.abs(actual.fov - pinned.fov)).toBeLessThanOrEqual(1);
    expect(Math.abs(actual.distance - pinned.distance)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(actual.truck - pinned.truck)).toBeLessThanOrEqual(0.003);
    expect(Math.abs(actual.centre - pinned.centre)).toBeLessThanOrEqual(1);
    for (const field of ['disc', 'rocker', 'lcd'] as const) {
      actual[field].forEach((value, i) => {
        expect(Math.abs(value - (pinned[field][i] ?? 0))).toBeLessThanOrEqual(3);
      });
    }
  });
});

/**
 * The radio view's frames with five discs (docs/ROOM.md › The CD player): lens (°), eye-to-target (m), the truck
 * that clears the lamp (m), the radio's centre (% of the width), disc diameters, the rocker (both halves) and the
 * LCD, in CSS px.
 */
const PINNED: Record<
  string,
  { fov: number; distance: number; truck: number; centre: number; disc: number[]; rocker: number[]; lcd: number[] }
> = {
  '2560x1440': {
    fov: 30,
    distance: 0.983,
    truck: 0,
    centre: 43.7,
    disc: [336, 349],
    rocker: [73, 119],
    lcd: [165, 47],
  },
  '3440x1440': {
    fov: 30,
    distance: 0.983,
    truck: 0.17,
    centre: 33.2,
    disc: [331, 358],
    rocker: [74, 119],
    lcd: [163, 47],
  },
  '1920x1080': { fov: 30, distance: 0.983, truck: 0, centre: 43.7, disc: [252, 261], rocker: [54, 89], lcd: [124, 35] },
  '1440x900': { fov: 30, distance: 0.983, truck: 0, centre: 43, disc: [210, 218], rocker: [45, 75], lcd: [103, 29] },
  '1366x768': { fov: 30, distance: 0.983, truck: 0, centre: 43.7, disc: [179, 186], rocker: [38, 63], lcd: [88, 25] },
  '1280x720': { fov: 30, distance: 0.983, truck: 0, centre: 43.7, disc: [168, 174], rocker: [36, 59], lcd: [82, 23] },
  '1024x768': { fov: 30, distance: 1.165, truck: 0, centre: 42.6, disc: [150, 154], rocker: [33, 53], lcd: [74, 21] },
  '820x1180': { fov: 33, distance: 1.213, truck: 0, centre: 37.1, disc: [196, 206], rocker: [42, 66], lcd: [95, 26] },
  '768x1024': { fov: 33, distance: 1.223, truck: 0, centre: 38.1, disc: [169, 177], rocker: [35, 58], lcd: [82, 22] },
  '844x390': { fov: 30, distance: 0.983, truck: 0.064, centre: 36.6, disc: [90, 95], rocker: [20, 33], lcd: [44, 13] },
  '667x375': { fov: 30, distance: 0.983, truck: 0, centre: 39.7, disc: [88, 90], rocker: [19, 31], lcd: [43, 12] },
  '390x844': { fov: 35, distance: 1.245, truck: 0, centre: 32.2, disc: [128, 135], rocker: [27, 44], lcd: [62, 17] },
  '375x667': { fov: 34, distance: 1.23, truck: 0, centre: 34.7, disc: [106, 111], rocker: [23, 36], lcd: [51, 14] },
  '360x640': { fov: 34, distance: 1.235, truck: 0, centre: 34.8, disc: [101, 106], rocker: [21, 34], lcd: [49, 14] },
};
