import type { SfxId } from '../audio/ids';
import type { Effect } from '../entities/effects/Effect';
import { EffectsLayer } from '../entities/effects/Effect';
import type { WorldEvent } from './events';

/**
 * Everything the world reports instead of doing itself: events for the
 * scene (sound, overlays, flow), purely visual effects, and the full-screen
 * flash. Keeping these in one place keeps the simulation free of
 * presentation concerns.
 */
export class Feedback {
  readonly effects = new EffectsLayer();
  #events: WorldEvent[] = [];
  #flash: { readonly color: string; readonly until: number } | null = null;

  emit(event: WorldEvent): void {
    this.#events.push(event);
  }

  sfx(id: SfxId): void {
    this.#events.push({ kind: 'sfx', id });
  }

  effect(effect: Effect): void {
    this.effects.add(effect);
  }

  flash(color: string, until: number): void {
    this.#flash = { color, until };
  }

  flashColor(time: number): string | null {
    return this.#flash && time < this.#flash.until ? this.#flash.color : null;
  }

  /** Returns and clears the events since the last drain. */
  drain(): WorldEvent[] {
    const events = this.#events;
    this.#events = [];
    return events;
  }
}
