import { pixels } from '@/engine/gfx/PixelArt';

/**
 * The cursors over a level's play (docs/ART-DIRECTION.md › The room's UI › Cursors), drawn in the glove hand's hand
 * (`cursor.ts`): its palette (`HAND_PALETTE`: black outline, white, light-grey shading, grey details) at its pixel
 * scale. Only the page draws them, as the `cursor` property (`walk.png`, …, scripts/build-cursors.ts); the game never
 * loads them.
 */
export interface PlayCursorArt {
  readonly rows: readonly string[];
  /** The point that clicks, in sprite pixels from the top-left corner: a half lands in the middle of a pixel. */
  readonly hotspot: { readonly x: number; readonly y: number };
}

/**
 * A pair of footprints walking up and to the right, a sole and a heel each: a click walks there. The point is
 * the middle of the pair.
 */
const WALK = pixels(`
  .....oo.......
  ....owwo......
  ...owwwo......
  ...owwso...oo.
  .oo.oso...owwo
  owwo.o...owwwo
  owso.....owwso
  .oo....oo.oso.
  ......owwo.o..
  ......owso....
  .......oo.....
`);

/** The same footprints under a chunky arrow up: a click gets there, jumping on the way. */
const JUMP = pixels(`
  ...........o...
  ..........owo..
  .........owwwo.
  ........owwwwwo
  ........ooowooo
  .....oo...owo..
  ....owwo..ooo..
  ...owwwo.......
  ...owwso...oo..
  .oo.oso...owwo.
  owwo.o...owwwo.
  owso.....owwso.
  .oo....oo.oso..
  ......owwo.o...
  ......owso.....
  .......oo......
`);

/**
 * A target's reticle: a ring, four ticks pointing in and a dot in the middle, the point exactly there; symmetric, so it
 * needs no side. A click attacks, the hero turning towards it.
 */
const ATTACK = pixels(`
  .....ooooo.....
  ...oowwwwwoo...
  ..owwoowoowwo..
  .owo..owo..owo.
  .owo...o...owo.
  owo.........owo
  owoo...o...oowo
  owwwo.owo.owwwo
  owoo...o...oowo
  owo.........owo
  .owo...o...owo.
  .owo..owo..owo.
  ..owwoowoowwo..
  ...oowwwwwoo...
  .....ooooo.....
`);

export const PLAY_CURSORS = {
  walk: { rows: WALK, hotspot: { x: 7, y: 5.5 } },
  jump: { rows: JUMP, hotspot: { x: 7, y: 10.5 } },
  attack: { rows: ATTACK, hotspot: { x: 7.5, y: 7.5 } },
} as const satisfies Readonly<Record<string, PlayCursorArt>>;
