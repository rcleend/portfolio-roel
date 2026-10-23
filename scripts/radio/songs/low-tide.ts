import { bars, fill } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import { foghorn, harbourBell, roundBell, seaFloor, swell, tidePad } from './instruments';

/**
 * Low Tide, by Harbour Lights (placeholder): ambient at 68 bpm in D Lydian, the
 * raised fourth (G♯) left hanging over D. Slow pads, FM bells with long echoes and
 * the sea as filtered noise. Eight tokens a bar: eighth notes.
 */

/** A type, not an interface: `fill` takes it as a plain record of notes. */
type Chord = {
  /** Pad voicing. */
  readonly v: string;
  /** The low sine under it. */
  readonly r: string;
  /** The lighthouse's three-note beam over it. */
  readonly a: string;
  readonly b: string;
  readonly c: string;
};

const chord = (v: string, r: string, beam: string): Chord => {
  const [a = '', b = '', c = ''] = beam.split(' ');
  return { v, r, a, b, c };
};

const Dmaj7 = chord('D3[47b]', 'D2', 'A5 F#5 C#6');
/** E over D: the Lydian colour, G♯ against the D below. */
const EoverD = chord('D3[269]', 'D2', 'G#5 E5 B5');
const Bm7 = chord('B2[37a]', 'B1', 'F#5 D5 A5');
const Fsm7 = chord('F#2[37a]', 'F#1', 'A5 E5 C#6');
const AoverD = chord('D3[7be]', 'D2', 'E5 C#5 A5');

const over = (template: string, chords: readonly Chord[]): string => bars(...chords.map((c) => fill(template, c)));
const pad = 'v . . . . . . .';
const floor = 'r . . . . . . .';

// ── Slow Water ──────────────────────────────────────────────────────────────────

const water = [Dmaj7, Dmaj7, EoverD, EoverD, Bm7, Fsm7, EoverD, EoverD, Dmaj7, AoverD, EoverD, Dmaj7, Dmaj7] as const;

export const slowWater: Song = {
  bpm: 68,
  beatsPerBar: 4,
  echo: { beats: 1, feedback: 0.45, tone: 2200 },
  channels: {
    pad: { patch: tidePad, play: 'chord', echo: 0.15 },
    bell: { patch: harbourBell, echo: 0.55, pan: 0.25 },
    answer: { patch: roundBell, echo: 0.5, pan: -0.3 },
    sea: { patch: swell, pan: -0.15 },
    floor: { patch: seaFloor },
  },
  patterns: {
    water: {
      pad: over(pad, water),
      floor: over(floor, water),
      bell: bars(
        '- . . . . . . .',
        'A5 . . . F#5 . . .',
        'G#5 . . . . . B5 .',
        'E5 . . . . . . .',
        'F#5 . . . D6 . . .',
        'C#6 . . . A5 . . .',
        'B5 . . . G#5 . . .',
        'E5 . . . . . . .',
        'A5 . . . C#6 . . .',
        'E6 . . . . . C#6 .',
        'B5 . . . G#5 . E5 .',
        'F#5 . . . . . . .',
        '. . . . A5 . . .',
      ),
      answer: bars(
        '-',
        '.',
        '-',
        '. . . . D5 . . .',
        '-',
        '. . . . . . E5 .',
        '-',
        '. . . . B4 . . .',
        '-',
        '.',
        '. . . . . . . D5',
        '-',
        'F#4 . . . . . . .',
      ),
      sea: bars(
        'A4 . . . . . - .',
        '-',
        'G4 . . . . . - .',
        '-',
        'A4 . . . . . - .',
        '-',
        'F4 . . . . . - .',
        '-',
        'A4 . . . . . - .',
        '-',
        'G4 . . . . . - .',
        '-',
        'A4 . . . . . . .',
      ),
    },
    // The last bell, high, left to the echo.
    end: {
      pad: 'D3[479b]:8 . . . . . . .',
      floor: 'D2 . . . . . . .',
      bell: 'D6 . . . . . . .',
      answer: '. . . . A4:6 . . .',
      sea: '.',
    },
  },
  sequence: ['water', 'end'],
};

// ── Lighthouse ──────────────────────────────────────────────────────────────────

const coast = [Dmaj7, Dmaj7, Bm7, EoverD, Dmaj7, Fsm7, Bm7, EoverD, AoverD, EoverD, Dmaj7, Dmaj7] as const;
/** The beam sweeping round once a bar: three notes, the echo carries them across. */
const beam = 'a . b . c . . .';

export const lighthouse: Song = {
  bpm: 68,
  echo: { beats: 0.75, feedback: 0.5, tone: 2400 },
  channels: {
    beam: { patch: harbourBell, echo: 0.5, pan: 0.2 },
    tune: { patch: roundBell, echo: 0.45, pan: -0.25 },
    pad: { patch: tidePad, play: 'chord', echo: 0.1 },
    horn: { patch: foghorn, echo: 0.25, pan: -0.1 },
    floor: { patch: seaFloor },
    sea: { patch: swell, pan: 0.2 },
  },
  patterns: {
    coast: {
      // The first bar is the pads alone; the beam comes round from the second.
      beam: bars('-', over(beam, coast.slice(1))),
      pad: over(pad, coast),
      floor: over('r . . . r:5 . . .', coast),
      horn: bars(
        'D2 . . . . . - .',
        '-',
        '.',
        '.',
        'D2 . . . . . - .',
        '-',
        '.',
        '.',
        'D2 . . . . . - .',
        '-',
        '.',
        '.',
      ),
      tune: bars(
        '-',
        '.',
        '.',
        '.',
        'F#5 . . . E5 . D5 .',
        'C#5 . . . . . A4 .',
        'B4 . . . D5 . F#5 .',
        'E5 . . . . . . .',
        'E5 . . . G#5 . . .',
        'B5 . . . A5 . G#5 .',
        'F#5 . . . . . E5 .',
        'D5 . . . . . . .',
      ),
      sea: bars(
        '-',
        'A4 . . . . . - .',
        '-',
        'G4 . . . . . - .',
        '-',
        'A4 . . . . . - .',
        '-',
        'G4 . . . . . - .',
        '-',
        'A4 . . . . . - .',
        '-',
        'F4 . . . . . - .',
      ),
    },
    // The beam passes one last time and the horn answers from far away.
    end: {
      beam: 'A5 . F#5 . D6 . . .',
      pad: 'D3[47be]:7 . . . . . . .',
      floor: 'D2 . . . . . . .',
      horn: '. . . . A1:6 . . .',
      tune: 'A4 . . . . . . .',
      sea: 'A4:6 . . . . . . .',
    },
  },
  sequence: ['coast', 'end'],
};
