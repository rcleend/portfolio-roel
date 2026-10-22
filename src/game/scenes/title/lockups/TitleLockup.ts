import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import type { GlintTarget } from '../glint';
import type { TitleVariant } from '../TitleVariant';

/**
 * A title lockup: the logo lines, the name and the trademark, sliding in as
 * one piece and settling on the backdrop (docs/ARCHITECTURE.md › Title
 * variants). The scene decides when it moves: the slide and its ease, the
 * lock shake, the flash and the glint's timing. The lockup decides how it
 * looks, where it settles and how its parts enter.
 *
 * Add one as a folder beside `classic/`, listed in `lockups/index.ts`.
 */
export interface TitleLockup<Id extends string = string> extends TitleVariant<Id> {
  /**
   * Paints the lockup on the first call and hands out the same art
   * afterwards; wrap the painter in `lazy`. The boot calls this for the
   * default title during its black frames, so do all the heavy work here.
   */
  prepare(): LockupArt;
}

/** A painted lockup, laid out and ready to draw at any point of its slide. */
export interface LockupArt {
  /**
   * Screen box around everything the settled lockup draws (lines, name,
   * trademark, outlines and shadows), so backdrops can keep busy motion out
   * from behind it. It must fit on screen and end above the prompt
   * (`TITLE_LAYOUT.promptY`).
   */
  readonly bounds: Rect;
  /** Where the glint that sweeps the settled lockup may light it. */
  readonly glint: LockupGlint;
  /**
   * Draws the lockup `travel` pixels short of where it settles: from
   * `SLIDE_DISTANCE` as the slide starts down to 0, settled. The classic
   * brings its top word in from the right and its bottom word from the
   * left. The same `travel` always draws the same pixels.
   */
  draw(gfx: Gfx, travel: number): void;
}

/** The letter faces a glint may light, and the row its leaning band pivots on. */
export interface LockupGlint {
  /** Shine images (letter faces in a pale colour), placed where the settled lockup draws those letters. */
  readonly targets: readonly GlintTarget[];
  /** Usually the lowest baseline, so the band leans with the letters' slant. */
  readonly pivotY: number;
}
