import { profile } from '@/content';
import { BitmapFont } from '@/engine/gfx/BitmapFont';
import { palette } from '../../palette';
import { lazy } from './lazy';
import type { InitialScale } from './product-engineer/lettering';
import { buildRaisedTopLine, buildTitleLogo, type LogoLine } from './product-engineer/logo';
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
  return {
    top: uploadLine(top, () => buildTitleLogo(profile.headline).top),
    bottom: uploadLine(bottom, () => buildTitleLogo(profile.headline).bottom),
    trademark: bitmapToCanvas(() => paintTrademark(palette.cream, LOCKUP_INK)),
  } as const;
});

/**
 * The title logo's top line with its first letter raised by `initial`, so
 * a name can ride the shelf beside it. Painted on every call: call it from
 * a lockup's lazy `prepare`, and take the unchanged bottom line and
 * trademark from `titleLogo`.
 */
export function raisedTitleLine(initial: InitialScale): TitleLogoLine {
  return uploadLine(buildRaisedTopLine(profile.headline, initial), () => buildRaisedTopLine(profile.headline, initial));
}

/**
 * The line's bitmaps uploaded to canvases. Only their first paint uses them: a canvas a GPU reset wiped is painted
 * from the line built again (`rebuild`), so the bitmaps are not kept for it.
 */
function uploadLine(line: LogoLine, rebuild: () => LogoLine): TitleLogoLine {
  const { image, shine, ...rest } = line;
  return {
    ...rest,
    image: bitmapToCanvas(once(image, () => rebuild().image)),
    shine: bitmapToCanvas(once(shine, () => rebuild().shine)),
  };
}

/** `value` the first time, `later()` after: a first paint's bitmap, then the paint that makes it again. */
function once<T>(value: T, later: () => T): () => T {
  let first: T | null = value;
  return () => {
    const next = first ?? later();
    first = null;
    return next;
  };
}
