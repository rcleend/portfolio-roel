import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Box3, MathUtils, Mesh, PlaneGeometry, Triangle, Vector2, Vector3 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Viewpoint } from '../camera/cameraPath';
import { boxCorners, type NdcRegion, projectedBounds, regionFromInsets } from '../camera/framing';
import type { UvRect } from './screenMapping';
import { tvFixture } from './tvFixtures';
import { pictureOutline, type TvFramingModel, tvViewpoint } from './tvFraming';

const UP = new Vector3(0, 1, 0);
/** The touch pad's strips (padInsets): a band along the bottom of a portrait phone, two clusters beside a landscape one. */
const PAD_BOTTOM = { top: 0, right: 0, bottom: 194, left: 0 };
const PAD_SIDES = { top: 0, right: 174, bottom: 0, left: 138 };
const NONE = { top: 0, right: 0, bottom: 0, left: 0 };

/** The shipped TV: its glass, its picture's content rect and what the camera frames. */
let glass: Mesh;
let content: UvRect;
let tv: TvFramingModel;

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  ({ glass, content, framing: tv } = tvFixture(await io.read(join(process.cwd(), 'public/room/tv-high.glb'))));
});

/** The picture's edge on the glass every 1/400 of each side, by brute force: the oracle for the traced outline. */
function sampledEdge(rect: UvRect): Vector3[] {
  const position = glass.geometry.getAttribute('position');
  const uv = glass.geometry.getAttribute('uv');
  const index = glass.geometry.getIndex();
  if (!index || !uv) throw new Error('The glass lost its index or UVs');
  const at = (u: number, v: number): Vector3 => {
    const point = new Vector3(u, v, 0);
    for (let i = 0; i < index.count; i += 3) {
      const corners = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      const [a, b, c] = corners.map((k) => new Vector3(uv.getX(k), uv.getY(k), 0)) as [Vector3, Vector3, Vector3];
      const weights = Triangle.getBarycoord(point, a, b, c, new Vector3());
      if (!weights || Math.min(weights.x, weights.y, weights.z) < -1e-9) continue;
      const [pa, pb, pc] = corners.map((k) => new Vector3().fromBufferAttribute(position, k));
      return (pa as Vector3)
        .multiplyScalar(weights.x)
        .addScaledVector(pb as Vector3, weights.y)
        .addScaledVector(pc as Vector3, weights.z)
        .applyMatrix4(glass.matrixWorld);
    }
    throw new Error(`(${u}, ${v}) is not on the glass`);
  };
  const samples: Vector3[] = [];
  for (let i = 0; i <= 400; i++) {
    const s = i / 400;
    const u = MathUtils.lerp(rect.minU, rect.maxU, s);
    const v = MathUtils.lerp(rect.minV, rect.maxV, s);
    samples.push(at(u, rect.minV), at(u, rect.maxV), at(rect.minU, v), at(rect.maxU, v));
  }
  return samples;
}

function framed(viewport: { width: number; height: number }, insets = NONE) {
  const region = regionFromInsets(viewport, insets);
  const pose = tvViewpoint(tv, viewport, region);
  const aspect = viewport.width / viewport.height;
  return {
    pose,
    region,
    picture: projectedBounds(tv.picture, pose, UP, pose.fov, aspect),
    set: projectedBounds(boxCorners(tv.bounds.min, tv.bounds.max), pose, UP, pose.fov, aspect),
  };
}

/** How far the eye stands back from the set's middle along its line of sight. */
function reach(pose: Viewpoint): number {
  const forward = pose.target.clone().sub(pose.position).normalize();
  return tv.bounds.getCenter(new Vector3()).sub(pose.position).dot(forward);
}

interface CameraViewFixture {
  readonly position: Vector3;
  readonly fov: number;
  readonly aspect: number;
}

const middle = (region: NdcRegion) => ({ x: (region.left + region.right) / 2, y: (region.bottom + region.top) / 2 });

