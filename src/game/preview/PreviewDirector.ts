import { Director, type GoToArgs } from '@/engine/core/Director';
import type { Action } from '../input/bindings';
import type { GameSceneMap, SceneId } from '../scenes/params';

/** A scene and the params it is entered with, e.g. `{ scene: 'title', params: { backdrop: 'classic' } }`. */
export type PreviewSpec = {
  readonly [K in SceneId]: { readonly scene: K; readonly params: GameSceneMap[K] };
}[SceneId];

/** Where a previewed scene asked to go. */
export interface SceneRequest {
  readonly scene: SceneId;
  readonly params: unknown;
}

/**
 * The director of a scene preview: it enters the one scene being previewed
 * and never leaves it. Wherever that scene asks to go (a confirmed title
 * heads for the character select) is recorded instead of followed, so a
 * preview stays on its scene for as long as it is open.
 */
export class PreviewDirector extends Director<GameSceneMap, Action> {
  readonly #requests: SceneRequest[] = [];

  /** Navigation the scene asked for, oldest first. None of it was followed. */
  get requests(): readonly SceneRequest[] {
    return this.#requests;
  }

  /** Enters the previewed scene: the only switch this director ever makes. */
  show(spec: PreviewSpec): void {
    super.goTo(spec.scene, spec.params);
  }

  override goTo<K extends SceneId>(id: K, ...[params]: GoToArgs<GameSceneMap[K]>): void {
    this.#requests.push({ scene: id, params });
  }
}
