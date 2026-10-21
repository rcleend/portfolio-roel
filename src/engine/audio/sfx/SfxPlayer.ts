import { playVoice } from '../synth/voice';
import { DEFAULT_COOLDOWN, DEFAULT_MAX_INSTANCES, type SfxRecipe, sfxNotes } from './recipe';
import { SfxLimiter } from './SfxLimiter';

/** Simultaneous effects across all ids; beyond this the oldest is cut. */
const POLYPHONY = 12;
/** Fade applied to an instance cut by the limiter, short enough to free the slot, long enough not to click. */
const EVICT_FADE = 0.02;

interface Instance {
  readonly output: GainNode;
}

/** Fires effect recipes into a bus, enforcing cooldowns and polyphony through `SfxLimiter`. */
export class SfxPlayer {
  readonly #context: BaseAudioContext;
  readonly #destination: AudioNode;
  readonly #limiter = new SfxLimiter<Instance>(POLYPHONY);

  constructor(context: BaseAudioContext, destination: AudioNode) {
    this.#context = context;
    this.#destination = destination;
  }

  play(id: string, recipe: SfxRecipe, options: { readonly pan?: number; readonly detune?: number } = {}): void {
    const now = this.#context.currentTime;
    this.prune();
    const evicted = this.#limiter.request(id, now, {
      cooldown: recipe.cooldown ?? DEFAULT_COOLDOWN,
      maxInstances: recipe.maxInstances ?? DEFAULT_MAX_INSTANCES,
    });
    if (!evicted) return;
    for (const instance of evicted) this.#cut(instance, now);

    const output = new GainNode(this.#context, { gain: recipe.gain ?? 1 });
    if (options.pan) {
      output.connect(new StereoPannerNode(this.#context, { pan: options.pan })).connect(this.#destination);
    } else {
      output.connect(this.#destination);
    }
    let end = now;
    for (const { patch, note } of sfxNotes(recipe, now, options.detune ?? 0)) {
      end = Math.max(end, playVoice(this.#context, output, patch, note));
    }
    this.#limiter.add(id, now, end, { output });
  }

  /** Disconnects effects that have finished. Called on every trigger and by the service's clock. */
  prune(): void {
    for (const instance of this.#limiter.prune(this.#context.currentTime)) instance.output.disconnect();
  }

  #cut(instance: Instance, now: number): void {
    const gain = instance.output.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, now + EVICT_FADE);
    // Its voices are still scheduled; leave the faded node connected until they would have ended anyway.
    setTimeout(() => instance.output.disconnect(), (EVICT_FADE + 0.05) * 1000);
  }
}
