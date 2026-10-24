import { MathUtils, Vector3 } from 'three';
import type { Viewpoint } from '../camera/cameraPath';
import { type PageViewport, projectToPage } from '../camera/pageProjection';

/**
 * Where the floating CDs hang above the radio (docs/ROOM.md › The CD player): a hand-hung arc on landscape
 * screens, a stack of columns on portrait ones, so a phone held upright still shows big discs. Pure: the camera
 * frames these slots (radioFraming.ts), the device flies discs to them and the app's buttons sit on them.
 */

/** A disc's resting place: its centre, its turn about the vertical and how far its top leans back (radians). */
export interface DiscSlot {
  readonly position: Vector3;
  readonly yaw: number;
  readonly tilt: number;
  readonly row: number;
}

/** Ø 120 mm with a Ø 15 mm hole, 1.2 mm thick: a compact disc. */
export const DISC_RADIUS = 0.06;
export const DISC_HOLE_RADIUS = 0.0075;
export const DISC_THICKNESS = 0.0012;
export const MIN_DISCS = 1;
export const MAX_DISCS = 12;

/** Viewports narrower than this (width / height) stack the discs instead of hanging them in an arc. */
export const STACK_BELOW_ASPECT = 0.9;
/** The well's centre: the arc is centred over the CD half of the radio, which is where the action is. */
const ARC_CENTRE_X = 1.1115;
const ARC_PITCH = 0.135;
const STACK_CENTRE_X = 1.0875;
const STACK_PITCH = 0.14;
const BASE_Y = 1.235;
const BASE_Z = -1.985;
/**
 * Alternate discs stand 12 mm proud of or behind the line, like discs hung by hand. The even ones (the outermost
 * of an arc) stand proud: the camera trucks right of the lava lamp on wide screens and sees the arc's left end
 * obliquely, where an outer disc set behind its neighbour would slip under it (measured: up to 30 px of overlap
 * at 3440 × 1440 the other way round, none for up to six discs this way).
 */
const STAGGER_Z = 0.012;
/** The discs face the camera's line of sight (24° down) less 6°, ±3° by turns. */
const TILT = MathUtils.degToRad(18);
const TILT_STAGGER = MathUtils.degToRad(3);

/** The resting slots of `count` discs (1–12) in display order, for a viewport of this aspect (width / height). */
export function discSlots(count: number, aspect: number): DiscSlot[] {
  const n = MathUtils.clamp(Math.round(count), MIN_DISCS, MAX_DISCS);
  return aspect >= STACK_BELOW_ASPECT ? arcSlots(n) : stackSlots(n);
}

function tiltFor(index: number): number {
  return TILT + (index % 2 === 1 ? TILT_STAGGER : -TILT_STAGGER);
}

/** One row for up to six discs; two for more, the top row (filled first) holding the odd one. */
function arcSlots(count: number): DiscSlot[] {
  const rows = count <= 6 ? [count] : [Math.ceil(count / 2), Math.floor(count / 2)];
  const slots: DiscSlot[] = [];
  rows.forEach((k, rowFromTop) => {
    const row = rows.length - 1 - rowFromTop;
    const span = ARC_PITCH * (k - 1);
    for (let i = 0; i < k; i++) {
      const u = k === 1 ? 0 : i / (k - 1) - 0.5;
      const odd = i % 2 === 1;
      slots.push({
        position: new Vector3(
          ARC_CENTRE_X + u * span,
          BASE_Y + 0.15 * row + 0.1 * u * u,
          BASE_Z - 0.04 * row - 0.16 * u * u + (odd ? -STAGGER_Z : STAGGER_Z),
        ),
        yaw: -0.55 * u,
        tilt: tiltFor(i),
        row,
      });
    }
  });
  return slots;
}

/** Two columns for up to six discs, three for more; rows top to bottom, an incomplete bottom row centred. */
function stackSlots(count: number): DiscSlot[] {
  const columns = count <= 6 ? 2 : 3;
  const rows = Math.ceil(count / columns);
  const slots: DiscSlot[] = [];
  for (let index = 0; index < count; index++) {
    const rowFromTop = Math.floor(index / columns);
    const row = rows - 1 - rowFromTop;
    const inRow = row === 0 ? count - (rows - 1) * columns : columns;
    const column = index - rowFromTop * columns;
    const x = STACK_CENTRE_X + (column - (inRow - 1) / 2) * STACK_PITCH;
    slots.push({
      position: new Vector3(x, BASE_Y + STACK_PITCH * row, BASE_Z - 0.03 * row),
      yaw: 0,
      tilt: tiltFor(column),
      row,
    });
  }
  return slots;
}

/**
 * The largest disc's diameter on the page at the radio pose (CSS px), seen face on: what its print must be sharp
 * at. Enough of an estimate for the label size (an attended disc faces the camera at ×1.06, which labelSizeFor adds).
 */
export function largestDiscDiameter(slots: readonly DiscSlot[], pose: Viewpoint, viewport: PageViewport): number {
  const forward = pose.target.clone().sub(pose.position).normalize();
  const across = new Vector3()
    .crossVectors(forward, new Vector3(0, 1, 0))
    .normalize()
    .multiplyScalar(DISC_RADIUS);
  let largest = 0;
  for (const { position } of slots) {
    const [a, b] = projectToPage([position.clone().sub(across), position.clone().add(across)], pose, viewport);
    largest = Math.max(largest, Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0)));
  }
  return largest;
}

/**
 * The size disc prints are painted at: the largest disc on screen at the radio, in device pixels with a little
 * headroom for the attention pose (×1.06), rounded up to a step, and the smallest step on low-memory devices and
 * software renderers.
 */
export function labelSizeFor(
  diameterCss: number,
  pixelRatio: number,
  deviceMemory: number | undefined,
  software: boolean,
): 256 | 384 | 512 {
  if (software || (deviceMemory !== undefined && deviceMemory <= 2)) return 256;
  const device = diameterCss * pixelRatio * 1.06;
  if (device <= 256) return 256;
  if (device <= 384) return 384;
  return 512;
}
