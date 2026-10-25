import { roomViewpoint } from '../camera/roomFraming';

/**
 * Which of the posters' two atlases a visitor gets (docs/ROOM.md › Posters). Decided once, at the TV, and never
 * changed: one tier, one download, no swap. The 2K is sampled at mip 0 to 0.2 in the room view of a typical screen;
 * below this focal length the 1K already carries 1.1 × the on-screen density in every resting framing, so the 2K
 * would only be minified away.
 */
export const POSTERS_2K_MIN_FOCAL_PX = 505;

export type PosterTier = '2k' | '1k';

export interface PosterTierFacts {
  /** The viewport in CSS pixels and the stage's pixel ratio (already capped by the drawing-buffer budget). */
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
  /** `navigator.deviceMemory` in GB, undefined where the browser does not tell. */
  readonly deviceMemory: number | undefined;
  readonly saveData: boolean;
  /** The link is estimated at 3G or slower: the 2K's extra 150 KB would compete with what the visitor clicks for. */
  readonly slowLink: boolean;
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
  return sharpEnough && memory && !facts.saveData && !facts.slowLink && !facts.softwareGpu ? '2k' : '1k';
}
