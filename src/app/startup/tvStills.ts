/**
 * The startup stills (docs/ROOM.md › Startup): the room's TV view with its tube dark, rendered by the room itself at
 * one reference viewport per framing (scripts/capture-tv-stills.mjs), so the page can show the very picture the 3D
 * scene will before any of it has downloaded. Each is placed the way the room frames the TV (room/tv/tvFraming.ts):
 *
 * - `set`: a landscape viewport tall enough for the whole set. The set fills the height whatever the width, so the
 *   still is scaled to the height and centred (it is wide enough to cover 2.37 : 1).
 * - `landscape`: a phone on its side: the picture fills the height between the touch pad's clusters.
 * - `portrait`: the picture spans the width, centred in the height above the touch pad (or the whole height).
 */

export type StillFraming = 'set' | 'landscape' | 'portrait';

export interface TvStill {
  readonly framing: StillFraming;
  /** Under `public/`. */
  readonly url: string;
  /** The viewport it was rendered at, in CSS px. */
  readonly width: number;
  readonly height: number;
  /** The game's picture on it: left, top, right, bottom, in CSS px of that viewport. */
  readonly picture: readonly [number, number, number, number];
  /** The strip along the bottom the touch pad took from the framing (portrait), in CSS px. */
  readonly padInset: number;
}

export const TV_STILLS: Readonly<Record<StillFraming, TvStill>> = {
  set: {
    framing: 'set',
    url: 'startup/tv-desktop.webp',
    width: 1440,
    height: 608,
    picture: [496.34, 88.46, 943.66, 423.74],
    padInset: 0,
  },
  landscape: {
    framing: 'landscape',
    url: 'startup/tv-landscape.webp',
    width: 900,
    height: 390,
    picture: [185.95, 0.39, 707.05, 389.61],
    padInset: 0,
  },
  portrait: {
    framing: 'portrait',
    url: 'startup/tv-portrait.webp',
    width: 390,
    height: 900,
    picture: [0.39, 202.64, 389.61, 495.36],
    padInset: 202,
  },
};

/** The room's rule (tvFraming.ts › MIN_PICTURE_HEIGHT): below this the whole set would show the picture too small. */
const MIN_PICTURE_HEIGHT = 300;

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface StillPlacement {
  readonly still: TvStill;
  /** Where the still's image goes, in CSS px of the viewport. */
  readonly image: Box;
  /** Where the game's picture lands on it. */
  readonly picture: Box;
}

/** The still for a viewport, framed as the room will frame it. */
export function stillFor(viewport: { readonly width: number; readonly height: number }): TvStill {
  if (viewport.width < viewport.height) return TV_STILLS.portrait;
  const set = TV_STILLS.set;
  const pictureShare = (set.picture[3] - set.picture[1]) / set.height;
  return pictureShare * viewport.height >= MIN_PICTURE_HEIGHT ? set : TV_STILLS.landscape;
}

/** Where the still and its picture go on a viewport; `touch`: the touch pad takes the bottom of a portrait one. */
export function placeStill(
  viewport: { readonly width: number; readonly height: number },
  touch: boolean,
): StillPlacement {
  const still = stillFor(viewport);
  const [left, top, right, bottom] = still.picture;
  let scale: number;
  let x: number;
  let y: number;
  if (still.framing === 'portrait') {
    scale = viewport.width / still.width;
    // The picture's middle at the middle of what the pad leaves free, as at the capture.
    const free = viewport.height - (touch ? still.padInset : 0);
    x = 0;
    y = free / 2 - ((top + bottom) / 2) * scale;
  } else {
    // Height-fitted and centred: the set (or, on its side, the picture between the pad's clusters).
    scale = viewport.height / still.height;
    x = (viewport.width - still.width * scale) / 2;
    y = 0;
  }
  return {
    still,
    image: { left: x, top: y, width: still.width * scale, height: still.height * scale },
    picture: {
      left: x + left * scale,
      top: y + top * scale,
      width: (right - left) * scale,
      height: (bottom - top) * scale,
    },
  };
}
