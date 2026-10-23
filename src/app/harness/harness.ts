import { transitions } from '@/engine/core/transitions';
import type { CreatedGame } from '@/game/createGame';
import type { Action } from '@/game/input/bindings';
import { isSceneId } from '@/game/scenes';
import type { SceneId } from '@/game/scenes/params';
import type { HarnessConfig } from './config';

type TransitionName = keyof typeof transitions;

/** `window.__arcade`: drive the game from tests, scripts and the dev console. */
export interface ArcadeHarness {
  readonly game: CreatedGame['game'];
  /** Switches scene; params are not type-checked here, so pass what the scene expects. */
  goTo(scene: SceneId, params?: unknown, transition?: TransitionName): void;
  /** Advances exactly `frames` fixed steps and renders. Works while paused. */
  step(frames?: number): void;
  pause(): void;
  resume(): void;
  /** Holds `action` for `frames` steps, then releases it and steps once more (frames + 1 steps in total). */
  press(action: Action, frames?: number): void;
  state(): ArcadeState;
}

export interface ArcadeState {
  readonly scene: SceneId | null;
  readonly transition: string | null;
  readonly frame: number;
  readonly paused: boolean;
  readonly session: unknown;
}

declare global {
  interface Window {
    __arcade?: ArcadeHarness;
    __arcadeReady?: boolean;
  }
}

/** Starts the game in the scene the URL asks for and, if enabled, exposes `window.__arcade`. */
export function startGame(created: CreatedGame, config: HarnessConfig): void {
  const { game } = created;
  goToUnchecked(
    created,
    config.enabled && config.scene ? config.scene : 'boot',
    config.enabled ? config.params : undefined,
  );
  if (config.enabled) window.__arcade = createHarness(created);
  window.__arcadeReady = false;

  if (config.enabled && config.frames !== null) {
    game.pause();
    game.step(config.frames);
  } else {
    game.render();
  }
  game.start();
  // Ready once the browser has painted the requested frame, so screenshots never catch a stale canvas.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.__arcadeReady = true;
    }),
  );
}

function createHarness(created: CreatedGame): ArcadeHarness {
  const { game, services } = created;
  return {
    game,
    goTo: (scene, params, transition) => {
      if (!isSceneId(scene)) throw new Error(`Unknown scene "${String(scene)}"`);
      goToUnchecked(created, scene, params, transition);
    },
    step: (frames = 1) => game.step(frames),
    pause: () => game.pause(),
    resume: () => game.resume(),
    press: (action, frames = 1) => {
      game.input.virtual.press(action);
      game.step(Math.max(1, frames));
      game.input.virtual.release(action);
      game.step(1);
    },
    state: () => ({
      scene: services.director.current,
      transition: services.director.transition?.name ?? null,
      frame: game.frame,
      paused: game.paused,
      session: services.session.state,
    }),
  };
}

/** The harness takes scene params as untyped JSON; each scene is responsible for what it accepts. */
function goToUnchecked({ services }: CreatedGame, scene: SceneId, params: unknown, transition?: TransitionName): void {
  const director = services.director as unknown as {
    goTo(id: SceneId, params: unknown, transition?: ReturnType<(typeof transitions)[TransitionName]>): void;
  };
  director.goTo(scene, params, transition ? transitions[transition]() : undefined);
}
