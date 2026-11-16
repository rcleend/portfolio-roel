/**
 * The printed things, as rectangles of one small canvas (the art page): the game covers, the TV's legends and
 * wordmark, the console's. All of it is drawn in code (artPaint.ts); nothing here is an image file.
 * Rectangles are in a 1024-pixel page; lower quality tiers draw the page smaller.
 */
export const ART_SIZE = 1024;

export type ArtRect = readonly [x: number, y: number, w: number, h: number];

export const ART = {
  /** 0.30 m × 0.0375 m of the TV's chin: the button and jack legends, and the wordmark over them. */
  legends: [0, 0, 1024, 128],
  /** Game covers, portrait, 0.144 m × 0.194 m. */
  coverKingdom: [284, 136, 272, 368],
  coverBricks: [564, 136, 272, 368],
  /** The game on the floor by the console: a cover as the three above, in the page's bottom corner. */
  coverPowder: [748, 652, 272, 368],
  /** The console's wordmark, 0.085 m × 0.017 m of its lid, and its standby lamp. */
  consoleMark: [420, 956, 320, 64],
  consoleLamp: [380, 988, 32, 32],
} as const satisfies Record<string, ArtRect>;

/** A rectangle as fractions of the page, inset half a pixel so filtering never reads a neighbour. */
export function artUv(rect: ArtRect): readonly [number, number, number, number] {
  return [(rect[0] + 0.5) / ART_SIZE, (rect[1] + 0.5) / ART_SIZE, (rect[2] - 1) / ART_SIZE, (rect[3] - 1) / ART_SIZE];
}
