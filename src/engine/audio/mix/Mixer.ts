import { softClipCurve } from './softClip';

export interface MixLevels {
  readonly music: number;
  readonly sfx: number;
  readonly master: number;
}

/** Music sits under the effects so feedback sounds stay readable over any track. */
export const DEFAULT_MIX: MixLevels = { music: 0.55, sfx: 0.7, master: 0.9 };

/** Ramp time for mute changes: fast, but long enough not to click. */
const MUTE_RAMP = 0.03;

/**
 * The master bus:
 *
 *   music bus ─┐
 *              ├→ master → compressor → soft clipper → mute → destination
 *   sfx bus  ──┘
 *
 * The compressor is gentle glue that evens out sudden pile-ups; the clipper
 * is a safety net that keeps the output below 0 dBFS whatever happens.
 */
export class Mixer {
  readonly music: GainNode;
  readonly sfx: GainNode;
  readonly #mute: GainNode;
  readonly #context: BaseAudioContext;
  #muted = false;

  constructor(context: BaseAudioContext, destination: AudioNode = context.destination, levels = DEFAULT_MIX) {
    this.#context = context;
    this.music = gain(context, levels.music);
    this.sfx = gain(context, levels.sfx);
    const master = gain(context, levels.master);
    const compressor = new DynamicsCompressorNode(context, {
      threshold: -14,
      knee: 12,
      ratio: 3,
      attack: 0.004,
      release: 0.2,
    });
    const clipper = new WaveShaperNode(context, { curve: softClipCurve() });
    this.#mute = gain(context, 1);
    this.music.connect(master);
    this.sfx.connect(master);
    master.connect(compressor).connect(clipper).connect(this.#mute).connect(destination);
  }

  get muted(): boolean {
    return this.#muted;
  }

  setMuted(muted: boolean): void {
    if (muted === this.#muted) return;
    this.#muted = muted;
    const now = this.#context.currentTime;
    this.#mute.gain.cancelScheduledValues(now);
    this.#mute.gain.setValueAtTime(this.#mute.gain.value, now);
    this.#mute.gain.linearRampToValueAtTime(muted ? 0 : 1, now + MUTE_RAMP);
  }

  /** Also feeds the final output to `node` (a meter or scope). Returns the disconnect. */
  connectMonitor(node: AudioNode): () => void {
    this.#mute.connect(node);
    return () => this.#mute.disconnect(node);
  }
}

function gain(context: BaseAudioContext, value: number): GainNode {
  return new GainNode(context, { gain: value });
}
