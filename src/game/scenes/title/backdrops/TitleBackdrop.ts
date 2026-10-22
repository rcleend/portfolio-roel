import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import type { Vec2 } from '@/engine/math/Vec2';
import type { TitleVariant } from '../TitleVariant';
import type { TitleBeats } from '../titleTimeline';

/**
 * A title backdrop: everything behind the lockup (the classic's khaki card,
 * fireball and crater), plus an optional layer in front of it for sparks or
 * smoke (docs/ARCHITECTURE.md › Title variants). The scene owns the
 * choreography and hands it over with every frame; a backdrop plays along,
 * beat by beat (`frame.beats`):
 *
 * - The opening hit, at 0: the explosion sounds as every intro run starts,
 *   so land the impact on the first frame, at `frame.impact`, and let it
 *   burn out fast. The classic's fireball is gone by 0.3 s.
 * - Anticipation, until `slideStart`: the aftermath holds the stage
 *   (smoke, embers, a wobbling crater) and builds towards the slide.
 * - The slide, `slideStart` to `slideEnd`: stay calm behind it; the lockup
 *   is the one focal motion (docs/ART-DIRECTION.md › Global rules).
 * - Lock and flash, `slideEnd` to `settled`: the scene shakes the screen
 *   for two frames, backdrop included, and whites it out from `flashStart`.
 *   Whatever should change between the intro and the idle loop can change
 *   under the flash. Never flash or shake yourself.
 * - Settled, from `settled` until the attract loop restarts at 0: a living
 *   idle loop that never jumps and keeps busy motion out of
 *   `frame.lockupBounds`.
 *
 * Under `frame.reducedMotion` the scene skips the flash and the shake: keep
 * the beats but calm the motion, with no strobing and gentle or still loops.
 *
 * Add one as a folder beside `classic/`, listed in `backdrops/index.ts`.
 */
export interface TitleBackdrop<Id extends string = string> extends TitleVariant<Id> {
  /**
   * Paints the static art on the first call and hands out the same art
   * afterwards; wrap the painter in `lazy`. The boot calls this for the
   * default title during its black frames, so paint everything heavy here
   * and keep per-frame drawing cheap. It gets no frame: paint only what
   * every frame shares.
   */
  prepare(): BackdropArt;
}

/**
 * A prepared backdrop. Drawing is a pure function of the frame: the same
 * frame always draws the same pixels and nothing carries over between
 * frames, because a button press jumps the intro straight to `settled` and
 * the attract loop jumps back to 0. Randomness is seeded: `hash2` or
 * `valueNoise` from `art/logos/raster/noise`, or a fresh `Rng` per frame;
 * never `Math.random` or the game's shared `services.rng`.
 */
export interface BackdropArt {
  /** Everything behind the lockup; the scene has cleared the screen to black. */
  drawBehind(gfx: Gfx, frame: TitleFrame): void;
  /** Over the lockup and its glint, under the prompt, the copyright and the flash. */
  drawInFront?(gfx: Gfx, frame: TitleFrame): void;
}

/** Everything a backdrop knows about the frame it draws. */
export interface TitleFrame {
  /** Seconds since this intro run started: 0 is the opening hit, and the attract loop starts it over. */
  readonly time: number;
  /** The scene's beats, `TITLE_TIMES`. */
  readonly beats: TitleBeats;
  /** From `prefers-reduced-motion`: the scene skips the flash and the shake. */
  readonly reducedMotion: boolean;
  /** The native screen, in pixels. */
  readonly screen: { readonly width: number; readonly height: number };
  /** Where the opening hit lands, in screen pixels. */
  readonly impact: Vec2;
  /** Screen box around the settled lockup (`LockupArt.bounds`). */
  readonly lockupBounds: Rect;
}
