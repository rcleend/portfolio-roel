import type { AssetStore } from '@/engine/assets/AssetStore';
import type { Director } from '@/engine/core/Director';
import type { Rng } from '@/engine/math/Rng';
import type { Looks } from './art/looks/Looks';
import type { GameAudio } from './audio/ids';
import type { GameFonts, TextStyles } from './fonts';
import type { Action } from './input/bindings';
import type { LevelArtLibrary } from './levels/art/LevelArt';
import type { GameSceneMap } from './scenes/params';
import type { SessionStore } from './session';

/** User and device preferences that change how scenes present themselves. */
export interface GameSettings {
  /** From `prefers-reduced-motion`: skip full-screen flashes and screen shake. */
  readonly reducedMotion: boolean;
}

/**
 * Everything a scene may use, created once in `createGame` and handed to
 * every scene's constructor. Scenes never reach for globals.
 */
export interface GameServices {
  readonly director: Director<GameSceneMap, Action>;
  readonly audio: GameAudio;
  readonly fonts: GameFonts;
  readonly text: TextStyles;
  /** The art every scene draws heroes, the customer and skills with: one look per piece, loaded at startup. */
  readonly looks: Looks;
  readonly assets: AssetStore;
  /** Parallax planes, tiles and props for every stage, preloaded at startup. */
  readonly levelArt: LevelArtLibrary;
  readonly session: SessionStore;
  /** The game's root random stream; `fork()` it for an independent, reproducible sub-stream. */
  readonly rng: Rng;
  readonly settings: GameSettings;
  /**
   * Leaves the game for a real-world link (e.g. the contact call to action).
   * Supplied by the app so the game never touches `window` directly.
   */
  readonly openLink: (href: string) => void;
}
