import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { Box3, Matrix4, PerspectiveCamera, Vector2, Vector3, Vector4 } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { ALBUMS } from '../../content/radio/albums';
import { CameraRig, FLIGHT_MS, type FramingInsets, NO_INSETS } from '../camera/CameraRig';
import type { ScreenFade } from '../camera/ScreenFade';
import type { PcFramingModel } from '../pc/pcFraming';
import { MAX_DISCS } from '../radio/discLayout';
import { RADIO_FIXTURE, RADIO_VIEWPORTS } from '../radio/radioFixtures';
import { radioPoseSolver } from '../radio/radioFraming';
import { type FrameScheduler, RenderLoop } from '../stage/RenderLoop';
import { tvFixture } from '../tv/tvFixtures';
import type { TvFramingModel } from '../tv/tvFraming';
import { posterTier } from './posterTier';
import { anyInView, decorBoxes } from './posterVisibility';

/*
 * The visibility rule against the shipped assets and the shipped framing: every resting pose the camera can take and
 * the first stretch of the TV-to-room flight, with the polygons of public/room/posters.glb clipped exactly against the
 * frustum as the oracle. The rule may keep the node drawn where nothing shows (its boxes are conservative); it must
 * never hide it where a polygon does.
 */

const ROOM = join(process.cwd(), 'public/room');
/** The decoration's layout, the stage's input (one push pin per cork piece). */
const layout = JSON.parse(readFileSync(join(process.cwd(), 'tools/room/assets/posters/layout.json'), 'utf8')) as {
  readonly items: readonly { readonly cork?: boolean }[];
};

/** pc-base.glb's glass and shell (room revision 6), as `locatePc` finds them. */
const PC: PcFramingModel = {
  facing: new Vector3(0, 0, 1),
  rim: { minX: -1.518, maxX: -1.162, minY: 0.929, maxY: 1.213, z: -1.679 },
  shellBounds: new Box3(new Vector3(-1.57, 0.785, -2.086), new Vector3(-1.11, 1.268, -1.654)),
};

/** The sweep's aspects (spec 6.2): phone portrait to a 32:9 ultrawide. */
const ASPECTS = [
  ['9:19.5', 390, 845],
  ['0.62', 620, 1000],
  ['3:4', 768, 1024],
  ['1:1', 1000, 1000],
  ['4:3', 1024, 768],
  ['16:10', 1440, 900],
  ['16:9', 1920, 1080],
  ['21:9', 2560, 1080],
  ['32:9', 3440, 1080],
] as const;

/** Without the app's controls, and with them along the bottom (portrait) or the right (landscape phones). */
const INSET_CASES: readonly FramingInsets[] = [NO_INSETS, { ...NO_INSETS, bottom: 64 }, { ...NO_INSETS, right: 64 }];

/** The room's camera planes (RoomStage). */
const NEAR = 0.03;
const FAR = 60;

/** The window the upload plan relies on (spec 5.5.3): no piece of decoration in the flight's frame before it. */
const FIRST_PIECE_MS = 400;

/** RoomStage's drawing buffer: the device's ratio, at most 2, within 3M pixels. */
const MAX_PIXEL_RATIO = 2;
const MAX_DRAWING_BUFFER_PIXELS = 3_000_000;
/** The ratios screens report, from a desktop at 1 to a phone at 3. */
const DEVICE_PIXEL_RATIOS = [1, 1.25, 1.5, 2, 2.625, 3] as const;
/**
 * The push pins' heads are each drawn from a five-texel cell of one lit dome (posters.py PIN_CELL), about 1.6 texels
 * per centimetre; every printed piece, tape and the corkboard is at three or more.
 */
const ART_MIN_TEXELS_PER_CM = 2.5;
/** Each pin's head: an octagonal top and its eight-sided skirt (posters.py pins_mesh). */
const PIN_TRIANGLES = 16;
/**
 * How far the camera may blow the art up, in drawing-buffer pixels per texel along a side, on any screen up to 32:9
 * with the tier its size gets. At rest in the room view the atlas carries 1.1 × the on-screen density (measured 0.95,
 * at 3:4). The flights were meant to stay within 2: the TV ↔ room flights do (1.9, at 32:9), but the flights to
 * and from the computer and the radio pass 1.25-1.6 m from the pieces over the desk and reach 5.0 (3:4, the radio
 * to the computer) for about a quarter of a second at their fastest. A 2K atlas 84 % full cannot carry 2.5 × those
 * pieces' density, so this bounds what ships; the same bound covers the computer view at 32:9, the one resting view
 * outside the composition that shows a piece.
 */
