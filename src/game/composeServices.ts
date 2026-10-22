import type { Director, SceneFactories } from '@/engine/core/Director';
import type { Action } from './input/bindings';
import { createSceneFactories } from './scenes';
import type { GameSceneMap } from './scenes/params';
import type { GameServices } from './services';

/**
 * Ties services and scenes together. Every scene is constructed with the
 * services, and the services hold the director that constructs the scenes,
 * so the director's factories read the services late: scenes only exist
 * after a `goTo`, by when the services are complete.
 */
export function composeServices<D extends Director<GameSceneMap, Action>>(
  createDirector: (scenes: SceneFactories<GameSceneMap, Action>) => D,
  parts: Omit<GameServices, 'director'>,
): GameServices & { readonly director: D } {
  let services: (GameServices & { readonly director: D }) | null = null;
  const director = createDirector(
    createSceneFactories(() => {
      if (!services) throw new Error('Scenes cannot be created before services are ready');
      return services;
    }),
  );
  services = { ...parts, director };
  return services;
}
