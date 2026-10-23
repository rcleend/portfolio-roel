import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Viewpoint } from '../camera/cameraPath';
import { type GlassPlane, insetPlane, planeCorners } from './glassPlane';
import { pcViewpoint } from './pcFraming';
import { PC_PICTURE_BORDER } from './pcModel';

/** pc-base.glb's glass (room revision 6), as pcModel finds it. */
const RIM: GlassPlane = { minX: -1.518, maxX: -1.162, minY: 0.929, maxY: 1.213, z: -1.679 };
const MODEL = { facing: new Vector3(0, 0, 1), rim: RIM };

function cameraAt(viewpoint: Viewpoint, aspect: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(viewpoint.fov, aspect, 0.03, 60);
  camera.position.copy(viewpoint.position);
  camera.lookAt(viewpoint.target);
  camera.updateMatrixWorld();
  return camera;
}

/** A plane's rectangle on a `width × height` CSS-pixel page, seen from `viewpoint`. */
function onPage(plane: GlassPlane, viewpoint: Viewpoint, width: number, height: number) {
  const camera = cameraAt(viewpoint, width / height);
  const [topLeft, topRight, bottomLeft, bottomRight] = planeCorners(plane).map((corner) => {
    const ndc = corner.project(camera);
    return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
  }) as [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  return {
    topLeft,
    topRight,
    bottomLeft,
    bottomRight,
    width: topRight.x - topLeft.x,
    height: bottomLeft.y - topLeft.y,
  };
}

describe('pcViewpoint', () => {
  it.each([0.4, 0.46, 0.75, 1, 1.6, 2.2, 3.6])('looks exactly against the glass at aspect %s', (aspect) => {
    const pose = pcViewpoint(MODEL, aspect);
    const direction = pose.target.clone().sub(pose.position).normalize();
    // No pitch and no yaw at all, not merely a small one.
    expect(Math.abs(direction.x)).toBe(0);
    expect(Math.abs(direction.y)).toBe(0);
    expect(direction.z).toBeCloseTo(-1, 12);
  });

  it('follows the asset if the monitor ever turns', () => {
    const facing = new Vector3(0.3, 0, 1).normalize();
    const pose = pcViewpoint({ facing, rim: RIM }, 1.6);
    const direction = pose.target.clone().sub(pose.position).normalize();
    expect(direction.distanceTo(facing.clone().negate())).toBeLessThan(1e-12);
  });

  it.each([0.4, 0.75, 1.6, 3.6])('sees the glass as an axis-aligned rectangle at aspect %s', (aspect) => {
    const height = 1000;
    const glass = onPage(RIM, pcViewpoint(MODEL, aspect), aspect * height, height);
    expect(Math.abs(glass.topLeft.x - glass.bottomLeft.x)).toBeLessThan(1e-6);
    expect(Math.abs(glass.topRight.x - glass.bottomRight.x)).toBeLessThan(1e-6);
    expect(Math.abs(glass.topLeft.y - glass.topRight.y)).toBeLessThan(1e-6);
    expect(Math.abs(glass.bottomLeft.y - glass.bottomRight.y)).toBeLessThan(1e-6);
  });

  it.each([0.4, 0.46, 0.75, 1, 1.6, 3.6])('keeps the glass and its bezel band in frame at aspect %s', (aspect) => {
    const height = 1000;
    const width = aspect * height;
    // The glass plus 18 mm of shell at the sides and top and the 30 mm chin.
    const band: GlassPlane = {
      minX: RIM.minX - 0.018,
      maxX: RIM.maxX + 0.018,
      minY: RIM.minY - 0.03,
      maxY: RIM.maxY + 0.018,
      z: RIM.z,
    };
    const framed = onPage(band, pcViewpoint(MODEL, aspect), width, height);
    // A 2 % margin each side, never more than a pixel off…
    expect(framed.topLeft.x).toBeGreaterThanOrEqual(width * 0.02 - 1);
    expect(framed.topRight.x).toBeLessThanOrEqual(width * 0.98 + 1);
    expect(framed.topLeft.y).toBeGreaterThanOrEqual(height * 0.02 - 1);
    expect(framed.bottomLeft.y).toBeLessThanOrEqual(height * 0.98 + 1);
    // …and it fills the frame along one axis.
    const fillsWidth = Math.abs(framed.width - width * 0.96) < 1;
    const fillsHeight = Math.abs(framed.height - height * 0.96) < 1;
    expect(fillsWidth || fillsHeight).toBe(true);
  });

  it.each([0.4, 0.46, 0.75, 1, 1.6, 3.6])('keeps the eye within reach of the desk at aspect %s', (aspect) => {
    const pose = pcViewpoint(MODEL, aspect);
    expect(pose.position.distanceTo(pose.target) <= 0.72 || pose.fov === 70).toBe(true);
  });

  // The judge's measured table (SPEC §3.5), pinned to ±1 px / ±1°.
  it.each([
    { width: 1440, height: 900, fov: 30, distance: 0.645, glass: [926, 739, 257, 65], picture: [874, 687] },
    { width: 1920, height: 1080, fov: 30, distance: 0.645, glass: [1112, 887], picture: [1049, 824] },
    { width: 2560, height: 1440, fov: 30, distance: 0.645, glass: [1482, 1183], picture: [1399, 1099] },
    { width: 1366, height: 768, fov: 30, distance: 0.645, glass: [791, 631], picture: [746, 586] },
    { width: 1280, height: 720, fov: 30, distance: 0.645, glass: [741, 591], picture: [700, 550] },
    { width: 768, height: 1024, fov: 42, distance: 0.709, glass: [670, 534], picture: [632, 497] },
    { width: 820, height: 1180, fov: 45, distance: 0.709, glass: [715, 570], picture: [675, 530] },
    { width: 390, height: 844, fov: 64, distance: 0.71, glass: [340, 271], picture: [321, 252] },
    { width: 375, height: 667, fov: 54, distance: 0.71 },
  ])('frames $width × $height as measured', ({ width, height, fov, distance, glass, picture }) => {
    const pose = pcViewpoint(MODEL, width / height);
    expect(Math.abs(pose.fov - fov)).toBeLessThanOrEqual(1);
    expect(pose.position.distanceTo(pose.target)).toBeCloseTo(distance, 2);
    const glassOnPage = onPage(RIM, pose, width, height);
    const pictureOnPage = onPage(insetPlane(RIM, PC_PICTURE_BORDER), pose, width, height);
    if (glass) {
      const [w, h, left, top] = glass;
      expect(Math.abs(glassOnPage.width - (w as number))).toBeLessThanOrEqual(1);
      expect(Math.abs(glassOnPage.height - (h as number))).toBeLessThanOrEqual(1);
      if (left !== undefined) expect(Math.abs(glassOnPage.topLeft.x - left)).toBeLessThanOrEqual(1);
      if (top !== undefined) expect(Math.abs(glassOnPage.topLeft.y - top)).toBeLessThanOrEqual(1);
    }
    if (picture) {
      expect(Math.abs(pictureOnPage.width - (picture[0] as number))).toBeLessThanOrEqual(1);
      expect(Math.abs(pictureOnPage.height - (picture[1] as number))).toBeLessThanOrEqual(1);
    }
  });
});
