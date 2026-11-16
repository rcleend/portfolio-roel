import type { PixelData } from '@/engine/gfx/PixelData';

/**
 * Every stage's pictures as pixels in code (`<name>.art.ts`, written by `pnpm build:art` from the `<name>.png` its
 * `layers.json` names), by path. `loadLevelArt` imports this module lazily, so they all travel in one chunk of their
 * own, one request beside the first script instead of a picture each, and nothing else may import it.
 */
export const pictures = import.meta.glob<PixelData>('../*/art/*.art.ts', { eager: true, import: 'art' });
