import { profile } from '@/content';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { palette } from '../../palette';
import { lazy } from './lazy';
import { buildTitleLogo, type LogoLine } from './product-engineer/logo';
import { paintTrademark } from './product-engineer/trademark';
import { bitmapToCanvas } from './raster/toCanvas';
import { buildMonogram } from './rcl/monogram';
import { condensedFont } from './type/condensed';
import { buildWordmark } from './wordmark/wordmark';

/**
 * Procedural logos for the boot and title screens, each generated once on
 * first use. Masks stay masks because their scenes recolour and resample
 * them every frame.
 */
export const bootWordmark = lazy(() => buildWordmark());
export const rclMonogram = lazy(() => buildMonogram());
export const condensedType = lazy(() => BitmapFont.fromGlyphData(condensedFont));

/** Dark brown outline shared by the small lettering around the title logo. */
export const LOCKUP_INK = '#2a1a0a';

/** A painted logo line uploaded to a canvas, with the point it is aligned by. */
export interface TitleLogoLine extends Omit<LogoLine, 'image' | 'shine'> {
  readonly image: HTMLCanvasElement;
  readonly shine: HTMLCanvasElement;
}

/** The title logo spells the headline from the content, e.g. "PRODUCT" over "ENGINEER". */
export const titleLogo = lazy(() => {
  const { top, bottom } = buildTitleLogo(profile.headline);
  const upload = (line: LogoLine): TitleLogoLine => ({
    ...line,
    image: bitmapToCanvas(line.image),
    shine: bitmapToCanvas(line.shine),
  });
  return {
    top: upload(top),
    bottom: upload(bottom),
    trademark: bitmapToCanvas(paintTrademark(palette.cream, LOCKUP_INK)),
  } as const;
});
