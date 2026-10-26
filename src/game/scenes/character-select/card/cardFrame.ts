import type { Gfx } from '@/engine/gfx/Gfx';
import { drawNineSlice, type NineSlice } from '@/engine/gfx/NineSlice';
import { compilePixelArt, pixels } from '@/engine/gfx/PixelArt';
import type { Rect } from '@/engine/math/Rect';
import { INK, shadeOf } from '../../title/backdrops/blueprint/inks';
import { CARD_BORDER } from '../layout';

/**
 * The card's frame: a 5 px raised bevel with rounded corners in the
 * blueprint's inks — a near-white rim lit from the top-left, a mid-blue band
 * and a dark inner rim — tiled as a nine-slice so the pixels stay 1:1 at any
 * card size.
 */
const FRAME = pixels(`
  ...oooooo...
  .ooLLLLLLoo.
  .oLLLLLLLlo.
  oLLmmmmmmllo
  oLLmddddmllo
  oLLmd..dmllo
  oLLmd..dmllo
  oLLmddddmllo
  oLlmmmmmmllo
  .oLlllllllo.
  .oolllllloo.
  ...oooooo...
`);

const PALETTES = {
  rest: { o: shadeOf(0), L: shadeOf(INK.white), l: shadeOf(12), m: shadeOf(8), d: shadeOf(1) },
  // Choosing bleaches the rim for a beat, so the flash reads on the frame as well as inside it.
  flash: { o: shadeOf(0), L: shadeOf(INK.hot), l: shadeOf(INK.hot), m: shadeOf(INK.white), d: shadeOf(INK.mid) },
} as const;

export type CardFrameLook = keyof typeof PALETTES;

const slices = new Map<CardFrameLook, NineSlice>();

function sliceFor(look: CardFrameLook): NineSlice {
  let slice = slices.get(look);
  if (!slice) {
    const art = compilePixelArt(
      {
        palette: PALETTES[look],
        size: { w: 12, h: 12 },
        animations: { frame: { fps: 1, loop: false, frames: [FRAME] } },
      },
      `character-select/card-frame-${look}`,
    );
    const inset = CARD_BORDER;
    slice = { image: art.atlas, insets: { top: inset, right: inset, bottom: inset, left: inset } };
    slices.set(look, slice);
  }
  return slice;
}

export function drawCardFrame(gfx: Gfx, card: Rect, look: CardFrameLook = 'rest'): void {
  drawNineSlice(gfx, sliceFor(look), card.x, card.y, card.w, card.h);
}
