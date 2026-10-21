import type { CompiledSong } from '../sequencer/song';
import { TrackPlayer } from './TrackPlayer';

export interface DeckPlayOptions {
  readonly loop: boolean;
  /** Seconds for the new track to fade in. */
  readonly fadeIn: number;
  /** Seconds for the outgoing track to fade out while the new one starts. */
  readonly crossfade: number;
  /** Context time of the new track's first tick. */
  readonly startTime: number;
  readonly notBefore?: number;
}

/**
 * Owns the current music track and any tracks still fading out behind it.
 * Requesting the track that is already playing is a no-op, so scenes can
 * call `playMusic` on every entry without restarting the song.
 */
export class MusicDeck {
  readonly #context: BaseAudioContext;
  readonly #destination: AudioNode;
  #current: TrackPlayer | null = null;
  readonly #outgoing = new Set<TrackPlayer>();

  constructor(context: BaseAudioContext, destination: AudioNode) {
    this.#context = context;
    this.#destination = destination;
  }

  get currentId(): string | null {
    return this.#current?.id ?? null;
  }

  play(id: string, song: CompiledSong, options: DeckPlayOptions): void {
    if (this.#current?.id === id && !this.#current.stopping) return;
    this.stop(options.crossfade);
    this.#current = new TrackPlayer(this.#context, this.#destination, id, song, options);
  }

  stop(fadeOut: number): void {
    const current = this.#current;
    if (!current) return;
    current.fadeOut(this.#context.currentTime, fadeOut);
    this.#outgoing.add(current);
    this.#current = null;
  }

  /** Schedules every live track up to `until` and releases the ones that have finished. */
  schedule(until: number): void {
    const now = this.#context.currentTime;
    for (const track of [...this.#outgoing, ...(this.#current ? [this.#current] : [])]) {
      if (track.isFinished(now)) {
        track.dispose();
        this.#outgoing.delete(track);
        if (track === this.#current) this.#current = null;
      } else {
        track.schedule(until);
      }
    }
  }
}
