import { pixels } from '@/engine/gfx/PixelArt';

/**
 * The cursors over a level's play (docs/ART-DIRECTION.md › The room's UI › Cursors), drawn in the glove hand's hand
 * (`cursor.ts`): its palette (`HAND_PALETTE`: black outline, white, light-grey shading, grey details) at its pixel
 * scale. Each faces right; scripts/build-cursors.ts mirrors it for the left. Only the page draws them, as the
 * `cursor` property (`walk-right.png`, …); the game never loads them.
 */
export interface PlayCursorArt {
  readonly rows: readonly string[];
  /** The point that clicks, in sprite pixels: the top-left corner of this pixel. */
  readonly hotspot: { readonly x: number; readonly y: number };
}

/** A white high-top sneaker stepping the hero's way, the point at the middle of its sole: a double click walks there. */
const WALK = pixels(`
  ...oooo.........
  ..owwwwo........
  ..owsswo........
  ..owwwwooo......
  ..owwwdwdwoo....
  ..owwwwdwdwwo...
  .oowwwwwwwwwwoo.
  .owwwwwwwwwwwwwo
  .oswwwwwwwwwwwwo
  .owssssssssssswo
  .odddddddddddddo
  ..ooooooooooooo.
`);

/** The sneaker with an arrow up over its toe: a double click gets there, jumping on the way. */
const JUMP = pixels(`
  ............o...
  ...........owo..
  ..........owwwo.
  .........owwwwwo
  ...oooo..ooowooo
  ..owwwwo...owo..
  ..owsswo...owo..
  ..owwwwooo.ooo..
  ..owwwdwdwoo....
  ..owwwwdwdwwo...
  .oowwwwwwwwwwoo.
  .owwwwwwwwwwwwwo
  .oswwwwwwwwwwwwo
  .owssssssssssswo
  .odddddddddddddo
  ..ooooooooooooo.
`);

/** The glove made a fist, punching with three speed lines behind it, the point on its knuckles: a click attacks. */
const ATTACK = pixels(`
  ......ooooooo...
  .....owwwwwwwo..
  ....owwwwwwwwwo.
  ....owwwwoooooo.
  oo.owwwwwwwwwwwo
  ...osowwwwwdddwo
  ooooswwwwwwwwwwo
  ...osowwwwwdddwo
  oo.oswwwwwwwwwso
  ...oossswwwdddso
  ....oosssssssso.
  ......ooooooooo.
`);

export const PLAY_CURSORS = {
  walk: { rows: WALK, hotspot: { x: 8, y: 11 } },
  jump: { rows: JUMP, hotspot: { x: 8, y: 15 } },
  attack: { rows: ATTACK, hotspot: { x: 15, y: 6 } },
} as const satisfies Readonly<Record<string, PlayCursorArt>>;
