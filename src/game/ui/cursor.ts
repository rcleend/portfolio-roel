import type { PixelArtSheet } from '@/engine/gfx/PixelArt';
import { pixels } from '@/engine/gfx/PixelArt';
import { shiftRows } from '../art/compose';

/** The arcade "pointing hand" next to focused buttons and menu items. Faces right; the origin is the fingertip. */
const rest = pixels(`
  ..oooo.....
  .owwwwoooo.
  owwwwwwwwo.
  owwwwsoooo.
  owwwwwwo...
  owwwwsoo...
  .owwwwo....
  ..oooo.....
`);

export const handCursorSheet: PixelArtSheet<'point'> = {
  palette: { o: '#14123a', w: '#ffffff', s: '#c4b8f5' },
  size: { w: 11, h: 8 },
  origin: { x: 11, y: 4 },
  animations: {
    // The hand nudges towards its target on the beat, like a menu cursor on real hardware.
    point: { fps: 4, loop: true, frames: [rest, shiftRows(rest, 1, 0)] },
  },
};
