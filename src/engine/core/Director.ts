import type { Gfx } from '../gfx/Gfx';
import type { GameCursor } from './GameSurface';
import type { GameRoot, Scene, Step } from './Scene';
import { cut, type Transition, type TransitionPhase } from './transitions';

/** Scene id → params type, e.g. `{ title: void; level: { levelId: LevelId } }`. Interfaces are accepted too. */
export type SceneMap<M = object> = { readonly [K in keyof M]: unknown };

export type SceneFactory<P, A extends string = string> = () => Scene<P, A>;

export type SceneFactories<M extends SceneMap<M>, A extends string = string> = {
  readonly [K in keyof M]: SceneFactory<M[K], A>;
};

/** Params may be omitted only for scenes whose params type is `void`. */
export type GoToArgs<P> = [P] extends [void]
  ? [params?: undefined, transition?: Transition]
  : [params: P, transition?: Transition];

export interface TransitionState {
  readonly name: string;
  readonly phase: TransitionPhase;
  readonly coverage: number;
}

interface Request<M extends SceneMap<M>> {
  readonly id: keyof M & string;
  readonly params: unknown;
  readonly transition: Transition;
}

interface ActiveTransition<M extends SceneMap<M>> {
  readonly transition: Transition;
  readonly request: Request<M>;
  phase: TransitionPhase;
  elapsed: number;
}

/**
 * Owns the active scene and switches between scenes with typed params and an
 * optional overlay transition. While a transition runs, scenes keep animating
 * but receive idle input, so nothing can be triggered twice mid-switch.
 */
export class Director<M extends SceneMap<M>, A extends string = string> implements GameRoot<A> {
  readonly #factories: SceneFactories<M, A>;
  #current: { readonly id: keyof M & string; readonly scene: Scene<unknown, A> } | null = null;
  #transition: ActiveTransition<M> | null = null;
  /** A request made by a scene during its own update; applied once that update returns. */
  #requested: Request<M> | null = null;
  /** A request made while a transition runs; the latest one wins and starts afterwards. */
  #queued: Request<M> | null = null;
  #updating = false;
  readonly #listeners = new Set<(id: keyof M & string) => void>();

  constructor(factories: SceneFactories<M, A>) {
    this.#factories = factories;
  }

  /** Id of the active scene, or `null` before the first `goTo`. */
  get current(): (keyof M & string) | null {
    return this.#current?.id ?? null;
  }

  /** The active scene itself, for development tools; scenes never reach for each other. */
  get scene(): Scene<unknown, A> | null {
    return this.#current?.scene ?? null;
  }

  get transition(): TransitionState | null {
    const active = this.#transition;
    if (!active) return null;
    return { name: active.transition.name, phase: active.phase, coverage: coverageOf(active) };
  }

  /**
   * Switches to `id`. Without a transition this is a cut. Called from a
   * scene's update, the switch happens right after that update returns.
   */
  goTo<K extends keyof M & string>(id: K, ...[params, transition]: GoToArgs<M[K]>): void {
    const request: Request<M> = { id, params, transition: transition ?? cut() };
    if (this.#transition) this.#queued = request;
    else if (this.#updating) this.#requested = request;
    else this.#begin(request);
  }

  /** Notified after every scene switch; returns an unsubscribe function. */
  onSceneChange(listener: (id: keyof M & string) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  update(step: Step<A>): void {
    this.#advanceTransition();
    const scene = this.#current?.scene;
    if (scene) {
      this.#updating = true;
      try {
        scene.update(this.#transition ? { ...step, input: step.input.idle() } : step);
      } finally {
        this.#updating = false;
      }
    }
    const requested = this.#requested;
    const queued = this.#transition ? null : this.#queued;
    if (requested) {
      this.#requested = null;
      this.#begin(requested);
    } else if (queued) {
      this.#queued = null;
      this.#begin(queued);
    }
  }

  /** The active scene's cursor; mid-transition, when nothing can be clicked, the game's hand. */
  cursor(): GameCursor {
    if (this.#transition) return 'hand';
    return this.#current?.scene.cursor?.() ?? 'hand';
  }

  render(gfx: Gfx): void {
    if (this.#current) this.#current.scene.render(gfx);
    else gfx.clear('#000000');
    const active = this.#transition;
    if (active) active.transition.render(gfx, coverageOf(active), active.phase);
  }

  #begin(request: Request<M>): void {
    const { transition } = request;
    if (this.#current && transition.outFrames > 0) {
      this.#transition = { transition, request, phase: 'out', elapsed: 0 };
      return;
    }
    this.#switchTo(request);
    this.#transition = transition.inFrames > 0 ? { transition, request, phase: 'in', elapsed: 0 } : null;
  }

  #advanceTransition(): void {
    const active = this.#transition;
    if (!active) return;
    active.elapsed++;
    if (active.phase === 'out' && active.elapsed >= active.transition.outFrames) {
      this.#switchTo(active.request);
      if (active.transition.inFrames > 0) {
        active.phase = 'in';
        active.elapsed = 0;
      } else {
        this.#transition = null;
      }
    } else if (active.phase === 'in' && active.elapsed >= active.transition.inFrames) {
      this.#transition = null;
    }
  }

  #switchTo(request: Request<M>): void {
    this.#current?.scene.exit();
    const scene = this.#factories[request.id]() as Scene<unknown, A>;
    this.#current = { id: request.id, scene };
    scene.enter(request.params);
    for (const listener of this.#listeners) listener(request.id);
  }
}

function coverageOf(active: Pick<ActiveTransition<object>, 'phase' | 'elapsed' | 'transition'>): number {
  const { phase, elapsed, transition } = active;
  if (phase === 'out') return transition.outFrames === 0 ? 1 : Math.min(1, elapsed / transition.outFrames);
  return transition.inFrames === 0 ? 0 : Math.max(0, 1 - elapsed / transition.inFrames);
}
