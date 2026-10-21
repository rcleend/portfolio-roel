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
