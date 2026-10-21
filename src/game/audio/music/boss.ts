import { bars, fill, repeat } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import { standardKit } from '../instruments/drums';
import { arpPluck, brass, brassStab, fmBass, pulseLead } from '../instruments/patches';

/**
 * Escalation (the boss customer), C minor, 168 bpm: urgent and driving.
 *
 * Galloping sixteenth FM bass, double-time drums and brass hits under a
 * pulse lead that keeps climbing. A runs i–i–VI–VII with a D♭ (the
 * Neapolitan) and G7 pulling hard back home; B reaches through Fm and A♭,
 * with a diminished arpeggio buzzing underneath. Loop: 16 bars ≈ 23 s.
 */

/** Gallop: the root with octave kicks, as relentless as the customer. */
const gallop = (low: string, high: string): string =>
  fill('l l:6 h l:6 l l:6 h l:6 l l:6 h l:6 l h l h', { l: low, h: high });

const hits = (chord: string): string => fill('c . . c - . c . - . . . c . c -', { c: chord });

const drive = 'k . s . k k s . k . s . k k s .';
const driveFill = 'k . s . k k s . s s:6 s:7 s s u u t';
const hats = 'h h:4 h h:4 h h:4 h h:4 h h:4 h h:4 h h:4 h h:4';

export const boss: Song = {
  bpm: 168,
  gain: 0.75,
  echo: { beats: 0.5, feedback: 0.22 },
  channels: {
    lead: { patch: pulseLead, echo: 0.15 },
    brass: { patch: brass, pan: -0.15, gain: 0.85 },
    stab: { patch: brassStab, play: 'chord', pan: 0.2 },
    arp: { patch: arpPluck, pan: 0.35, gain: 0.8 },
    bass: { patch: fmBass },
    drums: { kit: standardKit },
    hats: { kit: standardKit, pan: -0.25, gain: 0.7 },
  },
  patterns: {
    A: {
      lead: bars(
        'C5 . C5 . Eb5 . C5 . G5 . . . F#5 . G5 .',
        'Ab5 . G5 . F5 . Eb5 . D5 . Eb5 . F5 . G5 .',
        'C6 . . . Bb5 . Ab5 . G5 . . . Eb5 . C5 .',
        'D5 . . . F5 . . . Bb5 . . . D6 . . .',
        'C5 . C5 . Eb5 . C5 . G5 . . . F#5 . G5 .',
        'Bb5 . Ab5 . G5 . F5 . Eb5 . F5 . G5 . Ab5 .',
        'F5 . . . Ab5 . . . Db6 . . . C6 . Bb5 .',
        'B5 . . . . . . . D6 . . . F6 . . .',
      ),
      bass: bars(
        gallop('C2', 'C3'),
        gallop('C2', 'C3'),
        gallop('Ab1', 'Ab2'),
        gallop('Bb1', 'Bb2'),
        gallop('C2', 'C3'),
        gallop('C2', 'C3'),
        gallop('Db2', 'Db3'),
        gallop('G1', 'G2'),
      ),
      stab: bars(
        hits('C4[37]'),
        hits('C4[37]'),
        hits('C4[38]'),
        hits('D4[38]'),
        hits('C4[37]'),
        hits('C4[37]'),
        hits('Db4[47]'),
        hits('B3[369]'),
      ),
      drums: bars(repeat(drive, 3), driveFill, repeat(drive, 3), driveFill),
      hats: repeat(hats, 8),
    },
    B: {
      brass: bars(
        'Ab5 . . . . . . . G5 . . . F5 . . .',
        'B4 . . . D5 . . . F5 . . . Ab5 . . .',
        'G5 . . . . . . . Eb5 . . . C5 . . .',
        'Eb5 . . . C5 . . . Ab4 . . . C5 . Eb5 .',
        'F5 . . . Ab5 . . . C6 . . . Ab5 . . .',
        'Db6 . . . C6 . . . Ab5 . . . F5 . . .',
        'G5 . . . B5 . . . D6 . . . F6 . . .',
        'Ab6 . . . G6 . . . F6 . . . D6 . B5 .',
      ),
      arp: bars('F4[37]', 'B3[369]', 'C4[37]', 'C4[38]', 'F4[37]', 'F4[38]', 'B3[369]', 'B3[369]'),
      bass: bars(
        gallop('F1', 'F2'),
        gallop('G1', 'G2'),
        gallop('C2', 'C3'),
        gallop('Ab1', 'Ab2'),
        gallop('F1', 'F2'),
        gallop('Db2', 'Db3'),
        gallop('G1', 'G2'),
        'G1 G1 G2 G1 G1 G2 G1 G2 G1 G1 G2 G2 G1 G2 G2 G2',
      ),
      stab: bars(
        hits('C4[58]'),
        hits('B3[369]'),
        hits('C4[37]'),
        hits('C4[38]'),
        hits('C4[58]'),
        hits('Db4[47]'),
        hits('B3[369]'),
        'B3[369] . . . B3[369] . . . B3[369] . B3[369] . B3[369] B3[369] B3[369] B3[369]',
      ),
      drums: bars(repeat(drive, 7), 's s:6 s s:6 s s:7 s s:7 s s:8 s s:8 s s u t'),
      hats: repeat(hats, 8),
    },
  },
  sequence: ['A', 'B'],
  loopFrom: 0,
};
