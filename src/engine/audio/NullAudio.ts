import type { AudioService, MusicOptions, SfxOptions } from './AudioService';

/**
 * Silent `AudioService`: used in tests, headless screenshots and until the
 * synthesiser lands. Records the last calls so tests can assert on cues.
 */
export class NullAudio<MusicId extends string = string, SfxId extends string = string>
  implements AudioService<MusicId, SfxId>
{
  muted = false;
  paused = false;
  currentMusic: MusicId | null = null;
  readonly playedSfx: SfxId[] = [];

  async unlock(): Promise<void> {}

  playMusic(id: MusicId, _options?: MusicOptions): void {
    this.currentMusic = id;
  }

  stopMusic(_options?: { readonly fadeOutMs?: number }): void {
    this.currentMusic = null;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  playSfx(id: SfxId, _options?: SfxOptions): void {
    // Bounded so a long-running session with NullAudio cannot leak memory.
    if (this.playedSfx.length >= 64) this.playedSfx.shift();
    this.playedSfx.push(id);
  }
}
