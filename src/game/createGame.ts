import { AssetStore } from '@/engine/assets/AssetStore';
import { Director } from '@/engine/core/Director';
import { Game } from '@/engine/core/Game';
import type { GameSurface } from '@/engine/core/GameSurface';
import { createCanvas } from '@/engine/gfx/canvas';
import { GamepadSource } from '@/engine/input/GamepadSource';
import { InputManager } from '@/engine/input/InputManager';
import { Rng } from '@/engine/math/Rng';
import { compileSprites } from './art';
import { createGameAudio } from './audio/createGameAudio';
import type { GameAudio } from './audio/ids';
import { loadFonts } from './fonts';
import { type Action, bindings } from './input/bindings';
import { loadLevelArt } from './levels/art/LevelArt';
import { createSceneFactories } from './scenes';
import type { GameSceneMap } from './scenes/params';
import type { GameServices } from './services';
import { type SessionStorage, SessionStore } from './session';

/** Native resolution: 4:3 with square pixels (docs/ARCHITECTURE.md › Rendering model). */
export const SCREEN_WIDTH = 320;
export const SCREEN_HEIGHT = 240;

export interface CreateGameOptions {
  /** Seed for every random choice; fixed seeds make runs reproducible. */
  readonly seed?: number;
  /** Where progress persists. Defaults to `localStorage`; `null` keeps it in memory. */
  readonly storage?: SessionStorage | null;
  /**
   * Defaults to the WebAudio synthesiser (silent where WebAudio is missing),
   * starting muted or not as the session last left it.
   */
  readonly audio?: GameAudio;
  readonly reducedMotion?: boolean;
  /** Opens a real-world link chosen in-game; defaults to navigating the current tab (mailto-friendly). */
  readonly openLink?: (href: string) => void;
}

export interface CreatedGame {
  readonly game: Game<Action>;
  /** The host-facing view of `game`: all a host may touch. */
  readonly surface: GameSurface;
  readonly services: GameServices;
}

/**
 * Composition root of the game: loads fonts, compiles sprites, wires
 * services and scenes. The game is returned stopped and without a scene;
 * the caller chooses the first scene and calls `game.start()`.
 */
export async function createGame(options: CreateGameOptions = {}): Promise<CreatedGame> {
  const assets = new AssetStore();
  const [{ fonts, styles }, levelArt] = await Promise.all([loadFonts(assets), loadLevelArt(assets)]);

  const session = new SessionStore(options.storage === undefined ? defaultStorage() : options.storage);
  const audio = options.audio ?? defaultAudio(session);

  let services: GameServices | null = null;
  const director = new Director<GameSceneMap, Action>(
    createSceneFactories(() => {
      if (!services) throw new Error('Scenes cannot be created before services are ready');
      return services;
    }),
  );
  services = {
    director,
    audio,
    fonts,
    text: styles,
    sprites: compileSprites(),
    assets,
    levelArt,
    session,
    rng: new Rng(options.seed ?? Date.now()),
    settings: { reducedMotion: options.reducedMotion ?? prefersReducedMotion() },
    openLink: options.openLink ?? defaultOpenLink,
  };

  const canvas = createCanvas(SCREEN_WIDTH, SCREEN_HEIGHT);
  const input = new InputManager<Action>(bindings, { gamepad: new GamepadSource() });
  const game = new Game<Action>({ canvas, input, root: director });
  return { game, surface: game, services };
}

function defaultAudio(session: SessionStore): GameAudio {
  const audio = createGameAudio();
  audio.muted = session.state.muted;
  return audio;
}

function defaultOpenLink(href: string): void {
  window.location.assign(href);
}

function defaultStorage(): SessionStorage | null {
  try {
    return window.localStorage;
  } catch {
    // Some privacy modes throw on access; the session then lives in memory.
    return null;
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
