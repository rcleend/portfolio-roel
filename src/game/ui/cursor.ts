import type { PixelArtSheet } from '@/engine/gfx/PixelArt';
import { pixels } from '@/engine/gfx/PixelArt';
import { shiftRows } from '../art/compose';

/**
 * The classic pixel-art pointing hand, after the captain's reference (round seven, item 43): a white glove, a crisp
 * black outline, light-grey shading along its lower and inner edges and grey knuckle dots, the index finger pointing
 * up and to the left. It is the page's pointer over the game (scripts/build-cursors.ts makes `game-hand.png` from it,
 * the hotspot on the fingertip) and, flipped, the menus' hand below.
 */
export const POINTER_HAND = pixels(`
  .oo.....ooo.....
  owwo..ooswwo....
  owwwooswoswwo...
  oswwwwoswwwwo...
  .oswwwwwwwdwwo..
  ..oswwwwdwwdwo..
  ..ooswwwwdwwwo..
  ..oddswwwwwwwoo.
  ..odsswwwwwwowwo
  ...osswwwwwwwwwo
  ....osssssowwso.
  .....oooooswso..
  ........odsso...
  ........oddo....
  .........oo.....
`);

/** The pointer's fingertip, in sprite pixels: the white pixel the outline closes round at the top left. */
export const POINTER_TIP = { x: 1, y: 1 } as const;

export const HAND_PALETTE = { o: '#000000', w: '#ffffff', s: '#c6c6c6', d: '#7c7c7c' } as const;

/**
 * The game's own arrow, the pointer over its picture wherever a click acts on nothing (the hand is for what it does):
 * the classic pixel arrow drawn in the hand's pixels, palette and light. A white body with the same crisp black outline,
 * light-grey shading along its lower and inner edges (down the left of the head, under its wings and down the left of
 * the tail) and one grey dot in the notch where the tail meets the head, as the glove's knuckles are. 10 × 15, the
 * hand's height and a little over half its width, as a system arrow stands beside a system hand; scripts/build-cursors.ts
 * scales it as it does the hand (2×, so 20 × 30 CSS px beside the hand's 32 × 30).
 */
export const POINTER_ARROW = /* @__PURE__ */ pixels(`
  o.........
  oo........
  owo.......
  owwo......
  owwwo.....
  owwwwo....
  oswwwwo...
  oswwwwwo..
  osswwssso.
  osswwwwooo
  osswoswo..
  osdooswo..
  oso..oswo.
  oo...oswo.
  o.....oo..
`);

/** The arrow's point, in sprite pixels: the top-left corner of its tip, as a pointer's hotspot is. */
export const POINTER_ARROW_TIP = { x: 0, y: 0 } as const;

/**
 * The same hand mirrored, its finger pointing up and to the right, towards the item it stands before; one clear
 * column on the right for the nudge to move into.
 */
const rest = POINTER_HAND.map((row) => `${[...row].reverse().join('')}.`);
const SIZE = { w: 17, h: 15 } as const;

/**
 * The arcade "pointing hand" next to focused buttons and menu items: the pointer's hand flipped, at the game's own
 * pixel scale. The origin is just right of the fingertip and a little below it, so the hand sits centred on the
 * item's line with its finger at the item.
 */
export const handCursorSheet: PixelArtSheet<'point'> = {
  palette: HAND_PALETTE,
  size: SIZE,
  origin: { x: SIZE.w - 1, y: POINTER_TIP.y + 5 },
  animations: {
    // The hand nudges towards its target on the beat, like a menu cursor on real hardware.
    point: { fps: 4, loop: true, frames: [rest, shiftRows(rest, 1, 0)] },
  },
};
