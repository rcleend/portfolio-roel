import { formatClock } from '../desktop/clock';
import { type DesktopLayout, desktopLayout } from '../desktop/desktopLayout';
import { desktopLayoutSize } from '../desktop/desktopScale';
import { LABEL_FONT, START_FONT } from '../desktop/lunaTokens';
import { paintIcons, paintTaskbar } from '../desktop/paintChrome';
import { wallpaperCanvas } from '../desktop/wallpaper';
import type { StillPainter, StillRequest } from '../display';

/**
 * What the monitor shows whenever the live screen does not: the resting
 * desktop, painted from the same layout, tokens, art and wallpaper bitmap as
 * the live DOM desktop. Its own small chunk, loaded at idle once the TV is on;
 * the room prepares it in idle moments and paints it before the first flight
 * away from the TV.
 */
export const paintDesktop: StillPainter = Object.assign(
  (context: CanvasRenderingContext2D, request: StillRequest): void => {
    const layout = layoutFor(request);
    context.save();
    context.scale(request.width / layout.width, request.height / layout.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(wallpaperFor(request, layout), 0, 0, layout.width, layout.height);
    paintIcons(context, layout);
    paintTaskbar(context, layout, formatClock(new Date()));
    context.restore();
  },
  { prepare: prepareDesktop },
);

/**
 * The first paint's one-time work, a unit at a time: the wallpaper's bitmap
 * (4 ms on a phone six times slower than a laptop), then the first use of
 * each font, which finds and shapes the system face (5 ms each there).
 */
function* prepareDesktop(request: StillRequest): Generator<void, void, void> {
  // Any 2D context warms the page's font cache; the wallpaper's is at hand.
  const context = wallpaperFor(request, layoutFor(request)).getContext('2d');
  for (const font of [LABEL_FONT, START_FONT]) {
    yield;
    if (context) {
      context.font = font;
      context.measureText('start');
    }
  }
}

function layoutFor(request: StillRequest): DesktopLayout {
  // Before the room knows where the screen lands, lay the desktop out at the texture's own size.
  const size = desktopLayoutSize(request.placement.width > 0 ? request.placement : request);
  return desktopLayout(size.width, size.height);
}

function wallpaperFor(request: StillRequest, layout: DesktopLayout): HTMLCanvasElement {
  return wallpaperCanvas(request.width, layout.width / layout.height);
}
