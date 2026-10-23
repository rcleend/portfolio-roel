import type { ScreenRect } from '../display';

/**
 * The desktop's scale for a picture size. Pure and without hysteresis, so
 * the still painter and the live DOM lay the desktop out identically for the
 * same placement and the hand-off between them stays invisible.
 */

/** The desktop's coordinate space: CSS px before the content root's `scale(s)`. */
export interface DesktopLayoutSize {
  readonly width: number;
  readonly height: number;
  /** The content root's scale: layout px × scale = CSS px on the page. */
  readonly scale: number;
}

/** Below this picture width the whole desktop is shown scaled down, like a screen seen from a step back. */
const SMALL_PICTURE_WIDTH = 600;
/** The desktop width shown on small pictures, in layout px. */
const SMALL_LAYOUT_WIDTH = 800;
/** On large pictures the chrome grows in quarter steps, one step per 900 px of picture. */
const SCALE_STEP_WIDTH = 900;
const MAX_SCALE = 1.5;

/**
 * The desktop's scale. In the glass the chrome is never smaller than its
 * design size (11 px text); no hysteresis, because the painter and the DOM
 * must agree for any placement.
 */
export function layoutScale(placementWidth: number): number {
  if (placementWidth <= 0) return 1;
  if (placementWidth < SMALL_PICTURE_WIDTH) return placementWidth / SMALL_LAYOUT_WIDTH;
  return Math.min(MAX_SCALE, Math.max(1, Math.floor((placementWidth / SCALE_STEP_WIDTH) * 4) / 4));
}

export function desktopLayoutSize(placement: Pick<ScreenRect, 'width' | 'height'>): DesktopLayoutSize {
  const scale = layoutScale(placement.width);
  return { width: placement.width / scale, height: placement.height / scale, scale };
}
