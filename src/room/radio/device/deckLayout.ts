import { Quaternion, Vector3 } from 'three';
import type { Viewpoint } from '../../camera/cameraPath';
import { type PageViewport, projectToPage } from '../../camera/pageProjection';
import type { ScreenRect } from '../../pc/PcMonitor';
import { DISC_RADIUS, type DiscSlot } from '../discLayout';
import type { DiscAnchor, RadioKey, RadioLayout } from '../RadioDeck';

/**
 * The CD player's working parts as measured by the close-up build (tools/room/radio-closeup.json, glTF metres), and
 * where its discs and keys land on the page when the camera rests at the radio, so the app's buttons, focus rings
 * and captions sit on them. Pure: a scratch camera at the settled pose.
 */
export const DECK = {
  /** Turntable top centre and the well floor's normal (the floor rises 5.7° towards the front). */
  seat: new Vector3(1.1115, 1.0448, -2.0404),
  seatNormal: new Vector3(0.0019, 0.995, -0.1001).normalize(),
  /** The magazine slit the discs rise through, across the back of the well floor. */
  slot: { z: -2.115, minX: 1.04, maxX: 1.18, floorY: 1.0332 },
  /** The transport keys' faces: the ▷II/■ rocker (split at its pivot) and ⏮ / ⏭ either side of it. */
  keys: {
    rocker: { minX: 1.0886, maxX: 1.1137, minY: 1.035, maxY: 1.0766 },
    pivotY: 1.0558,
    previous: { minX: 1.0801, maxX: 1.0978, minY: 1.0396, maxY: 1.0721 },
    next: { minX: 1.1045, maxX: 1.1222, minY: 1.0395, maxY: 1.072 },
    frontZ: -1.883,
  },
} as const;

/** The attention pose: towards the camera, a little up, a little bigger (docs/ROOM.md › The CD player). */
export const ATTENTION = { towardsCamera: 0.03, up: 0.008, scale: 1.06 } as const;
const RING_POINTS = 16;

/** Where a floating disc's centre is while it has attention, for an eye at `eye`. */
export function attentionCentre(slot: DiscSlot, eye: Vector3, target = new Vector3()): Vector3 {
  const towards = eye.clone().sub(slot.position).normalize().multiplyScalar(ATTENTION.towardsCamera);
  return target
    .copy(slot.position)
    .add(towards)
    .add(new Vector3(0, ATTENTION.up, 0));
}

/** The face plane of the transport keys: tilted back with the dial, so a key's top sits deeper than its bottom. */
function keyFaceZ(y: number): number {
  const { rocker, frontZ } = DECK.keys;
  // Measured on the rocker's face: z −1.8832 at y 1.043, −1.8889 at y 1.068.
  return frontZ - 0.0002 - 0.228 * (y - rocker.minY);
}

type KeyBox = { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number };

/** The four keys' face boxes (world, x and y), the rocker split at its pivot. */
export function keyBoxes(): Readonly<Record<RadioKey, KeyBox>> {
  const { rocker, pivotY, previous, next } = DECK.keys;
  return {
    'play-pause': { ...rocker, minY: pivotY },
    stop: { ...rocker, maxY: pivotY },
    previous,
    next,
  };
}

function ringPoints(centre: Vector3, orientation: Quaternion, radius: number): Vector3[] {
  const points: Vector3[] = [];
  for (let k = 0; k < RING_POINTS; k++) {
    const angle = (2 * Math.PI * k) / RING_POINTS;
    points.push(
      new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0).applyQuaternion(orientation).add(centre),
    );
  }
  return points;
}

/** Centre and radius (half its width) of a ring on the page. */
function anchorOf(points: readonly Vector3[], centre: Vector3, pose: Viewpoint, viewport: PageViewport) {
  const projected = projectToPage([centre, ...points], pose, viewport);
  const [middle, ...ring] = projected;
  const xs = ring.map((p) => p.x);
  return { x: middle?.x ?? 0, y: middle?.y ?? 0, radius: (Math.max(...xs) - Math.min(...xs)) / 2 };
}

/** The orientation of a disc lying on the turntable: flat on the well floor. */
export function seatOrientation(target = new Quaternion()): Quaternion {
  return target.setFromUnitVectors(new Vector3(0, 0, 1), DECK.seatNormal);
}

/** The orientation that faces a disc's label exactly at the eye. */
export function facingOrientation(centre: Vector3, eye: Vector3, target = new Quaternion()): Quaternion {
  return target.setFromUnitVectors(new Vector3(0, 0, 1), eye.clone().sub(centre).normalize());
}

function snap(value: number, dpr: number): number {
  return Math.round(value * dpr) / dpr;
}

function keyRect(box: KeyBox, pose: Viewpoint, viewport: PageViewport, dpr: number): ScreenRect {
  const corners = [
    new Vector3(box.minX, box.minY, keyFaceZ(box.minY)),
    new Vector3(box.maxX, box.minY, keyFaceZ(box.minY)),
    new Vector3(box.minX, box.maxY, keyFaceZ(box.maxY)),
    new Vector3(box.maxX, box.maxY, keyFaceZ(box.maxY)),
  ];
  const page = projectToPage(corners, pose, viewport);
  const xs = page.map((p) => p.x);
  const ys = page.map((p) => p.y);
  const left = snap(Math.min(...xs), dpr);
  const top = snap(Math.min(...ys), dpr);
  return { left, top, width: snap(Math.max(...xs), dpr) - left, height: snap(Math.max(...ys), dpr) - top };
}

/**
 * The anchors of `discs` (display order, one slot each) and the key rects for a camera resting at `pose`.
 * Floating discs are anchored at their attention pose; the loaded one at the seat, where it lies in the player.
 */
export function radioLayout(
  discs: readonly string[],
  loaded: string | null,
  slots: readonly DiscSlot[],
  pose: Viewpoint,
  viewport: PageViewport,
  dpr: number,
): RadioLayout {
  const eye = pose.position;
  const anchors: DiscAnchor[] = discs.map((disc, i) => {
    if (disc === loaded) {
      const seat = DECK.seat;
      return {
        disc,
        ...anchorOf(ringPoints(seat, seatOrientation(), DISC_RADIUS), seat, pose, viewport),
        inPlayer: true,
      };
    }
    const slot = slots[i];
    if (!slot) return { disc, x: 0, y: 0, radius: 0, inPlayer: false };
    const centre = attentionCentre(slot, eye);
    const ring = ringPoints(centre, facingOrientation(centre, eye), DISC_RADIUS * ATTENTION.scale);
    return { disc, ...anchorOf(ring, centre, pose, viewport), inPlayer: false };
  });
  const boxes = keyBoxes();
  const keys = Object.fromEntries(
    (Object.keys(boxes) as RadioKey[]).map((key) => [key, keyRect(boxes[key], pose, viewport, dpr)]),
  ) as Record<RadioKey, ScreenRect>;
  return { discs: anchors, keys };
}
