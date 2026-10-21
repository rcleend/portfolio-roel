import { bars, fill, repeat } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import { standardKit } from '../instruments/drums';
import { bell, brass, electricPiano, pulseLead, slapBass } from '../instruments/patches';

/**
 * Stage 1 · Luna, San Francisco: sunny west-coast funk in A major, 104 bpm
 * with a sixteenth-note shuffle.
 *
 * Slap FM bass and syncopated electric-piano stabs over a ghost-noted funk
 * beat. The loop is four eight-bar sections (≈ 74 s before it repeats, so a
 * whole run rarely hears it twice): the pulse-lead theme over
 * IV–iii–ii–V (Dmaj7 C♯m7 Bm7 E7); a second theme around F♯m7 and Bm7; the
 * theme again, re-phrased on FM brass; and a breakdown that borrows G (the
 * ♭VII, a hazy Mixolydian lift) for a bell interlude before the lead returns.
 */

type Chord = {
  /** Bass notes: root, octave, fifth and seventh. */
  readonly r: string;
  readonly o: string;
  readonly f: string;
  readonly b: string;
  /** Electric-piano voicing. */
  readonly v: string;
};

const Dmaj7: Chord = { r: 'D2', o: 'D3', f: 'A2', b: 'C#3', v: 'D4[47b]' };
const Cs7: Chord = { r: 'C#2', o: 'C#3', f: 'G#2', b: 'B2', v: 'C#4[37a]' };
const Bm7: Chord = { r: 'B1', o: 'B2', f: 'F#2', b: 'A2', v: 'B3[37a]' };
const E7: Chord = { r: 'E2', o: 'E3', f: 'B2', b: 'D3', v: 'E4[47a]' };
const E7sus: Chord = { ...E7, v: 'E4[57a]' };
const Fs7: Chord = { r: 'F#2', o: 'F#3', f: 'C#3', b: 'E3', v: 'F#4[37a]' };
const Gmaj7: Chord = { r: 'G2', o: 'G3', f: 'D3', b: 'F#3', v: 'G4[47b]' };
const Em7: Chord = { r: 'E2', o: 'E3', f: 'B2', b: 'D3', v: 'E4[37a]' };
const A7: Chord = { r: 'A1', o: 'A2', f: 'E2', b: 'G2', v: 'A3[47a]' };

/** Staccato slap line: root, octave pop, a seventh pickup into the fifth. */
const slap = (chord: Chord): string => fill('r . - o - r:6 - r . - r b - o f -', chord);
/** Sparser line for the breakdown. */
const slapLight = (chord: Chord): string => fill('r . . . . . - o - . r . . - f -', chord);

/** Syncopated chord stabs. */
const stabs = (chord: Chord): string => fill('. . v - . . . v - . . . v . - .', chord);
/** Held chord, for the breakdown. */
const held = (chord: Chord): string => fill('v . . . . . . . . . . . . . - .', chord);

const progression = (line: (chord: Chord) => string, chords: readonly Chord[]): string => bars(...chords.map(line));

const funk = 'k . . k s . s:2 k . s:2 k . s . k s:2';
const funkFill = 'k . . k s . s:2 k . s:2 k . s s:5 s:7 s:8';
const hats = 'h h:3 h:6 h:3 h h:3 h:6 h:3 o:7 h:3 h:6 h:3 h h:3 h:6 h:3';
const halfTime = 'k . . . . . . . r . . k . . . .';

const themeChords = [Dmaj7, Cs7, Bm7, E7, Dmaj7, Cs7, Bm7, E7] as const;
const secondChords = [Fs7, Fs7, Bm7, Bm7, Dmaj7, Cs7, Bm7, E7sus] as const;
const bridgeChords = [Gmaj7, Fs7, Gmaj7, Fs7, Em7, A7, Dmaj7, E7] as const;

const rhythm = (chords: readonly Chord[], beat = bars(repeat(funk, 7), funkFill)) => ({
  bass: progression(slap, chords),
  keys: progression(stabs, chords),
  drums: beat,
  hats: repeat(hats, 8),
});

