/**
 * How the bake's units are sized and spaced (docs/ROOM.md › The generated room › Pacing), as plain arithmetic: what
 * `GeneratedRoom` asks before each unit, kept apart from the WebGL calls so it can be tested without a GPU.
 */

/** A piece that takes the GPU longer than this cannot hide between a playing game's frames (ms). */
export const PIECE_GPU_LIMIT_MS = 5;
/** Behind the room's frames the bake takes at most this share of the GPU, once a single piece is over the limit. */
export const STRAINED_SHARE = 0.25;
/** The longest the bake rests between two units, however slow a piece was measured (ms). */
export const MAX_GAP_MS = 100;
/** A frame of the room that came later than this after the one before it was late (ms): a 60 Hz frame and a fifth. */
export const LATE_FRAME_MS = 20;
/** The same for frames that are meant to come `expectedMs` apart: a fifth over. */
const LATE = LATE_FRAME_MS / (1000 / 60);
/** The least of a unit's GPU time the bake keeps while the room's frames are late. */
export const LEAST_SHARE = 1 / 8;

/**
 * The opening view's pass may take a GPU this long (ms); one whose first views say it will take longer bakes the
 * shorter profile (the lowest tier's sample counts and shadow map), about half the work.
 */
export const OPENING_BUDGET_MS = 800;
/** Units timed before the bake's length is judged; the first also uploads its buffers. */
export const PROBE_UNITS = 5;

/**
 * What a piece of the bake (one draw of a view: its shadow map, a page's light, the vertices' light) costs this GPU,
 * from the units timed so far. A reading can only be too long (a frame's work was on the GPU ahead of the unit, the
 * look at its fence came late), never too short: behind the room's frames the estimate is the smallest of the last
 * three, so one unit that queued behind a frame does not shrink the next, and only three slow ones in a row say the
 * GPU is that slow. With nothing else drawing (the opening view's pass, a visitor waiting) it is the latest reading.
 */
export class BakePace {
  /** The last three readings (ms a piece), the newest last; before any, the guess. */
  private readings: number[] = [];
  /** The part of a paced unit's GPU time the bake takes: all of it while the room's frames are on time. */
  private share = 1;

  /** `guessMs`: what a piece is taken to cost until one has been timed; under the limit, or no unit would fit. */
  constructor(guessMs: number) {
    this.reset(guessMs);
  }

  /** Forgets the readings: the next pass's pieces are other draws. */
  reset(guessMs: number): void {
    this.readings = [guessMs];
  }

  /** A unit of `pieces` pieces took the GPU `gpuMs` (a timer's result, or the wait for its fence). */
  read(gpuMs: number, pieces: number): void {
    this.readings = [...this.readings.slice(-2), gpuMs / pieces];
  }

  /**
   * A frame of the room came `ms` after the one before it while the bake goes between them. A late one halves what the
   * bake's units take, down to `LEAST_SHARE`, and rests it longer between them; frames on time give it back a tenth at
   * a time. Whatever makes the frames late (the bake's own work, or a device that cannot hold sixty anyway), a game
   * being played comes first and the rest of the room later. `expectedMs`: what frames are meant to come at here, a
   * 60 Hz frame unless the display ticks slower: where it hands out thirty a second (Safari in Low Power Mode) every
   * frame came "late", and the rest of the room was baked at an eighth of the pace for as long as the game was on.
   */
  frame(ms: number, expectedMs = 1000 / 60): void {
    this.share = ms > expectedMs * LATE ? Math.max(LEAST_SHARE, this.share / 2) : Math.min(1, this.share * 1.1);
  }

  /** What a piece costs: `paced`, the smallest of the last readings; otherwise the latest. */
  pieceMs(paced: boolean): number {
    return paced ? Math.min(...this.readings) : (this.readings[this.readings.length - 1] as number);
  }

  /**
   * The pieces of the next unit: as many as fit `targetMs` of GPU time, at most `most`, and always `least` (one piece
   * behind the room's frames, a whole view otherwise), so the bake goes on however slow the GPU.
   */
  pieces(targetMs: number, most: number, least: number, paced: boolean): number {
    return Math.max(least, Math.floor(Math.min(most, (targetMs * (paced ? this.share : 1)) / this.pieceMs(paced))));
  }

  /**
   * How long the bake rests after a paced unit before the next (ms): nothing while its pieces fit between frames; once
   * one piece alone is over the limit (three units in a row said so), long enough to leave the frames their share of
   * the GPU, and never longer than `MAX_GAP_MS`, so the rest of the room always arrives. While the room's frames are
   * late it rests too, the longer the less it may take (`frame`).
   */
  gapMs(): number {
    const each = this.pieceMs(true);
    const strained = each > PIECE_GPU_LIMIT_MS ? each * (1 / STRAINED_SHARE - 1) : 0;
    return Math.min(MAX_GAP_MS, Math.max(strained, MAX_GAP_MS * (1 - this.share)));
  }
}

/** Whether a pass of `views` views at `msAView` each would keep a visitor waiting for the room longer than it may. */
export function overBudget(msAView: number, views: number): boolean {
  return msAView * views > OPENING_BUDGET_MS;
}

/** A page is composed in this many slices of about the same texel area: pieces a unit of the bake can count. */
export const COMPOSE_SLICES_A_PAGE = 16;

/**
 * Cuts a page's charts (triangles, three vertices each, at `clip`: their place on the page as x, y pairs) into at
 * most `slices` runs of vertices of about the same area, in the order they are drawn. Composing a page is the
 * bake's largest draw (every texel's surface, once): in one piece it is on the GPU for as long as a hundred of its
 * other pieces and no frame gets past it; a slice at a time it goes between frames like the rest. A page without
 * charts is one empty slice (it is still cleared).
 */
export function composeSlices(
  clip: ArrayLike<number>,
  slices = COMPOSE_SLICES_A_PAGE,
): { start: number; count: number }[] {
  const triangles = Math.floor(clip.length / 6);
  const areas = new Float64Array(triangles);
  let total = 0;
  for (let t = 0; t < triangles; t++) {
    const i = t * 6;
    const [ax, ay, bx, by, cx, cy] = [0, 1, 2, 3, 4, 5].map((k) => clip[i + k] as number) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    areas[t] = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    total += areas[t] as number;
  }
  const each = total / Math.max(1, slices);
  const cut: { start: number; count: number }[] = [];
  let first = 0;
  let sum = 0;
  for (let t = 0; t < triangles; t++) {
    sum += areas[t] as number;
    if (sum < each || cut.length >= slices - 1) continue;
    cut.push({ start: first * 3, count: (t + 1 - first) * 3 });
    first = t + 1;
    sum = 0;
  }
  if (first < triangles || cut.length === 0) cut.push({ start: first * 3, count: (triangles - first) * 3 });
  return cut;
}
