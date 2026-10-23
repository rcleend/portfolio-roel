import type { StillPainter } from '../display';
import { formatClock } from '../desktop/clock';
import { desktopLayout } from '../desktop/desktopLayout';
import { paintIcons, paintTaskbar } from '../desktop/paintChrome';
import { wallpaperCanvas } from '../desktop/wallpaper';
import { desktopLayoutSize } from '../presentation';

/**
 * What the monitor shows whenever the live screen does not: the resting
 * desktop, painted from the same layout, tokens, art and wallpaper bitmap as
 * the live DOM desktop. Its own small chunk, loaded at idle once the TV is on
 * and run by the room before the first flight away from the TV.
 */
export const paintDesktop: StillPainter = (context, request) => {
  // Before the room knows where the screen lands, lay the desktop out at the texture's own size.
  const placement = request.placement.width > 0 ? request.placement : request;
  const size = desktopLayoutSize(placement);
  const layout = desktopLayout(size.width, size.height);
  context.save();
  context.scale(request.width / layout.width, request.height / layout.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(wallpaperCanvas(request.width, layout.width / layout.height), 0, 0, layout.width, layout.height);
  paintIcons(context, layout);
  paintTaskbar(context, layout, formatClock(new Date()));
  context.restore();
};
