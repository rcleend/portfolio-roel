import { envelopeLength } from '../synth/envelope';
import type { Patch } from '../synth/patch';
import { note as parseNoteName } from '../synth/pitch';
import type { VoiceNote } from '../synth/voiceNote';

/**
 * A sound effect: a handful of synth voices placed in time, plus the limits
 * that keep repeated triggers (a typewriter, a flurry of hits) from piling up.
 */
export interface SfxRecipe {
  readonly voices: readonly SfxVoice[];
  /** Linear gain for the whole effect. Defaults to 1. */
  readonly gain?: number;
  /** Minimum seconds between two starts; triggers inside the window are dropped. Defaults to 0.03. */
  readonly cooldown?: number;
  /** Most overlapping instances of this effect; the oldest is cut for a new one. Defaults to 3. */
  readonly maxInstances?: number;
}

export interface SfxVoice {
  readonly patch: Patch;
  readonly note: string;
  /** Seconds after the trigger. Defaults to 0. */
  readonly at?: number;
  /** Seconds held before release. */
  readonly hold: number;
  readonly velocity?: number;
  readonly arpeggio?: readonly number[];
  readonly chord?: readonly number[];
  /** Legato glides to other notes, `after` seconds into this voice. */
  readonly slides?: readonly { readonly after: number; readonly note: string }[];
}

export const DEFAULT_COOLDOWN = 0.03;
export const DEFAULT_MAX_INSTANCES = 3;

/** Seconds from trigger until the last voice has fully released. */
export function sfxLength(recipe: SfxRecipe): number {
  return Math.max(0, ...recipe.voices.map((voice) => (voice.at ?? 0) + envelopeLength(voice.patch.env, voice.hold)));
}

/** The recipe's voices as synth notes triggered at `time`, optionally detuned. */
export function sfxNotes(recipe: SfxRecipe, time: number, detune = 0): { patch: Patch; note: VoiceNote }[] {
  return recipe.voices.map((voice) => ({
    patch: voice.patch,
    note: {
      time: time + (voice.at ?? 0),
      hold: voice.hold,
      midi: parseNoteName(voice.note),
      velocity: voice.velocity ?? 1,
      detune,
      ...(voice.arpeggio ? { arpeggio: voice.arpeggio } : {}),
      ...(voice.chord ? { chord: voice.chord } : {}),
      ...(voice.slides
        ? { slides: voice.slides.map((slide) => ({ after: slide.after, midi: parseNoteName(slide.note) })) }
        : {}),
    },
  }));
}

/**
 * A quick melodic figure: one voice per note, `step` seconds apart, each held
 * `hold` seconds (defaults to `step`). `velocities` shapes the phrase.
 *
 *   melody(chime, 'C6 E6 G6 C7', { step: 0.06 })
 */
export function melody(
  patch: Patch,
  notes: string,
  options: {
    readonly step: number;
    readonly hold?: number;
    readonly at?: number;
    readonly velocities?: readonly number[];
  },
): SfxVoice[] {
  return notes
    .split(/\s+/)
    .filter(Boolean)
    .map((name, index) => ({
      patch,
      note: name,
      at: (options.at ?? 0) + index * options.step,
      hold: options.hold ?? options.step,
      velocity: options.velocities?.[index] ?? 1,
    }));
}
