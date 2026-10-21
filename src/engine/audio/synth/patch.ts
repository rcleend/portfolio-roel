import type { Envelope } from './envelope';

/**
 * The sound sources of a mid-90s arcade board: the SSG's pulse waves and
 * noise, simple saw/triangle/sine oscillators, and a two-operator FM voice
 * (one sine modulating another) for the bass, brass and bell timbres the
 * YM2610 was known for.
 */
export type Waveform =
  /** `duty` is the high fraction of the cycle: 0.5 is a square, 0.125 the thin nasal pulse. */
  | { readonly type: 'pulse'; readonly duty: number }
  | { readonly type: 'triangle' }
  | { readonly type: 'saw' }
  | { readonly type: 'sine' }
  /**
   * `white` hiss, or `metallic`: a short-period LFSR loop with a pitched,
   * clangy colour (hats, cymbals, coins). Pitch sets the playback rate; A4 is
   * the natural rate.
   */
  | { readonly type: 'noise'; readonly color: 'white' | 'metallic' }
  /**
   * Two-operator FM: a sine carrier at the note frequency, modulated by a sine
   * at `ratio` × that frequency. `index` is the modulation depth (brightness);
   * it moves to `indexTo` over `indexTime` seconds, so brass can bloom and
   * bells can mellow.
   */
  | {
      readonly type: 'fm';
      readonly ratio: number;
      readonly index: number;
      readonly indexTo?: number;
      readonly indexTime?: number;
    };

/** An instrument: everything about how one note sounds, independent of which note it is. */
export interface Patch {
  readonly wave: Waveform;
  readonly env: Envelope;
  /** Linear gain of a full-velocity note. Defaults to 1. */
  readonly gain?: number;
  /** Stereo position, -1 (left) to 1 (right). */
  readonly pan?: number;
  /** Constant detune in cents. */
  readonly detune?: number;
  /** Adds a second oscillator and spreads the pair this many cents apart: a fatter, chorused tone. */
  readonly unison?: number;
  /**
   * Pitch envelope in semitones relative to the note: starts at `from` and
   * moves linearly (in pitch, so exponentially in Hz) to `to` over `time`
   * seconds. Kicks drop from two octaves up; lasers fall; jumps rise.
   */
  readonly sweep?: { readonly from: number; readonly to?: number; readonly time: number };
  /** Delayed vibrato: `depth` cents at `rate` Hz, faded in after `delay` seconds. */
  readonly vibrato?: { readonly rate: number; readonly depth: number; readonly delay?: number };
  /** A resonant filter; when `to` is set its cutoff glides there over `time` seconds after note-on. */
  readonly filter?: {
    readonly type: 'lowpass' | 'highpass' | 'bandpass';
    readonly frequency: number;
    readonly q?: number;
    readonly to?: number;
    readonly time?: number;
  };
  /** Seconds a legato slide takes to reach the new pitch. Defaults to 0.06. */
  readonly glide?: number;
  /** Seconds per arpeggio step. Defaults to 1/30 s, a two-frame chip arpeggio. */
  readonly arpSpeed?: number;
}
