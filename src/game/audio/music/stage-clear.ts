import { bars, repeat } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import { standardKit } from '../instruments/drums';
import { bell, brass, brassStab, electricPiano, fmBass, squarePluck } from '../instruments/patches';

/**
 * Stage clear, B♭ major, 132 bpm.
 *
 * A two-bar brass fanfare (a triplet pickup into the classic ♭VI–♭VII–I
 * victory cadence: G♭, A♭, B♭) that plays once, then a relaxed four-bar
 * results loop (I–vi–IV–V on electric piano, a plucked tune and a bell
 * answer) for reading the score. Scenes that pass `loop: false` hear the
 * fanfare and one pass of the loop.
 */
export const stageClear: Song = {
  bpm: 132,
  gain: 1,
  echo: { beats: 0.75, feedback: 0.3 },
  channels: {
    brass: { patch: { ...brass, env: { ...brass.env, release: 0.6 } }, echo: 0.2 },
    stab: { patch: brassStab, play: 'chord', pan: -0.2 },
    lead: { patch: squarePluck, echo: 0.25 },
    bell: { patch: bell, echo: 0.4, pan: 0.3, gain: 0.85 },
    keys: { patch: electricPiano, play: 'chord', pan: -0.2 },
    bass: { patch: fmBass, gain: 0.9 },
    drums: { kit: standardKit },
  },
  patterns: {
    fanfare: {
      brass: bars('F5 F5 F5 Bb5 . . Bb5 . . C6 . .', 'D6 . . . . . . . . . . . - . . .'),
      stab: bars('. . . . D4[38] . . . Gb4[47] . . . Ab4[47] . . .', 'Bb4[47c] . . . . . . . . . . . - . . .'),
      bass: bars('. . . . Bb1 . . . Gb1 . . . Ab1 . . .', 'Bb1 . . . . . . . . . . . - . . .'),
      drums: bars('s:5 s:6 s:7 x . . k . . k . k', 'x . . . . . . . s:4 s:5 s:6 s:7 s:8 . . .'),
    },
    results: {
      keys: bars(
        'D4[38] . . - . . D4[38] . . - . . D4[38] . - .',
        'D4[58] . . - . . D4[58] . . - . . D4[58] . - .',
        'Eb4[47] . . - . . Eb4[47] . . - . . Eb4[47] . - .',
        'F4[47] . . - . . F4[47] . . - . . F4[47] . - .',
      ),
      lead: bars(
        'F5 . D5 . F5 . Bb5 . . . A5 . Bb5 . . .',
        'G5 . . . D5 . . . . . F5 . G5 . . .',
        'Eb5 . G5 . Bb5 . . . C6 . Bb5 . G5 . . .',
        'A5 . . . C6 . . . . . - . . . . .',
      ),
      bell: bars('-', '. . . . . . . . . . . . Bb5 . D6 .', '.', '. . . . . . . . . . . . F6 . . .'),
      bass: bars(
        'Bb1 . . . F2 . . Bb1 . . . . F2 . . .',
        'G1 . . . D2 . . G1 . . . . D2 . . .',
        'Eb2 . . . Bb1 . . Eb2 . . . . Bb1 . . .',
        'F1 . . . C2 . . F1 . . . . C2 . A1 .',
      ),
      drums: bars(repeat('k . . . s . . . k . . k s . . .', 3), 'k . . . s . . . k . . k s . s:6 s:7'),
    },
  },
  sequence: ['fanfare', 'results'],
  loopFrom: 1,
};
