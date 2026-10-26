import { Box3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Viewpoint } from '../camera/cameraPath';
import { type GlassPlane, insetPlane } from './glassPlane';
import { pcViewpoint } from './pcFraming';
import { screenPlacement } from './screenPlacement';

const RIM: GlassPlane = { minX: -1.518, maxX: -1.162, minY: 0.929, maxY: 1.213, z: -1.679 };
/** pc-base.glb's CRT shell around it. */
const SHELL = new Box3(new Vector3(-1.57, 0.785, -2.086), new Vector3(-1.11, 1.268, -1.654));
const PICTURE = insetPlane(RIM, 0.01);
const DESKTOP = { width: 1440, height: 900 };
const AT_DESKTOP = pcViewpoint(
  { facing: new Vector3(0, 0, 1), rim: RIM, shellBounds: SHELL },
  DESKTOP.width / DESKTOP.height,
);

describe('screenPlacement', () => {
  it('covers the picture where the straight-on camera sees it', () => {
    const { rect, radius, skew } = screenPlacement(PICTURE, 0.006, AT_DESKTOP, DESKTOP, 1);
    // Glass 926 × 739 at (257, 65) minus the 10 mm (26 CSS px) tube border on every side.
    expect(Math.abs(rect.left - 283)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.top - 91)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.width - 874)).toBeLessThanOrEqual(1);
    expect(Math.abs(rect.height - 687)).toBeLessThanOrEqual(1);
    expect(radius).toBeCloseTo((0.006 / 0.336) * rect.width, 6);
    expect(skew).toBeLessThan(1e-6);
  });

  it.each([1, 1.5, 2, 3])('puts every edge on a device pixel at a device pixel ratio of %s', (ratio) => {
    const { rect } = screenPlacement(PICTURE, 0.006, AT_DESKTOP, DESKTOP, ratio);
    for (const edge of [rect.left, rect.top, rect.left + rect.width, rect.top + rect.height]) {
      expect(Math.abs(edge * ratio - Math.round(edge * ratio))).toBeLessThan(1e-9);
    }
  });

  it('moves each edge by less than half a device pixel when snapping', () => {
    const exact = screenPlacement(PICTURE, 0.006, AT_DESKTOP, DESKTOP, 1e6).rect;
    const snapped = screenPlacement(PICTURE, 0.006, AT_DESKTOP, DESKTOP, 2).rect;
    expect(Math.abs(snapped.left - exact.left)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(snapped.top - exact.top)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(snapped.left + snapped.width - (exact.left + exact.width))).toBeLessThanOrEqual(0.25);
    expect(Math.abs(snapped.top + snapped.height - (exact.top + exact.height))).toBeLessThanOrEqual(0.25);
  });

  it('reports skew when the camera does not look straight at the glass', () => {
    const turned: Viewpoint = {
      ...AT_DESKTOP,
      target: AT_DESKTOP.target.clone().add(new Vector3(0.2, 0.1, 0)),
    };
    expect(screenPlacement(PICTURE, 0.006, turned, DESKTOP, 1).skew).toBeGreaterThan(0.5);
  });
});
