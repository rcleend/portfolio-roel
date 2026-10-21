import { bars, fill, repeat } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import { standardKit } from '../instruments/drums';
import { bell, fmBass, pad, subBass, thinLead } from '../instruments/patches';

/**
 * Mission select, A minor, 100 bpm: a briefing-room tension loop.
 *
 * A pulsing sixteenth-note bass ostinato and a quiet military snare keep the
 * clock ticking; a sonar-like bell pings through the echo; a thin pulse
 * melody moves in long, held notes. A climbs i–VI–iv–V (with the raised G♯
 * of harmonic minor); B leans on the Phrygian B♭ for an uneasy edge.
 * Loop: 16 bars ≈ 38 s.
 */

/** Pulsing ostinato: low root with octave jumps, never quite settling. */
const ostinato = (low: string, high: string): string =>
  fill('l l:5 h l:6 l:5 l h l:5 l l:5 h l:6 l:5 l h l:6', { l: low, h: high });

/** Two sonar pings per bar, the second answering a fifth or octave above. */
const pings = (first: string, second: string): string =>
  fill('a . . . . . . . . . . . b . . .', { a: first, b: second });

const march = 's:4 . s:2 s:2 s:6 . s:2 . s:4 . s:2 s:2 s:6 s:2 s:3 s:4';
const marchKick = 'k . . . . . . . k:7 . . . . . . .';

const A = {
  lead: bars(
    'E5 . . . . . . . . . . . D5 . C5 .',
    'B4 . . . . . . . A4 . . . . . . .',
    'C5 . . . . . . . . . . . A4 . C5 .',
    'F5 . . . . . . . E5 . . . . . . .',
    'D5 . . . . . . . . . . . F5 . A5 .',
    'G5 . . . F5 . . . E5 . . . D5 . . .',
    'E5 . . . . . . . G#4 . . . B4 . . .',
    'E5 . . . . . . . - . . . . . . .',
  ),
  bell: bars(
    pings('A5', 'E6'),
    pings('A5', 'E6'),
    pings('F5', 'C6'),
    pings('F5', 'C6'),
    pings('D5', 'A5'),
    pings('D5', 'A5'),
    pings('E5', 'B5'),
    pings('G#5', 'E6'),
  ),
  bass: bars(
    ostinato('A1', 'A2'),
    ostinato('A1', 'A2'),
    ostinato('F1', 'F2'),
    ostinato('F1', 'F2'),
    ostinato('D2', 'D3'),
    ostinato('D2', 'D3'),
    ostinato('E1', 'E2'),
    ostinato('E1', 'E2'),
  ),
  pad: bars('A3[37]', '.', 'A3[38]', '.', 'A3[58]', '.', 'G#3[38]', '.'),
  drums: bars(
    marchKick,
    marchKick,
    marchKick,
    marchKick,
    marchKick,
    marchKick,
    marchKick,
    'k . . . . . . . t . . . u . t .',
  ),
  snare: repeat(march, 8),
};

const B = {
  lead: bars(
    'A5 . . . . . . . . . . . G5 . E5 .',
    'F5 . . . . . . . . . . . D5 . Bb4 .',
    'C5 . . . . . . . E5 . . . A5 . . .',
    'Bb5 . . . . . . . A5 . . . F5 . . .',
    'A5 . . . . . . . G5 . . . F5 . . .',
    'G5 . . . . . . . D5 . . . B4 . . .',
    'G#5 . . . . . . . . . . . B5 . . .',
    'E5 . . . . . . . - . . . . . . .',
  ),
  bell: bars(
    pings('A5', 'E6'),
    pings('Bb5', 'F6'),
    pings('A5', 'E6'),
    pings('Bb5', 'F6'),
    pings('F5', 'C6'),
    pings('G5', 'D6'),
    pings('E5', 'B5'),
    pings('G#5', 'E6'),
  ),
  bass: bars(
    ostinato('A1', 'A2'),
    ostinato('Bb1', 'Bb2'),
    ostinato('A1', 'A2'),
    ostinato('Bb1', 'Bb2'),
    ostinato('F1', 'F2'),
    ostinato('G1', 'G2'),
    ostinato('E1', 'E2'),
    ostinato('E1', 'E2'),
  ),
  pad: bars('A3[37]', 'Bb3[47]', 'A3[37]', 'Bb3[47]', 'A3[38]', 'B3[38]', 'G#3[38]', '.'),
  drums: bars(
    'x:4 . . . . . . . k:7 . . . . . . .',
    marchKick,
    marchKick,
    marchKick,
    marchKick,
    marchKick,
    'k . . . . . . . k . . . k . . .',
    'k . . . t . . . u . t . u u t t',
  ),
  snare: bars(repeat(march, 7), 's:4 s:4 s:5 s:5 s:6 s:6 s:7 s:7 s:8 s:8 s:9 s:9 - . . .'),
};

export const missionSelect: Song = {
  bpm: 100,
  gain: 1.32,
  echo: { beats: 0.75, feedback: 0.42, tone: 2200 },
  channels: {
    lead: { patch: thinLead, echo: 0.25 },
    bell: { patch: bell, echo: 0.6, pan: 0.3, gain: 0.85 },
    bass: { patch: { ...fmBass, env: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.04 } }, gain: 0.9 },
    sub: { patch: subBass, gain: 0.5 },
    pad: { patch: pad, play: 'chord', gain: 0.9 },
    drums: { kit: standardKit },
    snare: { kit: standardKit, pan: -0.2, gain: 0.55 },
  },
  patterns: {
    A: { ...A, sub: bars('A1', '.', 'F1', '.', 'D2', '.', 'E1', '.') },
    B: { ...B, sub: bars('A1', 'Bb1', 'A1', 'Bb1', 'F1', 'G1', 'E1', '.') },
  },
  sequence: ['A', 'B'],
  loopFrom: 0,
};