/** How much of `region` the subject fills on the side that limits it. */
function fill(subject: NdcRegion, region: NdcRegion): number {
  return Math.max(
    (subject.right - subject.left) / (region.right - region.left),
    (subject.top - subject.bottom) / (region.top - region.bottom),
  );
}

describe('pictureOutline', () => {
  it('traces the corners of a picture on a flat glass', () => {
    const plane = new Mesh(new PlaneGeometry(2, 1, 3, 2));
    const outline = pictureOutline(plane, { minU: 0.25, minV: 0.2, maxU: 0.75, maxV: 0.6 });
    const box = new Box3().setFromPoints(outline);
    // PlaneGeometry puts v = 0 at the bottom: x runs −1…1 with u, y −0.5…0.5 with v.
    expect(box.min.x).toBeCloseTo(-0.5, 6);
    expect(box.max.x).toBeCloseTo(0.5, 6);
    expect(box.min.y).toBeCloseTo(-0.3, 6);
    expect(box.max.y).toBeCloseTo(0.1, 6);
  });

  it('refuses a picture that reaches beyond the glass', () => {
    const plane = new Mesh(new PlaneGeometry(1, 1));
    expect(() => pictureOutline(plane, { minU: -0.1, minV: 0, maxU: 1, maxV: 1 })).toThrow();
  });

  it('bounds the picture on the curved glass exactly, from near and from askew', () => {
    const samples = sampledEdge(content);
    const views: CameraViewFixture[] = [
      { position: new Vector3(1.6, 0.85, -0.32), fov: 40, aspect: 0.46 },
      { position: new Vector3(1.0, 1.1, 0.4), fov: 30, aspect: 1.6 },
      { position: new Vector3(1.9, 0.6, -0.9), fov: 60, aspect: 1 },
    ];
    for (const { position, fov, aspect } of views) {
      const pose = { position, target: new Vector3(2.17, 0.84, -0.32) };
      const traced = projectedBounds(tv.picture, pose, UP, fov, aspect);
      const sampled = projectedBounds(samples, pose, UP, fov, aspect);
      // Never inside the true edge, and no further out than float noise.
      expect(traced.left).toBeLessThanOrEqual(sampled.left + 1e-9);
      expect(traced.right).toBeGreaterThanOrEqual(sampled.right - 1e-9);
      expect(traced.bottom).toBeLessThanOrEqual(sampled.bottom + 1e-9);
      expect(traced.top).toBeGreaterThanOrEqual(sampled.top - 1e-9);
      expect(traced.left).toBeCloseTo(sampled.left, 4);
      expect(traced.right).toBeCloseTo(sampled.right, 4);
      expect(traced.bottom).toBeCloseTo(sampled.bottom, 4);
      expect(traced.top).toBeCloseTo(sampled.top, 4);
    }
  });
});

