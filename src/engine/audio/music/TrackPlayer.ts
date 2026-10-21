import { createEcho } from '../mix/echo';
import { SongCursor } from '../sequencer/SongCursor';
import type { CompiledSong } from '../sequencer/song';
import { playVoice } from '../synth/voice';

export interface TrackOptions {
  /** Context time of the first tick. */
  readonly startTime: number;
  readonly loop: boolean;
  /** Seconds to fade in from silence; 0 starts at full level. */
  readonly fadeIn: number;
  /** Skip notes before this time (joining a song part-way through). */
  readonly notBefore?: number;
}

/** Shortest fade, so that even an "instant" start or stop never clicks. */
export const MIN_FADE = 0.015;

/**
 * One playing song: its cursor, its channel strips and a track gain used for
 * fades. Notes are handed to the synth only as far ahead as `schedule` is
 * asked, so stopping or crossfading never has to cancel a long queue.
 *
 *   voices → channel gain → channel pan → track gain → destination
 *                └─ echo send ─→ echo ──────┘
 */
export class TrackPlayer {
  readonly id: string;
  readonly #context: BaseAudioContext;
  readonly #song: CompiledSong;
  readonly #cursor: SongCursor;
  readonly #output: GainNode;
  readonly #channels = new Map<string, AudioNode>();
  readonly #echo: AudioNode | null;
  #stopAt: number | null = null;

  constructor(
    context: BaseAudioContext,
    destination: AudioNode,
    id: string,
    song: CompiledSong,
    options: TrackOptions,
  ) {
    this.id = id;
    this.#context = context;
    this.#song = song;
    this.#cursor = new SongCursor(song, {
      startTime: options.startTime,
      loop: options.loop,
      ...(options.notBefore === undefined ? {} : { notBefore: options.notBefore }),
    });
    this.#output = new GainNode(context, { gain: 0 });
    const fadeEnd =
      Math.max(options.notBefore ?? options.startTime, options.startTime) + Math.max(options.fadeIn, MIN_FADE);
    this.#output.gain.setValueAtTime(0, context.currentTime);
    this.#output.gain.linearRampToValueAtTime(song.gain, fadeEnd);
    this.#output.connect(destination);
    this.#echo = song.echo ? createEcho(context, song.echo, song.bpm, this.#output) : null;
  }

  /** True once `fadeOut` has been called. */
  get stopping(): boolean {
    return this.#stopAt !== null;
  }

  /** Hands every note starting before `until` to the synth. */
  schedule(until: number): void {
    const limit = this.#stopAt === null ? until : Math.min(until, this.#stopAt);
    for (const { channel, event, note } of this.#cursor.take(limit)) {
      playVoice(this.#context, this.#channel(channel), event.patch, note);
    }
  }

  /** Fades to silence over `seconds` from `now`; the track then counts as finished. */
  fadeOut(now: number, seconds: number): void {
    if (this.#stopAt !== null && this.#stopAt <= now + seconds) return;
    const end = now + Math.max(seconds, MIN_FADE);
    const gain = this.#output.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(0, end);
    this.#stopAt = end;
  }

  /** Whether nothing more can be heard: faded out, or a one-shot that has rung out. */
  isFinished(now: number): boolean {
    if (this.#stopAt !== null) return now >= this.#stopAt;
    const end = this.#cursor.endTime;
    return end !== null && now >= end + this.#song.tail;
  }

  /** Detaches the track's whole graph, including the echo's feedback loop, so it can be collected. */
  dispose(): void {
    for (const strip of this.#channels.values()) strip.disconnect();
    this.#echo?.disconnect();
    this.#output.disconnect();
  }

  #channel(id: string): AudioNode {
    const existing = this.#channels.get(id);
    if (existing) return existing;
    const mix = this.#song.channels.find((channel) => channel.id === id);
    const strip = new GainNode(this.#context, { gain: mix?.gain ?? 1 });
    const pan = new StereoPannerNode(this.#context, { pan: mix?.pan ?? 0 });
    strip.connect(pan).connect(this.#output);
    if (this.#echo && mix && mix.echo > 0)
      strip.connect(new GainNode(this.#context, { gain: mix.echo })).connect(this.#echo);
    this.#channels.set(id, strip);
    return strip;
  }
}