export const levelLuna: Song = {
  bpm: 104,
  swing: 0.14,
  gain: 1,
  echo: { beats: 0.75, feedback: 0.3, tone: 2800 },
  channels: {
    lead: { patch: pulseLead, echo: 0.2 },
    brass: { patch: brass, echo: 0.15, pan: -0.1 },
    bell: { patch: bell, echo: 0.45, pan: 0.3 },
    keys: { patch: electricPiano, play: 'chord', pan: -0.25 },
    bass: { patch: slapBass },
    drums: { kit: standardKit },
    hats: { kit: standardKit, pan: 0.25, gain: 0.7 },
  },
  patterns: {
    intro: {
      bass: progression(slap, [Bm7, E7]),
      keys: progression(stabs, [Bm7, E7]),
      drums: bars('k . . k s . s:2 k . s:2 k . s . k s:2', 'k . . k s . s:2 k . s:2 k . s s:5 s:7 s:8'),
      hats: repeat(hats, 2),
      lead: bars('-', '. . . . . . . . . . . . E5 . . .'),
    },
    theme: {
      ...rhythm(themeChords),
      lead: bars(
        'F#5 . . E5 . . C#5 . . . E5 . F#5 . A5 .',
        'G#5 . . E5 . . C#5 . . . . . B4 . C#5 .',
        'D5 . . C#5 . . B4 . . . D5 . F#5 . A5 .',
        'G#5 . . . F#5 . E5 . . . . . - . E5 .',
        'F#5 . . E5 . . C#5 . . . E5 . F#5 . A5 .',
        'B5 . . A5 . . G#5 . . . E5 . C#5 . E5 .',
        'F#5 . . . E5 . D5 . . . C#5 . B4 . D5 .',
        'E5 . . . . . . . - . . . E5 . F#5 .',
      ),
    },
    second: {
      ...rhythm(secondChords),
      lead: bars(
        'A5 . . . . . G#5 . A5 . . . C#6 . . .',
        'B5 . . A5 . . F#5 . . . . . . . E5 .',
        'F#5 . . . . . E5 . F#5 . . . A5 . . .',
        'B5 . . A5 . . F#5 . . . D5 . . . . .',
        'E5 . F#5 . A5 . . . C#6 . . . B5 . A5 .',
        'G#5 . . . E5 . . . C#5 . . . E5 . . .',
        'D5 . . . F#5 . . . A5 . . . B5 . . .',
        'A5 . . . . . . . - . . . E5 . . .',
      ),
    },
    reprise: {
      ...rhythm(themeChords),
      brass: bars(
        'A5 . . F#5 . . A5 . . . B5 . A5 . F#5 .',
        'E5 . . . . . C#5 . E5 . . . G#5 . . .',
        'F#5 . . D5 . . F#5 . . . A5 . B5 . D6 .',
        'C#6 . . B5 . . G#5 . . . E5 . - . . .',
        'A5 . . F#5 . . A5 . . . B5 . A5 . F#5 .',
        'G#5 . . E5 . . C#5 . . . B4 . C#5 . E5 .',
        'D5 . . . F#5 . . . B5 . . . A5 . . .',
        'G#5 . . . . . . . B5 . . . - . . .',
      ),
    },
    bridge: {
      bass: bars(progression(slapLight, bridgeChords.slice(0, 4)), progression(slap, bridgeChords.slice(4))),
      keys: bars(progression(held, bridgeChords.slice(0, 4)), progression(stabs, bridgeChords.slice(4))),
      drums: bars(halfTime, halfTime, halfTime, 'k . . . r . . . k . r . r r:6 r:7 r:8', funk, funk, funk, funkFill),
      hats: bars(
        'h . . . h . . . h . . . h . . .',
        'h . . . h . . . h . . . h . . .',
        'h . . . h . . . h . . . h . . .',
        'h . h . h . h . h . h . h h h h',
        hats,
        hats,
        hats,
        hats,
      ),
      bell: bars(
        'B5 . . . D6 . . . F#6 . . . D6 . . .',
        'A5 . . . C#6 . . . E6 . . . C#6 . . .',
        'B5 . . . D6 . . . F#6 . . . A6 . . .',
        'C#6 . . . A5 . . . E5 . . . C#5 . . .',
        '-',
        '.',
        '.',
        '.',
      ),
      lead: bars(
        '-',
        '.',
        '.',
        '.',
        'G5 . . . F#5 . . . E5 . . . D5 . . .',
        'C#5 . . . E5 . . . G5 . . . A5 . . .',
        'F#5 . . . . . A5 . . . . . C#6 . . .',
        'B5 . . . . . . . G#5 . . . E5 . . .',
      ),
    },
  },
  sequence: ['intro', 'theme', 'second', 'reprise', 'bridge'],
  loopFrom: 1,
};
