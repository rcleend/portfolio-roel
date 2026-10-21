import type { Gfx } from '@/engine/gfx/Gfx';
import { drawNineSlice, type NineSlice } from '@/engine/gfx/NineSlice';
import { compilePixelArt, pixels } from '@/engine/gfx/PixelArt';
import type { Rect } from '@/engine/math/Rect';
import { CARD_BORDER } from '../layout';

/**
 * The card's frame: a 5 px raised bevel with rounded corners — a light
 * lavender rim lit from the top-left, a mid band and a dark inner rim —
 * tiled as a nine-slice so the pixels stay 1:1 at any card size.
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
  rest: { o: '#0b0a1f', L: '#e4dcff', l: '#9d90e6', m: '#6a5ad0', d: '#1a1446' },
  // Choosing bleaches the rim for a beat, so the flash reads on the frame as well as inside it.
  flash: { o: '#0b0a1f', L: '#ffffff', l: '#ffffff', m: '#e4dcff', d: '#a99cf0' },
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
