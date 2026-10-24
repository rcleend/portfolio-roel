import { Mixer } from '@/engine/audio/mix/Mixer';
import { SfxPlayer } from '@/engine/audio/sfx/SfxPlayer';
import { type FoleyCue, foleyId, foleyRecipe } from './foley';

/**
 * Plays the radio's mechanical sounds (SPEC §8.6) in a tiny AudioContext of its own,
 * through the engine's mixer and effects player. Its own because the game's context is
 * suspended whenever the camera leaves the TV, exactly when the radio is in use.
 *
 * Created and resumed inside the first radio gesture (so iOS lets it start), resumed on
 * reaching the radio, and suspended two seconds after leaving it, so it costs nothing
 * while the visitor is elsewhere. Cues that arrive while it is not running are dropped.
 * If it cannot be made, the radio is silent of mechanics and the music is unaffected.
 */
export class FoleyPlayer {
  readonly #create: () => AudioContext;
  #context: AudioContext | null = null;
  #mixer: Mixer | null = null;
  #sfx: SfxPlayer | null = null;
  #failed = false;
  #muted = false;
  #sleep: number | null = null;

  constructor(create: () => AudioContext = () => new AudioContext({ latencyHint: 'interactive' })) {
    this.#create = create;
  }

  /** Make or resume the context. Call it inside a gesture the first time. */
  wake(): void {
    this.#cancelSleep();
    if (this.#failed) return;
    // Before any gesture a context could only start suspended (and the browser would complain): wait for one.
    if (!this.#context && navigator.userActivation?.hasBeenActive === false) return;
    if (!this.#context) {
      try {
        this.#context = this.#create();
        this.#mixer = new Mixer(this.#context);
        this.#mixer.setMuted(this.#muted);
        this.#sfx = new SfxPlayer(this.#context, this.#mixer.sfx);
      } catch (error) {
        this.#failed = true;
        console.warn('The radio plays without its mechanical sounds', error);
        return;
      }
    }
    if (this.#context.state === 'suspended') this.#context.resume().catch(() => undefined);
  }

  /** Suspends the context `ms` from now unless woken again first. */
  sleepSoon(ms: number): void {
    this.#cancelSleep();
    if (!this.#context) return;
    this.#sleep = window.setTimeout(() => {
      this.#sleep = null;
      if (this.#context?.state === 'running') this.#context.suspend().catch(() => undefined);
    }, ms);
  }

  play(cue: FoleyCue, pan = 0, order = 0): void {
    if (this.#context?.state !== 'running' || !this.#sfx) return;
    this.#sfx.play(foleyId(cue, order), foleyRecipe(cue, order), { pan });
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
    this.#mixer?.setMuted(muted);
  }

  dispose(): void {
    this.#cancelSleep();
    this.#context?.close().catch(() => undefined);
    this.#context = null;
    this.#mixer = null;
    this.#sfx = null;
  }

  #cancelSleep(): void {
    if (this.#sleep === null) return;
    window.clearTimeout(this.#sleep);
    this.#sleep = null;
  }
}
