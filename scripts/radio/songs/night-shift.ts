import { bars, fill, repeat } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import {
  crackle,
  dustyKeys,
  hummingPulse,
  kettle,
  lofiKit,
  nylonPluck,
  roundBass,
  tapeHiss,
  tineLead,
} from './instruments';

/**
 * Night Shift, by Studio Attic (placeholder): lo-fi beats at 82 bpm in F minor,
 * swung sixteenths, a worn FM e-piano, vinyl crackle and tape hiss.
 */

/** A type, not an interface: `fill` takes it as a plain record of notes. */
type Chord = {
  /** E-piano voicing (lowest note and hex intervals). */
  readonly v: string;
  /** Bass: root, fifth, octave. */
  readonly r: string;
  readonly f: string;
  readonly o: string;
  /** Picked arpeggio tones, low to high. */
  readonly a: string;
  readonly b: string;
  readonly c: string;
  readonly d: string;
  readonly e: string;
};

const chord = (v: string, bass: string, tones: string): Chord => {
  const [r = '', f = '', o = ''] = bass.split(' ');
  const [a = '', b = '', c = '', d = '', e = ''] = tones.split(' ');
  return { v, r, f, o, a, b, c, d, e };
};

const Fm9 = chord('Ab3[47b]', 'F2 C3 F3', 'F3 Ab3 C4 Eb4 G4');
const Bbm9 = chord('Ab3[459]', 'Bb1 F2 Bb2', 'Bb2 F3 Ab3 C4 Db4');
const Dbmaj9 = chord('F3[37a]', 'Db2 Ab2 Db3', 'Db3 Ab3 C4 Eb4 F4');
const C7b9 = chord('E3[369]', 'C2 G2 C3', 'C3 G3 Bb3 Db4 E4');
const Cm7 = chord('Eb3[47b]', 'C2 G2 C3', 'C3 G3 Bb3 D4 Eb4');
const Bbm7 = chord('Db3[47b]', 'Bb1 F2 Bb2', 'Bb2 F3 Ab3 Db4 F4');
const Eb7sus = chord('Db3[279]', 'Eb2 Bb2 Eb3', 'Eb3 Ab3 Bb3 Db4 Eb4');
const Abmaj7 = chord('Eb3[459]', 'Ab1 Eb2 Ab2', 'Ab2 Eb3 G3 C4 Eb4');
const Dbmaj7 = chord('F3[378]', 'Db2 Ab2 Db3', 'Db3 F3 Ab3 C4 F4');

const over = (template: string, chords: readonly Chord[]): string => bars(...chords.map((c) => fill(template, c)));
const held = (count: number): string => repeat('.', count);

// ── Kettle On ───────────────────────────────────────────────────────────────────

const comp = 'v . . . . . . v:6 . . . . . . . .';
const walk = 'r . . . . . - . . . r:7 . f:8 . o:6 .';
const boomBap = 'k . . . s . . k:6 . . k . s . . s:2';
const boomBapFill = 'k . . . s . . k:6 . . k . s . s:4 s:6';
const swungHats = 'h:7 . h:4 h:3 h:7 . h:4 . h:7 . h:4 h:3 h:7 . h:5 .';
const phrase = bars(boomBap, boomBap, boomBap, boomBapFill);

const verse = [Fm9, Bbm9, Dbmaj9, C7b9] as const;
const bridge = [Dbmaj9, Cm7, Bbm7, C7b9] as const;

export const kettleOn: Song = {
  bpm: 82,
  swing: 0.22,
  echo: { beats: 0.75, feedback: 0.28, tone: 1800 },
  channels: {
    keys: { patch: dustyKeys, play: 'chord', echo: 0.1, pan: -0.15 },
    lead: { patch: tineLead, echo: 0.3, pan: 0.12 },
    bass: { patch: roundBass },
    drums: { kit: lofiKit },
    hats: { kit: lofiKit, pan: 0.2, gain: 0.8 },
    vinyl: { kit: lofiKit, pan: -0.3 },
    dust: { patch: tapeHiss },
    kettle: { patch: kettle, echo: 0.2, pan: 0.35 },
  },
  patterns: {
    intro: {
      keys: over('v . . . . . . . . . . . . . . .', [Fm9, Fm9]),
      hats: bars('-', '. . . . . . . . . . . . h:4 . h:5 h:6'),
      vinyl: crackle(11, 2, 4),
      dust: bars('A4', '.'),
      lead: bars('-', '. . . . . . . . . . . . . . C5:7 Eb5:8'),
    },
    verse: {
      keys: over(comp, verse),
      bass: over(walk, verse),
      drums: phrase,
      hats: repeat(swungHats, 4),
      vinyl: crackle(12, 4),
      dust: held(4),
      lead: bars('F5:8 . . . . . . . . . . . - . . .', '-', '-', '. . . . . . . . . . . . . . C5:7 Eb5:8'),
    },
    tune: {
      keys: over(comp, verse),
      bass: over(walk, verse),
      drums: phrase,
      hats: repeat(swungHats, 4),
      vinyl: crackle(13, 4),
      dust: held(4),
      lead: bars(
        'F5 . . . Eb5 . . C5 . . Ab4 . . . G4 .',
        'Ab4 . . . . . . . . . . . Bb4 . C5 .',
        'Eb5 . . . . . C5 . . . Ab4 . F4 . Ab4 .',
        'G4 . . . . . . . E4 . . . - . C5 Eb5',
      ),
    },
    bridge: {
      keys: over(comp, bridge),
      bass: over(walk, bridge),
      drums: phrase,
      hats: repeat(swungHats, 4),
      vinyl: crackle(14, 4),
      dust: held(4),
      lead: bars(
        'F5 . . . Ab5 . . F5 . . Eb5 . . . C5 .',
        'Eb5 . . D5 . . C5 . . . G4 . . . Bb4 .',
        'Db5 . . . . . C5 . Bb4 . . . Ab4 . . .',
        'G4 . . . . . . . E4 . . . - . C5 Eb5',
      ),
    },
    coda: {
      keys: over(comp, [Fm9, Bbm9]),
      bass: over(walk, [Fm9, Bbm9]),
      drums: bars(boomBap, 'k . . . . . . . . . . . . . . .'),
      hats: bars(swungHats, 'h:6 . h:4 h:3 h:5 . h:3 . h:4 . h:3 . h:2 . . .'),
      vinyl: crackle(15, 2),
      dust: held(2),
      lead: bars('C5 . . Ab4 . . G4 . F4 . . . . . . .', '-'),
    },
    // The record ends where it began: one last chord, and the kettle starting to sing.
    end: {
      keys: 'Ab3[47b]:8 . . . . . . . . . . . . . . .',
      bass: 'F2:8 . . . . . . . . . . . . . . .',
      vinyl: crackle(16, 1, 5),
      dust: '.',
      kettle: '. . . . . . . . C6 . . . . ~F6 . .',
    },
  },
  sequence: ['intro', 'verse', 'tune', 'bridge', 'coda', 'end'],
};