const MAX_MAGNIFICATION = { resting: 1, house: 2, device: 5 } as const;
/** Frames sampled per flight: every 5 % of it. */
const FLIGHT_STEPS = 20;
const VIEWS = ['tv', 'room', 'pc', 'radio'] as const;

interface Viewport {
  readonly width: number;
  readonly height: number;
}

interface Pose {
  readonly label: string;
  readonly camera: PerspectiveCamera;
}

let triangles: Float32Array;
/** The cards' triangles (the printed art; the skirts are a soft shadow at 2 px/cm) and their atlas coordinates. */
let cardTriangles: Float32Array;
let cardUvs: Float32Array;
/** The 2K atlas's size in texels; the 1K tier halves it each way, under the same coordinates. */
let atlas: readonly [number, number];
let boxes: Box3[];
let tv: TvFramingModel;

async function readAsset(io: NodeIO, name: string) {
  return io.read(join(ROOM, name));
}

beforeAll(async () => {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

  const posters = await readAsset(io, 'posters.glb');
  const node = posters
    .getRoot()
    .listNodes()
    .find((candidate) => candidate.getExtras().posters === 1);
  if (!node) throw new Error('posters.glb has no posters node');
  boxes = decorBoxes(node.getExtras());
  atlas = node.getExtras().atlas as [number, number];
  // Every triangle the node draws, in the room's space (the node's parent is the room's root).
  const corners: number[] = [];
  const cardCorners: number[] = [];
  const cardTexels: number[] = [];
  const world = new Matrix4().fromArray(node.getWorldMatrix());
  const vertex = new Vector3();
  const element: number[] = [];
  for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
    const position = primitive.getAttribute('POSITION');
    const uv = primitive.getAttribute('TEXCOORD_0');
    if (!position || !uv) continue;
    const isCards = primitive.getMaterial()?.getName() === 'posters_cards';
    const indices = primitive.getIndices();
    const count = indices ? indices.getCount() : position.getCount();
    for (let i = 0; i < count; i++) {
      const index = indices ? indices.getScalar(i) : i;
      position.getElement(index, element);
      vertex.fromArray(element).applyMatrix4(world);
      corners.push(vertex.x, vertex.y, vertex.z);
      if (!isCards) continue;
      cardCorners.push(vertex.x, vertex.y, vertex.z);
      // getElement denormalizes the quantized coordinates to 0…1.
      uv.getElement(index, element);
      cardTexels.push(element[0] ?? 0, element[1] ?? 0);
    }
  }
  triangles = Float32Array.from(corners);
  cardTriangles = Float32Array.from(cardCorners);
  cardUvs = Float32Array.from(cardTexels);

  // The TV set as the room measures it: the bounds of the whole set, the picture on its glass, facing the room (−x).
  tv = tvFixture(await readAsset(io, 'tv-high.glb')).framing;
});

/** Frames on demand: `run(ms)` runs what was requested at that time. */
class Frames implements FrameScheduler {
  #callbacks: ((now: number) => void)[] = [];
  request(callback: (now: number) => void): number {
    this.#callbacks.push(callback);
    return this.#callbacks.length;
  }
  cancel(): void {
    this.#callbacks = [];
  }
  run(now: number): void {
    const due = this.#callbacks;
    this.#callbacks = [];
    for (const callback of due) callback(now);
  }
}

/** The shipped camera rig at `viewport` with `insets`, its radio framed for `discs` slots. */
function rigAt(viewport: Viewport, insets: FramingInsets, discs: number) {
  const frames = new Frames();
  const loop = new RenderLoop(() => undefined, frames);
  const camera = new PerspectiveCamera(40, viewport.width / viewport.height, NEAR, FAR);
  const motion = { matches: false } as MediaQueryList;
  const rig = new CameraRig(camera, loop, tv, PC, motion, { opacity: 0 } as unknown as ScreenFade);
  rig.resize({ ...viewport, pixelRatio: 1 });
  rig.setFramingInsets(insets);
  rig.setRadioFraming(radioPoseSolver(RADIO_FIXTURE, discs, insets));
  return { rig, camera, frames };
}

