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
  /** How the pointer over the picture should look now; a scene without one shows the game's hand. */
  cursor?(): GameCursor;
}

/** Anything the game loop can drive: usually a `Director`. */
export interface GameRoot<A extends string = string> {
  update(step: Step<A>): void;
  render(gfx: Gfx): void;
  /** The cursor over the picture; the game's hand when left out. */
  cursor?(): GameCursor;
}