// ── Window Seat ─────────────────────────────────────────────────────────────────

const picked = 'a . b . c . d . e . d . c . b .';
const halfTime = 'k . . . . . . k:5 s:7 . . . . . k:4 .';
const halfTimeFill = 'k . . . . . . k:5 s:7 . . . s:4 . s:5 s:6';
const eighthHats = 'h:6 . h:4 . h:6 . h:4 . h:6 . h:4 . h:6 . h:4 h:3';
const rootHeld = 'r . . . . . . . . . . . f:7 . . .';

const seatA = [Dbmaj9, Cm7, Fm9, Fm9] as const;
const seatB = [Bbm9, Eb7sus, Abmaj7, Dbmaj7] as const;

export const windowSeat: Song = {
  bpm: 82,
  swing: 0.18,
  echo: { beats: 0.75, feedback: 0.32, tone: 1600 },
  channels: {
    pluck: { patch: nylonPluck, echo: 0.22, pan: 0.18 },
    keys: { patch: dustyKeys, play: 'chord', pan: -0.2, gain: 0.8 },
    lead: { patch: hummingPulse, echo: 0.35, pan: -0.05 },
    bass: { patch: roundBass },
    drums: { kit: lofiKit },
    hats: { kit: lofiKit, pan: 0.22, gain: 0.75 },
    vinyl: { kit: lofiKit, pan: 0.3 },
    dust: { patch: tapeHiss },
  },
  patterns: {
    intro: {
      pluck: over(picked, [Dbmaj9, Cm7]),
      vinyl: crackle(21, 2, 4),
      dust: bars('A4', '.'),
    },
    verse: {
      pluck: over(picked, seatA),
      keys: over('v . . . . . . . . . . . . . . .', seatA),
      bass: over(rootHeld, seatA),
      drums: bars(halfTime, halfTime, halfTime, halfTimeFill),
      hats: repeat(eighthHats, 4),
      vinyl: crackle(22, 4),
      dust: held(4),
    },
    tune: {
      pluck: over(picked, seatA),
      keys: over('v . . . . . . . . . . . . . . .', seatA),
      bass: over(rootHeld, seatA),
      drums: bars(halfTime, halfTime, halfTime, halfTimeFill),
      hats: repeat(eighthHats, 4),
      vinyl: crackle(23, 4),
      dust: held(4),
      lead: bars(
        'C5 . . . . . . . Ab4 . . . Bb4 . C5 .',
        'Bb4 . . . G4 . . . . . . . Eb4 . F4 .',
        'Ab4 . . . . . . . G4 . . . F4 . . .',
        'C5 . . . . . . . . . . . - . . .',
      ),
    },
    turn: {
      pluck: over(picked, seatB),
      keys: over('v . . . . . . . . . . . . . . .', seatB),
      bass: over(rootHeld, seatB),
      drums: bars(halfTime, halfTime, halfTime, halfTimeFill),
      hats: repeat(eighthHats, 4),
      vinyl: crackle(24, 4),
      dust: held(4),
      lead: bars(
        'Db5 . . . C5 . . . Ab4 . . . F4 . Ab4 .',
        'Bb4 . . . . . . . Ab4 . . . Eb4 . F4 .',
        'G4 . . . . . Ab4 . C5 . . . Eb5 . . .',
        'F5 . . . . . Eb5 . C5 . . . . . . .',
      ),
    },
    // A last picked chord up the neck, left to ring under the hiss.
    end: {
      pluck: 'Db3 Ab3 C4 Eb4 F4 Ab4 C5 . . . . . . . . .',
      keys: 'F3[37a]:7 . . . . . . . . . . . . . . .',
      bass: 'Db2:8 . . . . . . . . . . . . . . .',
      lead: '. . . . . . . . Ab4:6 . . . . . . .',
      vinyl: crackle(25, 1, 5),
      dust: '.',
    },
  },
  sequence: ['intro', 'verse', 'tune', 'turn', 'end'],
};
