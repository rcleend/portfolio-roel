import { bars, fill, repeat } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import { standardKit } from '../instruments/drums';
import { acidBass, arpThin, bell, pad, riser, thinLead } from '../instruments/patches';

/**
 * Stage 2 · Scripe, Berlin: night-time techno chiptune in F minor, 126 bpm.
 *
 * Four-on-the-floor kick, off-beat open hats, a rolling filtered-saw bass
 * between the kicks, and a three-note arpeggio that cycles against the
 * four-beat bar so its accent drifts (the hypnotic trick of the genre). The
 * harmony moves every two bars, i–VI–iv–V (Fm D♭ B♭m C). After a four-bar
 * intro the loop runs groove → melody → breakdown (kick out, bells and a
 * riser) → drop: 32 bars ≈ 61 s.
 */

type Chord = {
  /** Bass root and its octave. */
  readonly r: string;
  readonly o: string;
  /** Three arpeggio notes, cycled. */
  readonly arp: readonly [string, string, string];
  /** Pad voicing. */
  readonly v: string;
};

const Fm: Chord = { r: 'F1', o: 'F2', arp: ['F4', 'Ab4', 'C5'], v: 'F3[37]' };
const Db: Chord = { r: 'Db2', o: 'Db3', arp: ['F4', 'Ab4', 'Db5'], v: 'F3[38]' };
const Bbm: Chord = { r: 'Bb1', o: 'Bb2', arp: ['F4', 'Bb4', 'Db5'], v: 'F3[58]' };
const C: Chord = { r: 'C2', o: 'C3', arp: ['E4', 'G4', 'C5'], v: 'E3[38]' };

/** Each chord lasts two bars. */
const CYCLE = [Fm, Fm, Db, Db, Bbm, Bbm, C, C] as const;

/** Rolling sixteenths between the kicks. */
const roll = (chord: Chord): string => fill('- r r:6 o - r r:6 r - r r:6 o - r o:7 r', { r: chord.r, o: chord.o });

/** Three notes over sixteen steps: the pattern re-accents itself every bar. */
const cycle = (chord: Chord, bar: number): string =>
  Array.from({ length: 16 }, (_, step) => {
    const note = chord.arp[(bar * 16 + step) % 3] ?? chord.r;
    return step % 4 === 0 ? note : `${note}:6`;
  }).join(' ');

const each = (line: (chord: Chord, bar: number) => string): string =>
  bars(...CYCLE.map((chord, bar) => line(chord, bar)));

const fourOnTheFloor = 'k k k k';
const claps = '. c . c';
const hats = 'h:3 h:2 o h:2 h:3 h:2 o h:2 h:3 h:2 o h:2 h:3 h:2 o h:5';
/** The same bar opening on a crash, to mark the drop. */
const crashHats = 'x h:2 o h:2 h:3 h:2 o h:2 h:3 h:2 o h:2 h:3 h:2 o h:5';

const padLane = bars(Fm.v, '.', Db.v, '.', Bbm.v, '.', C.v, '.');

const groove = {
  kick: repeat(fourOnTheFloor, 8),
  clap: bars(repeat(claps, 7), '. c . c:6 c:7 c:8 c c'),
  hats: repeat(hats, 8),
  bass: each(roll),
  arp: each(cycle),
};

export const levelScripe: Song = {
  bpm: 126,
  gain: 1.45,
  echo: { beats: 0.75, feedback: 0.45, tone: 2400 },
  channels: {
    lead: { patch: thinLead, echo: 0.35 },
    bell: { patch: bell, echo: 0.5, pan: -0.3 },
    arp: { patch: arpThin, echo: 0.4, pan: 0.35, gain: 0.8 },
    pad: { patch: pad, play: 'chord' },
    bass: { patch: acidBass },
    air: { patch: riser },
    kick: { kit: standardKit },
    clap: { kit: standardKit, gain: 0.8 },
    hats: { kit: standardKit, pan: -0.2, gain: 0.75 },
  },
  patterns: {
    intro: {
      kick: repeat(fourOnTheFloor, 4),
      hats: bars('. . o . . . o . . . o . . . o .', '. . o . . . o . . . o . . . o .', hats, hats),
      bass: bars('-', '.', roll(Fm), roll(Fm)),
      arp: bars('-', '.', cycle(Fm, 0), cycle(Fm, 1)),
    },
    groove,
    melody: {
      ...groove,
      pad: padLane,
      lead: bars(
        'C6 . . . . . . . Ab5 . . . . . . .',
        'G5 . . . . . . . F5 . . . Eb5 . F5 .',
        'Ab5 . . . . . . . F5 . . . . . . .',
        'Eb5 . . . . . . . Db5 . . . C5 . Db5 .',
        'F5 . . . . . . . Db5 . . . . . . .',
        'C5 . . . . . . . Bb4 . . . . . Db5 .',
        'E5 . . . . . . . G5 . . . . . . .',
        'C6 . . . . . . . Bb5 . . . G5 . E5 .',
      ),
    },
    breakdown: {
      pad: padLane,
      arp: each(cycle),
      hats: bars(repeat('. . o:4 .', 4), '. . o:4 .', '. . o:4 .', '. . o:4 .', '. . . . . . . . . . . . . . . .'),
      bell: bars(
        'F6 . . . C6 . . . Ab5 . . . C6 . . .',
        'Eb6 . . . . . . . C6 . . . . . . .',
        'F6 . . . Db6 . . . Ab5 . . . Db6 . . .',
        'C6 . . . . . . . Ab5 . . . . . . .',
        'F6 . . . Db6 . . . Bb5 . . . Db6 . . .',
        'C6 . . . . . . . Bb5 . . . . . . .',
        '-',
        '.',
      ),
      air: bars('-', '.', '.', '.', '.', '.', 'A4', '.'),
      clap: bars(
        '-',
        '.',
        '.',
        '.',
        '.',
        '.',
        's:3 . s:3 . s:4 . s:4 . s:5 . s:5 . s:6 s:6 s:7 s:7',
        's:6 s:6 s:6 s:6 s:7 s:7 s:7 s:7 s:8 s:8 s:8 s:8 s s s s',
      ),
    },
    drop: {
      ...groove,
      hats: bars(crashHats, repeat(hats, 7)),
      pad: padLane,
      lead: bars(
        'F5 . Ab5 . C6 . . . Eb6 . . . C6 . Ab5 .',
        'G5 . . . . . . . . . . . F5 . G5 .',
        'Ab5 . F5 . Ab5 . Db6 . . . C6 . . . Ab5 .',
        'Bb5 . . . . . . . . . . . Ab5 . Bb5 .',
        'Db6 . Bb5 . F5 . Db6 . . . C6 . . . Bb5 .',
        'C6 . . . . . . . . . . . Db6 . C6 .',
        'E6 . . . G6 . . . E6 . . . C6 . . .',
        'Bb5 . . . G5 . . . E5 . . . C5 . . .',
      ),
    },
  },
  sequence: ['intro', 'groove', 'melody', 'breakdown', 'drop'],
  loopFrom: 1,
};
