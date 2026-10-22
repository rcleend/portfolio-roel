import type { MusicOptions, SfxOptions } from '@/engine/audio/AudioService';
import type { GameAudio, MusicId, SfxId } from '../audio/ids';

/**
 * A preview's sound, passed on to `output`. Seeking re-runs frames that are
 * history by the time they are simulated, so the effects passed on the way
 * are dropped; music is a state rather than a moment, so whatever the scene
 * asks to hear still follows it.
 */
export class PreviewAudio implements GameAudio {
  readonly #output: GameAudio;
  #catchingUp = false;

  constructor(output: GameAudio) {
    this.#output = output;
  }

  get muted(): boolean {
    return this.#output.muted;
  }

  set muted(muted: boolean) {
    this.#output.muted = muted;
  }

  /** Runs `simulate`, which replays frames that already happened, with its sound effects dropped. */
  catchUp<T>(simulate: () => T): T {
    const outer = this.#catchingUp;
    this.#catchingUp = true;
    try {
      return simulate();
    } finally {
      this.#catchingUp = outer;
    }
  }

  unlock(): Promise<void> {
    return this.#output.unlock();
  }

  playMusic(id: MusicId, options?: MusicOptions): void {
    this.#output.playMusic(id, options);
  }

  stopMusic(options?: { readonly fadeOutMs?: number }): void {
    this.#output.stopMusic(options);
  }

  playSfx(id: SfxId, options?: SfxOptions): void {
    if (!this.#catchingUp) this.#output.playSfx(id, options);
  }

  setPaused(paused: boolean): void {
    this.#output.setPaused(paused);
  }
}
