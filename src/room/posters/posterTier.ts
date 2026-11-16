import { roomViewpoint } from '../camera/roomFraming';

/**
 * Which size the posters' atlas is painted at (docs/ROOM.md › Posters): 2048 × 1024 or half that each way. Decided
 * once, at the TV, and never changed: one painting, no swap. The 2K is sampled at mip 0 to 0.2 in the room view of a
 * typical screen; below this focal length the 1K already carries 1.1 × the on-screen density in every resting framing,
 * so the 2K would only be minified away. The 1K is also a quarter of the pixels to paint, to upload and to keep, which
 * is what a small-memory device or a software GPU (whose GPU is the CPU that paints) gets.
 */
export const POSTERS_2K_MIN_FOCAL_PX = 505;

export type PosterTier = '2k' | '1k';

export interface PosterTierFacts {
  /** The viewport in CSS pixels and the stage's pixel ratio (already capped by the quality tier). */
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  /** `navigator.deviceMemory` in GB, undefined where the browser does not tell. */
  readonly deviceMemory: number | undefined;
  readonly softwareGpu: boolean;
}

/** The room view's focal length in drawing-buffer pixels: buffer height / (2 · tan(vfov / 2)). */
export function roomFocalPx(width: number, height: number, pixelRatio: number): number {
  const vfov = (roomViewpoint(width / height).fov * Math.PI) / 180;
  // three sizes the drawing buffer as floor(css × ratio).
  return Math.floor(height * pixelRatio) / (2 * Math.tan(vfov / 2));
}

export function posterTier(facts: PosterTierFacts): PosterTier {
  const sharpEnough = roomFocalPx(facts.width, facts.height, facts.pixelRatio) >= POSTERS_2K_MIN_FOCAL_PX;
  const memory = facts.deviceMemory === undefined || facts.deviceMemory > 2;
  return sharpEnough && memory && !facts.softwareGpu ? '2k' : '1k';
}
