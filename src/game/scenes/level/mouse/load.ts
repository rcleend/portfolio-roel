import type * as MousePlayModule from './MousePlay';

let loaded: typeof MousePlayModule | null = null;
let loading: Promise<unknown> | null = null;

/**
 * Fetches mouse play (the controller, the route planner and the walker) as its own chunk, off the first load: the
 * mission select asks for it, a level opened directly too, and only a level played with a mouse ever runs it. A failed
 * fetch is forgotten, so the next level asks again; until then a level plays with keys, pad and the strip.
 */
export function preloadMousePlay(): void {
  if (loading) return;
  loading = import('./MousePlay').then(
    (module) => {
      loaded = module;
    },
    () => {
      loading = null;
    },
  );
}

/** The mouse play module once it has arrived, else null. */
export function mousePlayModule(): typeof MousePlayModule | null {
  return loaded;
}
