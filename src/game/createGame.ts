import { AssetStore } from '@/engine/assets/AssetStore';
import { NullAudio } from '@/engine/audio/NullAudio';
import { Director } from '@/engine/core/Director';
import { Game } from '@/engine/core/Game';
import type { GameSurface } from '@/engine/core/GameSurface';
import { createCanvas } from '@/engine/gfx/canvas';
import { GamepadSource } from '@/engine/input/GamepadSource';
import { InputManager } from '@/engine/input/InputManager';
import { Rng } from '@/engine/math/Rng';
import { compileSprites } from './art';
import type { GameAudio, MusicId, SfxId } from './audio/ids';
import { loadFonts } from './fonts';
import { type Action, bindings } from './input/bindings';
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
  /** Defaults to silent audio until the synthesiser exists. */
  readonly audio?: GameAudio;
  readonly reducedMotion?: boolean;
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
  const { fonts, styles } = await loadFonts(assets);

  let services: GameServices | null = null;
  const director = new Director<GameSceneMap, Action>(
    createSceneFactories(() => {
      if (!services) throw new Error('Scenes cannot be created before services are ready');
      return services;
    }),
  );
  services = {
    director,
    audio: options.audio ?? new NullAudio<MusicId, SfxId>(),
    fonts,
    text: styles,
    sprites: compileSprites(),
    assets,
    session: new SessionStore(options.storage === undefined ? defaultStorage() : options.storage),
    rng: new Rng(options.seed ?? Date.now()),
    settings: { reducedMotion: options.reducedMotion ?? prefersReducedMotion() },
  };

  const canvas = createCanvas(SCREEN_WIDTH, SCREEN_HEIGHT);
  const input = new InputManager<Action>(bindings, { gamepad: new GamepadSource() });
  const game = new Game<Action>({ canvas, input, root: director });
  return { game, surface: game, services };
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
