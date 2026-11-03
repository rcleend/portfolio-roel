import type { Gfx } from '../gfx/Gfx';
import type { InputSnapshot } from '../input/InputSnapshot';
import type { GameCursor } from './GameSurface';

/** One fixed 60 Hz simulation step. */
export interface Step<A extends string = string> {
  /** Seconds per step; always 1/60. Scenes accumulate it into their own clock. */
  readonly dt: number;
  /** Steps since the game started; useful for frame-exact blinking and logging. */
  readonly frame: number;
  readonly input: InputSnapshot<A>;
}

/**
 * A screen of the game. Created fresh by the director every time it is
 * entered, so a scene never has to reset itself.
 */
export interface Scene<P = void, A extends string = string> {
  /** Becomes active with its parameters. */
  enter(params: P): void;
  /** Releases anything that outlives the scene (listeners, music). */
  exit(): void;
  /** Advances state by one fixed step. */
  update(step: Step<A>): void;
  /** Draws the current state. Must not mutate state, so a frame can be re-rendered at any time. */
  render(gfx: Gfx): void;
  /**
   * A cursor of the scene's own over the picture (a level's play cursors); undefined, or a scene without one, and the
   * game's hand shows over whatever the step's hit tests reported clickable (`InputSnapshot.clickable`), its arrow
   * elsewhere.
   */
  cursor?(): GameCursor | undefined;
}

/** Anything the game loop can drive: usually a `Director`. */
export interface GameRoot<A extends string = string> {
  update(step: Step<A>): void;
  render(gfx: Gfx): void;
  /** The scene's own cursor over the picture, if it names one (`Scene.cursor`). */
  cursor?(): GameCursor | undefined;
}
