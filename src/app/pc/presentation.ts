import type { ScreenRect } from './display';
import { fitWidthScale, type ZoomSetting } from './reader/zoom';

/**
 * How the computer's screen is presented for a given picture size: the
 * desktop's scale (shared with the still painter, which imports it from
 * `desktopScale.ts` directly to keep its chunk small), whether the reader
 * stays in the glass, and the zoom it opens at.
 */
export { type DesktopLayoutSize, desktopLayoutSize, layoutScale } from './desktop/desktopScale';

/** The reader opens inside the glass, or grows out of it to fill the viewport (phones, short windows). */
export type PresentationMode = 'in-glass' | 'pop-out';

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
