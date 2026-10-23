import type { VoiceNote } from '../synth/voiceNote';
import type { CompiledSong, SongEvent } from './song';
import { tickToSeconds } from './timing';

/** A song event placed on the audio clock, ready for the synth. */
export interface ScheduledNote {
  readonly channel: string;
  readonly event: SongEvent;
  readonly note: VoiceNote;
}

export interface SongCursorOptions {
  /** Context time of the song's first tick. */
  readonly startTime: number;
  /** Repeat from the song's loop point. Ignored for one-shot songs. Defaults to true. */
  readonly loop?: boolean;
  /** Events before this time are skipped (joining a song part-way through). */
  readonly notBefore?: number;
}

/**
 * Walks a compiled song along the audio clock, one lookahead window at a
 * time. Pure bookkeeping (no audio nodes), so loop and timing maths are
 * testable on their own.
 *
 * Pass 0 plays the song from the top; every later pass replays the loop
 * section, starting where the previous pass ended.
 */
export class SongCursor {
  readonly #song: CompiledSong;
  readonly #loop: boolean;
  readonly #notBefore: number;
  readonly #loopIndex: number;
  #pass = 0;
  #index = 0;
  #passStart: number;

  constructor(song: CompiledSong, options: SongCursorOptions) {
    this.#song = song;
    this.#loop = (options.loop ?? true) && song.loopTick !== null;
    this.#notBefore = options.notBefore ?? Number.NEGATIVE_INFINITY;
    this.#passStart = options.startTime;
    const loopTick = song.loopTick ?? 0;
    const first = song.events.findIndex((event) => event.tick >= loopTick);
    this.#loopIndex = first === -1 ? song.events.length : first;
  }

  /** Context time at which a non-looping song has played its last tick; `null` while it loops. */
  get endTime(): number | null {
    if (this.#loop) return null;
    return this.#passStart + this.#passSeconds(this.#pass);
  }

  /** Every note starting before `until` that has not been returned yet, in time order. */
  take(until: number): ScheduledNote[] {
    const notes: ScheduledNote[] = [];
    const song = this.#song;
    for (;;) {
      const event = song.events[this.#index];
      if (event) {
        const time = this.#timeOf(event.tick);
        if (time >= until) return notes;
        this.#index++;
        if (time >= this.#notBefore) notes.push(this.#schedule(event, time));
        continue;
      }
      // End of a pass: either stop here or wrap to the loop point.
      const nextStart = this.#passStart + this.#passSeconds(this.#pass);
      if (!this.#loop || nextStart >= until) return notes;
      this.#passStart = nextStart;
      this.#pass++;
      this.#index = this.#loopIndex;
    }
  }

  #firstTick(pass: number): number {
    return pass === 0 ? 0 : (this.#song.loopTick ?? 0);
  }

  #passSeconds(pass: number): number {
    const { timing, totalTicks } = this.#song;
    return tickToSeconds(timing, totalTicks) - tickToSeconds(timing, this.#firstTick(pass));
  }

  #timeOf(tick: number): number {
    const { timing } = this.#song;
    return this.#passStart + tickToSeconds(timing, tick) - tickToSeconds(timing, this.#firstTick(this.#pass));
  }

  #schedule(event: SongEvent, time: number): ScheduledNote {
    const env = event.patch.env;
    const hold = event.oneShot ? env.attack + env.decay : this.#timeOf(event.endTick) - time;
    return {
      channel: event.channel,
      event,
      note: {
        time,
        hold,
        midi: event.midi,
        velocity: event.velocity,
        arpeggio: event.arpeggio,
        chord: event.chord,
        slides: event.slides.map((slide) => ({ after: this.#timeOf(slide.tick) - time, midi: slide.midi })),
      },
    };
  }
}
