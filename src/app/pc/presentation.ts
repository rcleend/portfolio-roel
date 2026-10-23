import type { ScreenRect } from './display';
import { fitWidthScale, type ZoomSetting } from './reader/zoom';

/**
 * How the computer's screen is presented for a given picture size. Pure, so
 * the still painter and the live DOM compute the same layout from the same
 * placement and the hand-off between them stays invisible.
 */

/** The reader opens inside the glass, or grows out of it to fill the viewport (phones, short windows). */
export type PresentationMode = 'in-glass' | 'pop-out';

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

/** The smallest picture the reader is comfortable to read in, in CSS px. */
const IN_GLASS_MIN_WIDTH = 600;
const IN_GLASS_MIN_HEIGHT = 440;
/** A resize hovering around a threshold must not flip the reader back and forth. */
const MODE_HYSTERESIS = 16;

export function presentationMode(
  placement: Pick<ScreenRect, 'width' | 'height'>,
  previous: PresentationMode | null,
): PresentationMode {
  const slack = previous === 'in-glass' ? -MODE_HYSTERESIS : previous === 'pop-out' ? MODE_HYSTERESIS : 0;
  const fits = placement.width >= IN_GLASS_MIN_WIDTH + slack && placement.height >= IN_GLASS_MIN_HEIGHT + slack;
  return fits ? 'in-glass' : 'pop-out';
}

/**
 * Fit Width keeps the body text at 12 px or more (14 px type × 0.86); below
 * that the reader opens in Reflow at 16 px instead. The pop-out always reflows.
 */
const MIN_FIT_SCALE = 0.86;

export function defaultZoom(paneClientWidth: number, mode: PresentationMode): ZoomSetting {
  if (mode === 'pop-out') return { kind: 'reflow' };
  return fitWidthScale(paneClientWidth) >= MIN_FIT_SCALE ? { kind: 'fit-width' } : { kind: 'reflow' };
}
