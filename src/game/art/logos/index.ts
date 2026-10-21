import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { lazy } from './lazy';
import { buildMonogram } from './rcl/monogram';
import { buildWordmark } from './reo-leo/wordmark';
import { condensedFont } from './type/condensed';

/**
 * Procedural logos for the boot and title screens, each generated once on
 * first use. Masks stay masks because their scenes recolour and resample
 * them every frame.
 */
export const reoLeoWordmark = lazy(() => buildWordmark());
export const rclMonogram = lazy(() => buildMonogram());
export const condensedType = lazy(() => BitmapFont.fromGlyphData(condensedFont));
