import type { PadDirection } from './padActions';

export interface PadRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Inside this fraction of the D-pad's radius nothing is pressed, so a resting thumb does not drift. */
const DPAD_DEAD_ZONE = 0.22;
/** A thumb that slides a little off a control keeps holding it. */
const SLOP = 0.25;
/** Half-angle of each direction's sector: 67.5° gives 45° diagonal wedges where two directions overlap. */
const DIRECTION_HALF_ANGLE = (67.5 * Math.PI) / 180;

/**
 * Directions held by a touch at (x, y) on a D-pad occupying `rect`. Eight-way:
 * each direction owns a 135° wedge, so the 45° between neighbours presses both.
 */
export function dpadDirections(rect: PadRect, x: number, y: number): PadDirection[] {
  const radius = Math.min(rect.width, rect.height) / 2;
  const dx = x - (rect.left + rect.width / 2);
  const dy = y - (rect.top + rect.height / 2);
  const distance = Math.hypot(dx, dy);
  if (distance < radius * DPAD_DEAD_ZONE || distance > radius * (1 + SLOP)) return [];
  const angle = Math.atan2(-dy, dx); // screen y grows downwards
  const centres: readonly [PadDirection, number][] = [
    ['right', 0],
    ['up', Math.PI / 2],
    ['left', Math.PI],
    ['down', -Math.PI / 2],
  ];
  return centres.filter(([, centre]) => angularDistance(angle, centre) < DIRECTION_HALF_ANGLE).map(([dir]) => dir);
}

/** True when (x, y) lands on the round button occupying `rect`, with a little slop. */
export function hitsButton(rect: PadRect, x: number, y: number): boolean {
  const radius = Math.min(rect.width, rect.height) / 2;
  const dx = x - (rect.left + rect.width / 2);
  const dy = y - (rect.top + rect.height / 2);
  return Math.hypot(dx, dy) <= radius * (1 + SLOP);
}

/** True when (x, y) lands on the rectangular control `rect`, with a little slop. */
export function hitsRect(rect: PadRect, x: number, y: number): boolean {
  const slopX = (rect.width * SLOP) / 2;
  const slopY = (rect.height * SLOP) / 2 + 8;
  return (
    x >= rect.left - slopX &&
    x <= rect.left + rect.width + slopX &&
    y >= rect.top - slopY &&
    y <= rect.top + rect.height + slopY
  );
}

function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % (2 * Math.PI);
  return diff > Math.PI ? 2 * Math.PI - diff : diff;
}

export type PadLayout = 'bottom' | 'sides';

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Strips of the viewport the pad covers, for `room.setFramingInsets`. In
 * portrait the pad is a band along the bottom; in landscape its two clusters
 * flank the TV. Rounded to whole pixels so sub-pixel layout jitter does not
 * re-frame the camera.
 */
export function padInsets(
  layout: PadLayout,
  viewport: { readonly width: number; readonly height: number },
  clusters: readonly PadRect[],
): Insets {
  if (clusters.length === 0) return NO_INSETS;
  if (layout === 'bottom') {
    const top = Math.min(...clusters.map((rect) => rect.top));
    return { ...NO_INSETS, bottom: Math.max(0, Math.ceil(viewport.height - top)) };
  }
  const centreX = viewport.width / 2;
  const leftOnes = clusters.filter((rect) => rect.left + rect.width / 2 < centreX);
  const rightOnes = clusters.filter((rect) => rect.left + rect.width / 2 >= centreX);
  const left = leftOnes.length ? Math.max(...leftOnes.map((rect) => rect.left + rect.width)) : 0;
  const right = rightOnes.length ? viewport.width - Math.min(...rightOnes.map((rect) => rect.left)) : 0;
  return { ...NO_INSETS, left: Math.max(0, Math.ceil(left)), right: Math.max(0, Math.ceil(right)) };
}
