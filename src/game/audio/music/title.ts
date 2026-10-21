import { bars, fill } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import { standardKit } from '../instruments/drums';
import { arpThin, brass, brassStab, fmBass } from '../instruments/patches';

/**
 * Title theme, D minor, 140 bpm: a punchy heroic loop.
 *
 * A two-bar fanfare (played once), then A (i–VI–VII–i, a climbing brass
 * melody over an octave-bouncing FM bass) and B (broader, longer notes that
 * lift through B♭–C–F and land on an A major dominant to throw back to A).
 * Loop: A + B, 16 bars ≈ 27 s.
 */

/** Eighth-note octave bounce on the chord root, the engine of 90s arcade rock. */
const octaves = (low: string, high: string): string => fill('a . b . a . b . a . b . a . b .', { a: low, b: high });

/** Brass chord hits: on the one, the and-of-two, and the four. */
const stabs = (chord: string): string => fill('c . . - . . c . - . . . c . - .', { c: chord });

const rockBeat = 'k . . . s . . . k . k . s . . .';
const rockFill = 'k . . . s . . . k . k . s s:6 s:7 s:8';
const hats = 'h . h:5 . h . h:5 . h . h:5 . h . h:5 .';

const A = {
  lead: bars(
    'D5 . . A4 D5 . F5 . A5 . . . G5 . F5 .',
    'F5 . . D5 F5 . G5 . Bb5 . . . A5 . G5 .',
    'E5 . . C5 E5 . G5 . C6 . . . Bb5 . A5 .',
    'A5 . . . . . . . - . . . D5 . E5 .',
    'F5 . . E5 F5 . A5 . D6 . . . C6 . A5 .',
    'Bb5 . . A5 G5 . F5 . D5 . . . F5 . G5 .',
    'A5 . . G5 E5 . C5 . E5 . G5 . C6 . Bb5 .',
    'A5 . . . E5 . A5 . C#6 . . . A5 . . .',
  ),
  bass: bars(
    octaves('D2', 'D3'),
    octaves('Bb1', 'Bb2'),
    octaves('C2', 'C3'),
    octaves('D2', 'D3'),
    octaves('D2', 'D3'),
    octaves('Bb1', 'Bb2'),
    octaves('C2', 'C3'),
    octaves('A1', 'A2'),
  ),
  stab: bars(
    stabs('D4[37]'),
    stabs('D4[38]'),
    stabs('C4[47]'),
    stabs('D4[37]'),
    stabs('D4[37]'),
    stabs('D4[38]'),
    stabs('C4[47]'),
    stabs('C#4[38]'),
  ),
  drums: bars(rockBeat, rockBeat, rockBeat, rockFill, rockBeat, rockBeat, rockBeat, rockFill),
  hats: bars(hats, hats, hats, hats, hats, hats, hats, hats),
};

const B = {
  lead: bars(
    'D6 . . . . . . . C6 . . . Bb5 . . .',
    'C6 . . . . . . . G5 . . . E5 . . .',
    'F5 . . . A5 . . . C6 . . . A5 . . .',
    'D6 . . . . . . . . . . . - . A5 .',
    'Bb5 . . . A5 . . . G5 . . . D5 . . .',
    'F5 . . . G5 . . . Bb5 . . . D6 . . .',
    'C#6 . . . . . . . E6 . . . . . . .',
    'E6 . . . C#6 . . . A5 . . . E5 . . .',
  ),
  bass: bars(
    octaves('Bb1', 'Bb2'),
    octaves('C2', 'C3'),
    octaves('F2', 'F3'),
    octaves('D2', 'D3'),
    octaves('G1', 'G2'),
    octaves('Bb1', 'Bb2'),
    octaves('A1', 'A2'),
    'A1 . A2 . A1 . A2 . A1 . A2 . A1 A1 A2 A2',
  ),
  arp: bars('D5[38]', 'E5[38]', 'F5[47]', 'D5[37]', 'D5[58]', 'D5[38]', 'E5[59]', 'C#5[38]'),
  stab: bars(
    'D4[38] . . . - . . . . . . . . . . .',
    'C4[47] . . . - . . . . . . . . . . .',
    'C4[59] . . . - . . . . . . . . . . .',
    'D4[37] . . . - . . . . . . . . . . .',
    'D4[58] . . . - . . . . . . . . . . .',
    'D4[38] . . . - . . . . . . . . . . .',
    'C#4[38] . . . - . . . . . . . . . . .',
    stabs('C#4[38]'),
  ),
  drums: bars(
    'x . . . s . . . k . . . s . . .',
    'k . . . s . . . k . k . s . . .',
    'k . . . s . . . k . . . s . . .',
    rockFill,
    'x . . . s . . . k . . . s . . .',
    'k . . . s . . . k . k . s . . .',
    'k . . . s . . . k . k . s . k .',
    'k . s:6 . s:7 . s:8 . s . s s u u t t',
  ),
  hats: bars(hats, hats, hats, hats, hats, hats, hats, 'h . h . h . h . - . . . . . . .'),
};

export const title: Song = {
  bpm: 140,
  gain: 0.79,
  echo: { beats: 0.75, feedback: 0.28 },
  channels: {
    lead: { patch: brass, echo: 0.18 },
    bass: { patch: fmBass },
    stab: { patch: brassStab, play: 'chord', gain: 0.8, pan: -0.2 },
    arp: { patch: arpThin, pan: 0.3, gain: 0.8, echo: 0.3 },
    drums: { kit: standardKit },
    hats: { kit: standardKit, pan: 0.25, gain: 0.8 },
  },
  patterns: {
    fanfare: {
      lead: bars('D5 . . . . . D5 . . . F5 . . . E5 .', 'D5 . . . . . . . . . . . - . A4 .'),
      bass: bars('D2 . . . . . D2 . . . F2 . . . E2 .', 'D2 . . . . . . . . . . . - . . .'),
      stab: bars('D4[37] . . . . . D4[37] . . . F4[47] . . . E4[38] .', 'D4[37c] . . . . . . . . . . . - . . .'),
      drums: bars('x . . . . . k . . . k . . . k .', 'x . . . . . . . s:3 s:4 s:5 s:6 s:7 s:8 s s'),
    },
    A,
    B,
  },
  sequence: ['fanfare', 'A', 'B'],
  loopFrom: 1,
};