/** The camera resting at the TV, the computer and the radio. */
function restingPoses(viewport: Viewport, insets: FramingInsets, discs: number, label: string): Pose[] {
  const { rig, camera } = rigAt(viewport, insets, discs);
  return (['tv', 'pc', 'radio'] as const).map((view) => {
    rig.jumpTo(view);
    return { label: `${label} ${view}`, camera: camera.clone() };
  });
}

/**
 * Whether any posters triangle keeps a piece after clipping against the six frustum planes in clip space (−w ≤ x, y,
 * z ≤ w): the exact test the boxes approximate.
 */
function anyPolygonInView(camera: PerspectiveCamera): boolean {
  camera.updateMatrixWorld();
  const viewProjection = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const vertex = new Vector3();
  for (let t = 0; t < triangles.length; t += 9) {
    let polygon: Vector4[] = [];
    for (let k = 0; k < 9; k += 3) {
      vertex.fromArray(triangles, t + k);
      polygon.push(new Vector4(vertex.x, vertex.y, vertex.z, 1).applyMatrix4(viewProjection));
    }
    for (let axis = 0; axis < 3 && polygon.length > 0; axis++) {
      for (const sign of [1, -1]) {
        polygon = clipAgainst(polygon, axis, sign);
        if (polygon.length === 0) break;
      }
    }
    if (polygon.length >= 3) return true;
  }
  return false;
}

/** Card triangle `index`'s area in square metres and in texels of the 2K atlas. */
function cardAreas(index: number): { readonly worldArea: number; readonly texelArea: number } {
  const a = new Vector3().fromArray(cardTriangles, 9 * index);
  const ab = new Vector3().fromArray(cardTriangles, 9 * index + 3).sub(a);
  const ac = new Vector3().fromArray(cardTriangles, 9 * index + 6).sub(a);
  const uv = new Vector2().fromArray(cardUvs, 6 * index);
  const uvAb = new Vector2().fromArray(cardUvs, 6 * index + 2).sub(uv);
  const uvAc = new Vector2().fromArray(cardUvs, 6 * index + 4).sub(uv);
  const uvArea = Math.abs(uvAb.cross(uvAc)) / 2;
  return { worldArea: ab.cross(ac).length() / 2, texelArea: uvArea * atlas[0] * atlas[1] };
}

/** Whether a card triangle carries art: its 2K atlas density, in texels per centimetre, reaches the printed pieces'. */
function isArt(texelArea: number, worldArea: number): boolean {
  return Math.sqrt(texelArea / worldArea) / 100 >= ART_MIN_TEXELS_PER_CM;
}

/**
 * The cards' largest magnification in this pose: drawing-buffer pixels per texel of the 2K atlas, along a side, with
 * one buffer pixel per CSS pixel of `viewport`. A plane at distance d from the eye covers fx·fy·d / z³ buffer pixels
 * per square metre where its view depth is z (fx, fy the focal lengths in pixels), so over a triangle clipped to the
 * frustum the largest value is at its nearest vertex, whose depth is its clip-space w.
 */
function cardMagnification(camera: PerspectiveCamera, viewport: Viewport): number {
  camera.updateMatrixWorld();
  const projection = camera.projectionMatrix;
  const fx = ((projection.elements[0] ?? 0) * viewport.width) / 2;
  const fy = ((projection.elements[5] ?? 0) * viewport.height) / 2;
  const corners = [new Vector3(), new Vector3(), new Vector3()] as const;
  const [a, b, c] = corners;
  const normal = new Vector3();
  let worst = 0;
  for (let index = 0; index < cardTriangles.length / 9; index++) {
    const { worldArea, texelArea } = cardAreas(index);
    if (worldArea === 0 || texelArea === 0 || !isArt(texelArea, worldArea)) continue;
    corners.forEach((corner, k) => {
      corner.fromArray(cardTriangles, 9 * index + 3 * k).applyMatrix4(camera.matrixWorldInverse);
    });
    // The eye is the view space's origin: the plane's distance from it.
    const distance = Math.abs(normal.subVectors(b, a).cross(c.clone().sub(a)).normalize().dot(a));
    let polygon = corners.map((corner) => new Vector4(corner.x, corner.y, corner.z, 1).applyMatrix4(projection));
    for (let axis = 0; axis < 3 && polygon.length > 0; axis++) {
      for (const sign of [1, -1]) polygon = clipAgainst(polygon, axis, sign);
    }
    for (const { w } of polygon) {
      if (w > 0) worst = Math.max(worst, ((fx * fy * distance) / w ** 3) * (worldArea / texelArea));
    }
  }
  return Math.sqrt(worst);
}

