/**
 * Note names and MIDI numbers. Scientific pitch notation: `C4` is middle C
 * (MIDI 60) and `A4` is 440 Hz. Sharps are written `#`, flats `b`.
 */
export type MidiNote = number;

const NOTE_PATTERN = /^([A-G])([#b]?)(-?\d)$/;
const SEMITONE_OF_LETTER: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parses `C4`, `F#3` or `Bb5` into a MIDI number; returns `null` for anything else. */
export function parseNote(name: string): MidiNote | null {
  const match = NOTE_PATTERN.exec(name);
  if (!match) return null;
  const [, letter = '', accidental = '', octave = ''] = match;
  const semitone = SEMITONE_OF_LETTER[letter];
  if (semitone === undefined) return null;
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (Number(octave) + 1) * 12 + semitone + shift;
}

/** Like `parseNote`, but throws with the offending text: for authored data that must be valid. */
export function note(name: string): MidiNote {
  const midi = parseNote(name);
  if (midi === null) throw new RangeError(`Not a note name: "${name}" (expected e.g. C4, F#3, Bb5)`);
  return midi;
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** The name of a MIDI note, spelled with sharps or flats (to suit the key it is used in). */
export function noteName(midi: MidiNote, spelling: 'sharp' | 'flat' = 'sharp'): string {
  const whole = Math.round(midi);
  const names = spelling === 'sharp' ? SHARP_NAMES : FLAT_NAMES;
  return `${names[((whole % 12) + 12) % 12]}${Math.floor(whole / 12) - 1}`;
}

/** `name` moved by `semitones`, e.g. `transpose('A2', 12)` is `A3`. */
export function transpose(name: string, semitones: number, spelling: 'sharp' | 'flat' = 'sharp'): string {
  return noteName(note(name) + semitones, spelling);
}

/** Equal temperament, A4 = 440 Hz. Fractional notes (for slides and detune) are allowed. */
export function midiToHz(midi: MidiNote): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Pitch ratio for an interval in cents (100 cents = one semitone). */
export function centsToRatio(cents: number): number {
  return 2 ** (cents / 1200);
}