describe('tvViewpoint', () => {
  it.each([
    [1440, 900, NONE, 28],
    [1280, 800, NONE, 28],
    [1920, 1080, NONE, 28],
    [1366, 650, NONE, 28],
    [1024, 768, NONE, 28],
    [1024, 768, PAD_SIDES, 30],
    [1180, 820, PAD_SIDES, 28],
  ])('frames the whole set at %i × %i in landscape', (width, height, insets, fov) => {
    const { pose, region, set, picture } = framed({ width, height }, insets);
    expect(pose.fov).toBe(fov);
    // Centred in the region, 6 % of it free on the side that limits it.
    expect(middle(set).x).toBeCloseTo(middle(region).x, 4);
    expect(middle(set).y).toBeCloseTo(middle(region).y, 4);
    expect(fill(set, region)).toBeCloseTo(0.88, 6);
    expect(((picture.top - picture.bottom) / 2) * height).toBeGreaterThanOrEqual(300);
  });

  it.each([
    [390, 844],
    [360, 800],
    [430, 932],
    [375, 667],
    [768, 1024],
  ])('spans a portrait %i × %i edge to edge with the picture, above the touch pad', (width, height) => {
    const { pose, region, picture } = framed({ width, height }, PAD_BOTTOM);
    const px = (ndc: number) => ((ndc + 1) / 2) * width;
    // A hairline in from each edge: 0.1 % of the width, never a column cut off.
    expect(px(picture.left)).toBeCloseTo(0.001 * width, 6);
    expect(px(picture.right)).toBeCloseTo(0.999 * width, 6);
    expect(picture.left).toBeGreaterThan(-1);
    expect(picture.right).toBeLessThan(1);
    expect(picture.top).toBeLessThan(region.top);
    expect(picture.bottom).toBeGreaterThan(region.bottom);
    expect(middle(picture).y).toBeCloseTo(middle(region).y, 4);
    expect(reach(pose)).toBeLessThanOrEqual(1.75);
  });

  it('frames the picture of a phone on its side as tall as the screen, between the clusters', () => {
    const { pose, region, picture } = framed({ width: 844, height: 390 }, PAD_SIDES);
    expect(pose.fov).toBe(28);
    expect(((picture.bottom + 1) / 2) * 390).toBeCloseTo(0.001 * 390, 6);
    expect(((picture.top + 1) / 2) * 390).toBeCloseTo(0.999 * 390, 6);
    expect(picture.left).toBeGreaterThan(region.left);
    expect(picture.right).toBeLessThan(region.right);
    expect(middle(picture).x).toBeCloseTo(middle(region).x, 4);
  });

  it('leaves a fingertip of room beside the set of a phone on its side, to tap out of the TV', () => {
    // The pad's clusters are wider than the set beyond its picture, so the room shows above them; also on a notched
    // phone, whose safe areas (47 px) push the clusters in.
    for (const safe of [0, 47]) {
      const insets = { ...PAD_SIDES, left: PAD_SIDES.left + safe, right: PAD_SIDES.right + safe };
      const { set } = framed({ width: 844, height: 390 }, insets);
      const px = (ndc: number) => ((ndc + 1) / 2) * 844;
      expect(px(set.left) - safe).toBeGreaterThan(44);
      expect(844 - px(set.right) - safe).toBeGreaterThan(44);
    }
  });

  it('frames the picture wherever the whole set would show it under 300 px tall', () => {
    for (const [width, height, insets] of [
      [667, 375, PAD_SIDES],
      [1280, 500, NONE],
    ] as const) {
      const { region, picture } = framed({ width, height }, insets);
      expect(fill(picture, region)).toBeCloseTo(0.998, 6);
    }
    const tall = framed({ width: 1280, height: 560 });
    expect(fill(tall.set, tall.region)).toBeCloseTo(0.88, 6);
  });

  it('looks 4° down at the TV whatever it frames, and never stands further back than 1.75 m from the set', () => {
    for (const [width, height, insets] of [
      [1440, 900, NONE],
      [390, 844, PAD_BOTTOM],
      [844, 390, PAD_SIDES],
      [320, 900, NONE],
    ] as const) {
      const { pose } = framed({ width, height }, insets);
      const forward = pose.target.clone().sub(pose.position).normalize();
      expect(MathUtils.radToDeg(Math.asin(-forward.y))).toBeCloseTo(4, 6);
      expect(new Vector2(forward.x, forward.z).normalize().x).toBeCloseTo(1, 9);
      expect(reach(pose)).toBeLessThanOrEqual(1.75 + 1e-9);
      expect(pose.fov).toBeLessThanOrEqual(60);
    }
  });

  it('widens the lens on a portrait phone rather than backing into the desk', () => {
    const { pose } = framed({ width: 390, height: 844 }, PAD_BOTTOM);
    expect(pose.fov).toBeGreaterThan(28);
    expect(reach(pose)).toBeGreaterThan(1.7);
  });
});
