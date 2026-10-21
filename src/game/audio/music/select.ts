import { bars, fill, repeat } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import { standardKit } from '../instruments/drums';
import { bell, fmBass, squarePluck } from '../instruments/patches';

/**
 * Character select, F major, 126 bpm with a light shuffle: bouncy and
 * friendly while the player browses.
 *
 * Root–fifth bass on the beat, off-beat chord plucks (a ska bounce), and a
 * plucked square melody. A walks I–vi–ii–V twice; B moves to B♭–C–Am–Dm and
 * hands a bell counter-line the spotlight. Loop: 16 bars ≈ 30 s.
 */

/** Root on one and three, fifth on two and four, with an eighth pickup. */
const bounce = (root: string, fifth: string, pickup: string): string =>
  fill('r . . . f . . r . . . . f . p .', { r: root, f: fifth, p: pickup });

/** Off-beat chord plucks. */
const upbeats = (chord: string): string => fill('. . c - . . c - . . c - . . c -', { c: chord });

const beat = 'k . . . s . . . k . . k s . . .';
const hats = 'h . h:4 h:6 h . h:4 h:6 h . h:4 h:6 h . h:4 h:6';

const A = {
  lead: bars(
    'C5 . A4 . C5 . F5 . . . E5 . F5 . A5 .',
    'G5 . F5 . D5 . . . . . F5 . A5 . . .',
    'Bb5 . A5 . G5 . D5 . . . G5 . Bb5 . D6 .',
    'C6 . . . Bb5 . . . G5 . E5 . C5 . . .',
    'C5 . A4 . C5 . F5 . . . E5 . F5 . A5 .',
    'G5 . F5 . D5 . . . . . F5 . A5 . D6 .',
    'C6 . Bb5 . A5 . F5 . . . G5 . A5 . Bb5 .',
    'G5 . . . E5 . . . C5 . . . - . . .',
  ),
  bass: bars(
    bounce('F2', 'C3', 'E2'),
    bounce('D2', 'A2', 'C2'),
    bounce('G2', 'D3', 'A2'),
    bounce('C2', 'G2', 'E2'),
    bounce('F2', 'C3', 'E2'),
    bounce('D2', 'A2', 'C2'),
    bounce('Bb1', 'F2', 'A1'),
    bounce('C2', 'G2', 'E2'),
  ),
  chords: bars(
    upbeats('A4[38]'),
    upbeats('A4[58]'),
    upbeats('Bb4[49]'),
    upbeats('G4[59]'),
    upbeats('A4[38]'),
    upbeats('A4[58]'),
    upbeats('Bb4[47]'),
    upbeats('G4[59]'),
  ),
  drums: bars(repeat(beat, 7), 'k . . . s . . . k . s:5 . s s:6 s:7 s:8'),
  hats: repeat(hats, 8),
};

const B = {
  lead: bars(
    'D6 . . . C6 . Bb5 . . . F5 . . . - .',
    'E6 . . . D6 . C6 . . . G5 . . . - .',
    'C6 . . . B5 . A5 . . . E5 . . . A5 .',
    'F5 . . . E5 . D5 . . . A4 . . . - .',
    'Bb5 . A5 . G5 . A5 . Bb5 . . . D6 . . .',
    'C6 . Bb5 . A5 . G5 . A5 . . . E5 . . .',
    'F5 . . . A5 . . . C6 . . . F6 . . .',
    'E6 . . . D6 . . . C6 . . . Bb5 . G5 .',
  ),
  bell: bars(
    '. . . . . . . . . . . . F5 . D5 .',
    '. . . . . . . . . . . . G5 . E5 .',
    '. . . . . . . . . . . . A5 . E5 .',
    '. . . . . . . . . . . . D5 . F5 .',
    '- . . . . . . . . . . . . . . .',
    '. . . . . . . . . . . . . . . .',
    'A5 . C6 . F6 . C6 . A5 . C6 . F6 . C6 .',
    'G5 . C6 . E6 . C6 . G5 . Bb5 . E6 . . .',
  ),
  bass: bars(
    bounce('Bb1', 'F2', 'A1'),
    bounce('C2', 'G2', 'B1'),
    bounce('A1', 'E2', 'G#1'),
    bounce('D2', 'A2', 'C2'),
    bounce('G2', 'D3', 'F2'),
    bounce('C2', 'G2', 'E2'),
    bounce('F2', 'C3', 'A2'),
    bounce('C2', 'G2', 'E2'),
  ),
  chords: bars(
    upbeats('Bb4[47]'),
    upbeats('G4[59]'),
    upbeats('A4[37]'),
    upbeats('A4[58]'),
    upbeats('Bb4[49]'),
    upbeats('G4[59]'),
    upbeats('A4[38]'),
    upbeats('Bb4[26]'),
  ),
  drums: bars(repeat(beat, 7), 'k . . . s . . . k . k . s . s:6 s:8'),
  hats: repeat(hats, 8),
};

export const select: Song = {
  bpm: 126,
  swing: 0.12,
  gain: 1,
  echo: { beats: 0.5, feedback: 0.25 },
  channels: {
    lead: { patch: squarePluck, echo: 0.2 },
    bell: { patch: bell, pan: 0.35, echo: 0.3, gain: 0.9 },
    bass: { patch: fmBass, gain: 0.9 },
    chords: {
      patch: { ...squarePluck, wave: { type: 'pulse', duty: 0.25 }, gain: 0.2 },
      play: 'chord',
      pan: -0.3,
    },
    drums: { kit: standardKit, gain: 0.9 },
    hats: { kit: standardKit, pan: 0.2, gain: 0.7 },
  },
  patterns: { A, B },
  sequence: ['A', 'B'],
  loopFrom: 0,
};
