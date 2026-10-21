import { parseNote } from '../synth/pitch';

/**
 * Lanes are the tracker rows of one channel, written as text:
 *
 *   'C4 . E4 . | G4 . ~A4 - | C5[47] . . . | k . s:4 .'
 *
 * Bars are separated by `|`. Each bar holds any number of whitespace-separated
 * tokens that divides the bar's ticks evenly, and the tokens share the bar
 * equally: 4 tokens are quarter notes, 8 are eighths, 16 sixteenths, 12 are
 * eighth-note triplets. So every bar can be written at the resolution it needs.
 *
 *   C4  F#3  Bb5   a note (scientific pitch: C4 is middle C)
 *   .              hold: nothing new happens (the previous note keeps sounding, or silence continues)
 *   -              note off: the sounding note is released
 *   ~E4            legato slide: the sounding note glides to E4 instead of retriggering
 *   C4[47]         intervals in hex semitones above the root: an arpeggio (or a chord on chord channels)
 *   C4:6           velocity digit 0–9, mapping to 0.1–1.0; no digit is full velocity
 *   k  s:3         on drum-kit channels, a kit piece by its lowercase name
 */
export type LaneToken =
  | { readonly kind: 'off' }
  | {
      readonly kind: 'note';
      readonly midi: number;
      readonly velocity: number;
      readonly slide: boolean;
      readonly intervals: readonly number[];
    }
  | { readonly kind: 'hit'; readonly piece: string; readonly velocity: number };

export interface LaneStep {
  /** Ticks from the start of the lane. */
  readonly tick: number;
  readonly token: LaneToken;
}

export interface ParsedLane {
  readonly bars: number;
  readonly steps: readonly LaneStep[];
}

export type LaneMode = 'melodic' | 'kit';

export class LaneError extends Error {
  override readonly name = 'LaneError';
}

const NOTE_TOKEN = /^(~?)([A-G][#b]?-?\d)(?:\[([0-9a-f]+)\])?(?::(\d))?$/;
const HIT_TOKEN = /^([a-z][a-z0-9]*)(?::(\d))?$/;

/** Splits and parses a lane. `where` names the lane in error messages (song, pattern, channel). */
export function parseLane(source: string, mode: LaneMode, ticksPerBar: number, where = 'lane'): ParsedLane {
  const bars = source
    .split('|')
    .map((bar) => bar.trim())
    .filter((bar, index, all) => bar !== '' || (index > 0 && index < all.length - 1));
  const steps: LaneStep[] = [];
  bars.forEach((bar, barIndex) => {
    const tokens = bar.split(/\s+/).filter(Boolean);
    if (tokens.length === 0 || ticksPerBar % tokens.length !== 0) {
      throw new LaneError(
        `${where}, bar ${barIndex + 1}: ${tokens.length} tokens do not divide a bar of ${ticksPerBar} ticks ("${bar}")`,
      );
    }
    const ticksPerToken = ticksPerBar / tokens.length;
    tokens.forEach((text, tokenIndex) => {
      if (text === '.') return;
      const token = parseToken(text, mode);
      if (!token) {
        throw new LaneError(`${where}, bar ${barIndex + 1}: cannot read "${text}" as a ${mode} token`);
      }
      steps.push({ tick: barIndex * ticksPerBar + tokenIndex * ticksPerToken, token });
    });
  });
  return { bars: bars.length, steps };
}

/** Parses one token; `null` when it is not valid for the mode. Holds (`.`) are not tokens. */
export function parseToken(text: string, mode: LaneMode): LaneToken | null {
  if (text === '-') return { kind: 'off' };
  if (mode === 'kit') {
    const hit = HIT_TOKEN.exec(text);
    return hit ? { kind: 'hit', piece: hit[1] ?? '', velocity: velocityOf(hit[2]) } : null;
  }
  const match = NOTE_TOKEN.exec(text);
  if (!match) return null;
  const [, slide, name = '', intervals, velocity] = match;
  const midi = parseNote(name);
  if (midi === null) return null;
  return {
    kind: 'note',
    midi,
    velocity: velocityOf(velocity),
    slide: slide === '~',
    intervals: intervals ? [0, ...[...intervals].map((digit) => Number.parseInt(digit, 16))] : [],
  };
}

function velocityOf(digit: string | undefined): number {
  return digit === undefined ? 1 : (Number(digit) + 1) / 10;
}
