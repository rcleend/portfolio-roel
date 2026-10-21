import { titleLogo } from '../../../art/logos';
import { lazy } from '../../../art/logos/lazy';
import { bitmapToCanvas } from '../../../art/logos/raster/toCanvas';
import { paintBackdrop } from './backdrop';
import { CRATER_FRAMES, paintCrater } from './crater';

export { CRATER_CENTER } from './crater';
export { drawFireball } from './fireball';

/** The game's native resolution (docs/ARCHITECTURE.md › Rendering model); the backdrop fills it. */
const SCREEN = { width: 320, height: 240 } as const;

/** Pre-rendered title art, painted once on first use. */
export const titleArt = lazy(() => ({
  backdrop: bitmapToCanvas(paintBackdrop(SCREEN.width, SCREEN.height)),
  craterFrames: Array.from({ length: CRATER_FRAMES }, (_, frame) => bitmapToCanvas(paintCrater(frame))),
}));

/**
 * Paints everything the title needs (about 70 ms on a laptop). Call it while
 * the screen shows nothing that moves — the boot does, during its black
 * frames — so the title's first frame never stutters.
 */
export function prepareTitleArt(): void {
  titleArt();
  titleLogo();
}