/**
 * The most buffer pixels per CSS pixel and texel any screen of `viewport` puts on the art, with the tier it gets by
 * its size: the 1K tier doubles the magnification of the 2K. (A visitor demoted to the 1K by Save-Data, little memory
 * or a software GPU gets that softer art on purpose.)
 */
function worstScreenScale({ width, height }: Viewport): number {
  return Math.max(
    ...DEVICE_PIXEL_RATIOS.map((devicePixelRatio) => {
      const pixelRatio = Math.min(
        devicePixelRatio,
        MAX_PIXEL_RATIO,
        Math.sqrt(MAX_DRAWING_BUFFER_PIXELS / (width * height)),
      );
      const facts = {
        width,
        height,
        pixelRatio,
        deviceMemory: undefined,
        saveData: false,
        slowLink: false,
        softwareGpu: false,
      };
      return pixelRatio * (posterTier(facts) === '2k' ? 1 : 2);
    }),
  );
}

/** Sutherland-Hodgman against the plane sign·v[axis] ≤ w. */
function clipAgainst(polygon: readonly Vector4[], axis: number, sign: number): Vector4[] {
  const distance = (v: Vector4) => v.w - sign * v.getComponent(axis);
  const out: Vector4[] = [];
  let previous = polygon.at(-1);
  if (!previous) return out;
  for (const current of polygon) {
    const dp = distance(previous);
    const dc = distance(current);
    if (dp >= 0 !== dc >= 0) out.push(previous.clone().lerp(current, dp / (dp - dc)));
    if (dc >= 0) out.push(current);
    previous = current;
  }
  return out;
}

describe('posters.glb and its boxes', () => {
  it('keeps every vertex inside an item box, so a box that misses the frustum hides nothing', () => {
    const vertex = new Vector3();
    const tolerance = 1e-4;
    const grown = boxes.map((box) => box.clone().expandByScalar(tolerance));
    let outside = 0;
    for (let i = 0; i < triangles.length; i += 3) {
      vertex.fromArray(triangles, i);
      if (!grown.some((box) => box.containsPoint(vertex))) outside++;
    }
    expect(triangles.length).toBeGreaterThan(0);
    expect(outside).toBe(0);
  });
});

describe('the visibility rule at rest', () => {
  it('never hides the node where a polygon is in the frame', () => {
    const poses: Pose[] = [];
    for (const [name, width, height] of ASPECTS) {
      for (const insets of INSET_CASES) {
        for (let discs = 1; discs <= MAX_DISCS; discs++) {
          poses.push(...restingPoses({ width, height }, insets, discs, `${name} ${JSON.stringify(insets)} ${discs}`));
        }
      }
    }
    for (const { width, height, bottom, right } of RADIO_VIEWPORTS) {
      for (let discs = 1; discs <= MAX_DISCS; discs++) {
        const insets = { ...NO_INSETS, bottom, right };
        poses.push(...restingPoses({ width, height }, insets, discs, `${width}×${height} ${discs}`));
      }
    }
    const missed = poses.filter(({ camera }) => anyPolygonInView(camera) && !anyInView(boxes, camera));
    expect(missed.map(({ label }) => label)).toEqual([]);
    // The sweep reaches poses where a piece does show (32:9 at the computer, many discs at the radio), so it tests
    // the rule rather than an empty frame.
    expect(poses.some(({ camera }) => anyPolygonInView(camera))).toBe(true);
  });

  it('hides the node in every resting pose of the shipped composition up to 21:9', () => {
    // The composition was checked with five discs; more albums move the radio's framing, so re-check it then.
    expect(ALBUMS.length).toBe(5);
    const shown: string[] = [];
    const viewports: [string, Viewport, FramingInsets][] = [];
    for (const [name, width, height] of ASPECTS) {
      if (width / height > 21 / 9) continue;
      for (const insets of INSET_CASES)
        viewports.push([`${name} ${JSON.stringify(insets)}`, { width, height }, insets]);
    }
    for (const { width, height, bottom, right } of RADIO_VIEWPORTS) {
      if (width / height > 21 / 9) continue;
      viewports.push([`${width}×${height}`, { width, height }, { ...NO_INSETS, bottom, right }]);
    }
    for (const [label, viewport, insets] of viewports) {
      for (const pose of restingPoses(viewport, insets, ALBUMS.length, label)) {
        if (anyInView(boxes, pose.camera)) shown.push(pose.label);
      }
    }
    expect(shown).toEqual([]);
  });
});

