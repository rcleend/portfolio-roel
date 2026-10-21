import type { AutomationPoint } from './envelope';
import type { Patch } from './patch';

/** One note handed to the synth, already placed on the audio clock. */
export interface VoiceNote {
  /** Note-on, in audio-context seconds. */
  readonly time: number;
  /** Seconds the note is held before its release starts. */
  readonly hold: number;
  readonly midi: number;
  /** 0–1; scales the patch gain. Defaults to 1. */
  readonly velocity?: number;
  /** Semitone offsets cycled as a chip arpeggio, e.g. `[0, 4, 7]` for a major chord. */
  readonly arpeggio?: readonly number[];
  /** Semitone offsets above `midi` sounded together, e.g. `[0, 3, 7]` for a minor chord. */
  readonly chord?: readonly number[];
  /** Legato slides: `after` seconds into the note, glide (over the patch's glide time) to `midi`. */
  readonly slides?: readonly { readonly after: number; readonly midi: number }[];
  /** Extra detune in cents (sound effects vary repeated plays with it). */
  readonly detune?: number;
}

export const DEFAULT_GLIDE = 0.06;
export const DEFAULT_ARP_SPEED = 1 / 30;
/** Arpeggios longer than this many steps are cut short; no musical note needs more. */
const MAX_ARP_STEPS = 4096;

/**
 * Pitch offset of the voice over time, in cents relative to `note.midi`. The
 * voice feeds this into every oscillator's `detune`, so sweeps, slides and
 * arpeggios move FM operators and unison pairs together.
 */
export function pitchPoints(patch: Patch, note: VoiceNote): AutomationPoint[] {
  const base = (patch.detune ?? 0) + (note.detune ?? 0);
  const start = note.time;
  const arpeggio = note.arpeggio ?? [];
  if (arpeggio.length > 1) {
    const speed = patch.arpSpeed ?? DEFAULT_ARP_SPEED;
    const length = note.hold + patch.env.release;
    const steps = Math.min(MAX_ARP_STEPS, Math.max(1, Math.ceil(length / speed - 1e-9)));
    return Array.from({ length: steps }, (_, step) => ({
      kind: 'set' as const,
      value: base + (arpeggio[step % arpeggio.length] ?? 0) * 100,
      time: start + step * speed,
    }));
  }

  const points: AutomationPoint[] = [];
  let current = base;
  if (patch.sweep) {
    points.push({ kind: 'set', value: base + patch.sweep.from * 100, time: start });
    current = base + (patch.sweep.to ?? 0) * 100;
    points.push({ kind: 'linear', value: current, time: start + patch.sweep.time });
  } else {
    points.push({ kind: 'set', value: base, time: start });
  }
  const glide = patch.glide ?? DEFAULT_GLIDE;
  for (const slide of note.slides ?? []) {
    const from = Math.max(start + slide.after, points.at(-1)?.time ?? start);
    points.push({ kind: 'set', value: current, time: from });
    current = base + (slide.midi - note.midi) * 100;
    points.push({ kind: 'linear', value: current, time: from + glide });
  }
  return points;
}