describe('the TV-to-room flight', () => {
  it.each(ASPECTS)(
    `brings the first piece of decoration into the frame at ${FIRST_PIECE_MS} ms or later at %s`,
    (_name, width, height) => {
      const { rig, camera, frames } = rigAt({ width, height }, NO_INSETS, ALBUMS.length);
      rig.jumpTo('tv');
      rig.goTo('room', () => undefined);
      // The first frame with a piece in it; the room view at the end of the flight always has some.
      let first = Number.POSITIVE_INFINITY;
      for (let ms = 0; ms <= FLIGHT_MS && first > ms; ms += 5) {
        frames.run(ms);
        if (anyPolygonInView(camera)) first = ms;
      }
      expect(first).toBeLessThanOrEqual(FLIGHT_MS);
      expect(first).toBeGreaterThanOrEqual(FIRST_PIECE_MS);
    },
  );
});

describe('the art in flight', () => {
  it('tells the pins from the art by their density alone', () => {
    let pins = 0;
    for (let index = 0; index < cardTriangles.length / 9; index++) {
      const { worldArea, texelArea } = cardAreas(index);
      if (!isArt(texelArea, worldArea)) pins++;
    }
    const corkPieces = layout.items.filter((item) => item.cork).length;
    expect(corkPieces).toBeGreaterThan(0);
    expect(pins).toBe(corkPieces * PIN_TRIANGLES);
  });

  it('magnifies the art at most 1× at rest in the room view, 2× in the TV ↔ room flights, 5× in the others', () => {
    const worst = { resting: 0, house: 0, device: 0, deviceAt: '' };
    for (const [name, width, height] of ASPECTS) {
      const viewport = { width, height };
      const scale = worstScreenScale(viewport);
      for (const from of VIEWS) {
        for (const to of VIEWS) {
          if (from === to) continue;
          const house = (from === 'tv' && to === 'room') || (from === 'room' && to === 'tv');
          const { rig, camera, frames } = rigAt(viewport, NO_INSETS, ALBUMS.length);
          rig.jumpTo(from);
          rig.goTo(to, () => undefined);
          for (let step = 0; step <= FLIGHT_STEPS; step++) {
            const ms = (FLIGHT_MS * step) / FLIGHT_STEPS;
            frames.run(ms);
            const magnification = cardMagnification(camera, viewport) * scale;
            if (step === FLIGHT_STEPS && to === 'room') worst.resting = Math.max(worst.resting, magnification);
            if (house) worst.house = Math.max(worst.house, magnification);
            else if (magnification > worst.device) {
              Object.assign(worst, { device: magnification, deviceAt: `${name} ${from}→${to} at ${ms} ms` });
            }
          }
        }
      }
    }
    console.info(
      `posters' magnification: room view ${worst.resting.toFixed(2)}, TV ↔ room ${worst.house.toFixed(2)}, ` +
        `other flights ${worst.device.toFixed(2)} (${worst.deviceAt})`,
    );
    expect(worst.resting).toBeLessThanOrEqual(MAX_MAGNIFICATION.resting);
    expect(worst.house).toBeLessThanOrEqual(MAX_MAGNIFICATION.house);
    expect(worst.device).toBeLessThanOrEqual(MAX_MAGNIFICATION.device);
  });
});
