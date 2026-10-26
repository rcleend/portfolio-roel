import { bars, fill, repeat } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import { standardKit } from '@/game/audio/instruments/drums';
import {
  arpPluck,
  arpThin,
  bell,
  brass,
  brassStab,
  pulseLead,
  squarePluck,
  subBass,
  thinLead,
} from '@/game/audio/instruments/patches';

/**
 * Insert Coin, by 8-Bit Lodgers (placeholder): chiptune at 150 bpm in C major on
 * the game's own pulse and triangle band, as if the cartridge had a B-side.
 */

/** A type, not an interface: `fill` takes it as a plain record of notes. */
type Chord = {
  /** Chip arpeggio: root and hex intervals. */
  readonly v: string;
  /** Triangle bass root and octave. */
  readonly r: string;
  readonly o: string;
  /** Broken-chord tones, low to high. */
  readonly a: string;
  readonly b: string;
  readonly c: string;
  readonly d: string;
};

const chord = (v: string, bass: string, tones: string): Chord => {
  const [r = '', o = ''] = bass.split(' ');
  const [a = '', b = '', c = '', d = ''] = tones.split(' ');
  return { v, r, o, a, b, c, d };
};

const C = chord('C5[47]', 'C2 C3', 'C4 E4 G4 C5');
const Am = chord('A4[37]', 'A1 A2', 'A3 C4 E4 A4');
const F = chord('F4[47]', 'F1 F2', 'F3 A3 C4 F4');
const G = chord('G4[47]', 'G1 G2', 'G3 B3 D4 G4');
const G7 = chord('G4[4a]', 'G1 G2', 'G3 B3 D4 F4');
const Em = chord('E4[37]', 'E1 E2', 'E3 G3 B3 E4');
const Dm = chord('D4[37]', 'D2 D3', 'D3 F3 A3 D4');
const E = chord('E4[47]', 'E1 E2', 'E3 G#3 B3 E4');
const E7 = chord('E4[4a]', 'E1 E2', 'E3 G#3 B3 D4');
const Fmaj7 = chord('F4[47b]', 'F1 F2', 'F3 A3 C4 E4');
const Em7 = chord('E4[37a]', 'E1 E2', 'E3 G3 B3 D4');
const Am7 = chord('A4[37a]', 'A1 A2', 'A3 C4 E4 G4');
const Dm7 = chord('D4[37a]', 'D2 D3', 'D3 F3 A3 C4');
const Cmaj7 = chord('C5[47b]', 'C2 C3', 'C4 E4 G4 B4');

const over = (template: string, chords: readonly Chord[]): string => bars(...chords.map((c) => fill(template, c)));
/** A bar split between two chords at beat 3. */
const split = (template: string, first: Chord, second: Chord): string => {
  const tokens = template.split(/\s+/);
  return [
    ...fill(tokens.slice(0, 8).join(' '), first).split(' '),
    ...fill(tokens.slice(8).join(' '), second).split(' '),
  ].join(' ');
};

const bounce = 'r . o . r . o . r . o . r . o .';
const shimmer = 'v . . . . . . . v . . . . . . .';
const beat = 'k . h . s . h . k . k . s . h h';
const beatFill = 'k . h . s . h . k . s . s s s s';

// ── Attract Mode ────────────────────────────────────────────────────────────────

const attractA = [C, Am, F, G, C, Am, F, C] as const;
const attractB = [F, G, Em, Am, Dm, G, F, G7] as const;
const attractTune = [
  'E5 . G5 . C6 . G5 . E5 . G5 . A5 . G5 .',
  'E5 . . . C5 . . . A4 . C5 . E5 . . .',
  'F5 . A5 . C6 . A5 . F5 . A5 . C6 . D6 .',
  'B5 . . . G5 . . . D5 . . . G5 . . .',
  'E5 . G5 . C6 . G5 . E5 . G5 . A5 . G5 .',
  'C6 . . . A5 . . . E5 . A5 . C6 . . .',
  'D6 . C6 . A5 . F5 . G5 . B5 . D6 . B5 .',
  'C6 . . . . . . . - . . . G5 . G5 .',
] as const;

export const attractMode: Song = {
  bpm: 150,
  echo: { beats: 0.75, feedback: 0.25, tone: 3200 },
  channels: {
    lead: { patch: pulseLead, echo: 0.18 },
    counter: { patch: thinLead, echo: 0.22, pan: 0.2 },
    arp: { patch: arpThin, pan: -0.25 },
    pluck: { patch: squarePluck, pan: -0.1 },
    bass: { patch: subBass },
    drums: { kit: standardKit },
  },
  patterns: {
    // The coin drops: a run up the C major chord, then the band counts in.
    intro: {
      pluck: bars('C5 E5 G5 C6 E5 G5 C6 E6 G5 C6 E6 G6 C6 E6 G6 C7', 'B6 . . . G6 . . . D6 . . . B5 . . .'),
      bass: bars('-', 'G2 . . . G2 . . . G2 . G2 . G2 G2 G2 G2'),
      drums: bars('-', 'k . . . s . . . s . s . s s s s'),
    },
    tune: {
      lead: bars(...attractTune),
      arp: bars(...attractA.slice(0, 6).map((c) => fill(shimmer, c)), split(shimmer, F, G), fill(shimmer, C)),
      bass: bars(...attractA.slice(0, 6).map((c) => fill(bounce, c)), split(bounce, F, G), fill(bounce, C)),
      drums: bars(repeat(beat, 7), beatFill),
    },
    second: {
      counter: bars(
        'A5 . . . . . G5 . F5 . . . C5 . . .',
        'D5 . . . . . E5 . G5 . . . B5 . . .',
        'B5 . . . . . A5 . G5 . . . E5 . . .',
        'C6 . . . B5 . A5 . E5 . . . . . . .',
        'F5 . . . . . E5 . D5 . . . A4 . . .',
        'B4 . . . D5 . . . G5 . . . B5 . . .',
        'A5 . . . C6 . . . F6 . . . E6 . D6 .',
        'B5 . . . . . . . D6 . . . F6 . . .',
      ),
      pluck: over('a . b . c . d . c . b . a . b .', attractB),
      bass: over(bounce, attractB),
      drums: bars(repeat(beat, 7), beatFill),
    },
    reprise: {
      lead: bars(...attractTune.slice(0, 6)),
      counter: bars('-', '.', 'A5 . . . . . . . F5 . . . . . . .', 'D5 . . . . . . . B4 . . . . . . .', '-', '.'),
      arp: over(shimmer, attractA.slice(0, 6)),
      bass: over(bounce, attractA.slice(0, 6)),
      drums: bars(repeat(beat, 5), beatFill),
    },
    // Game over the right way: a run up to the top C on a crash.
    end: {
      lead: bars('A5 . C6 . F6 . . . G5 . B5 . D6 . F6 .', 'E6 . . . . . . . . . . . . . . .'),
      arp: bars(split(shimmer, F, G), 'C5[47c] . . . . . . . . . . . . . . .'),
      bass: bars(split(bounce, F, G), 'C2 . . . . . . . - . . . . . . .'),
      drums: bars('k . h . s . h . k . s . s s s s', 'x . . . . . . . . . . . . . . .'),
      pluck: bars('-', 'C5 . . . . . . . . . . . . . . .'),
    },
  },
  sequence: ['intro', 'tune', 'second', 'reprise', 'end'],
};

// ── High Score Dreams ──────────────────────────────────────────────────────────

const dreamA = [Fmaj7, G, Em7, Am7, Dm7, G, Cmaj7, Cmaj7] as const;
const dreamBridge = [Am, F, C, G, Am, F, Dm7, G7] as const;
const halfBeat = 'k . . . . . . . s . . . . . . .';
const halfFill = 'k . . . . . . . s . . . s . s s';
const halfHats = 'h:6 . h:3 . h:6 . h:3 . h:6 . h:3 . h:6 . h:3 .';
const broken = 'a . b . c . d . c . b . c . d .';
const dreamTune = [
  'A5 . . . . . . . G5 . . . E5 . . .',
  'D5 . . . . . . . B4 . . . D5 . G5 .',
  'B5 . . . . . . . A5 . . . G5 . . .',
  'E5 . . . . . . . . . . . C5 . E5 .',
  'F5 . . . . . . . E5 . . . D5 . . .',
  'D5 . . . . . B4 . . . G4 . . . . .',
  'E5 . . . G5 . . . B5 . . . C6 . . .',
  'B5 . . . . . . . G5 . . . . . . .',
] as const;

export const highScoreDreams: Song = {
  bpm: 150,
  echo: { beats: 0.75, feedback: 0.4, tone: 2600 },
  channels: {
    lead: { patch: pulseLead, echo: 0.3 },
    counter: { patch: thinLead, echo: 0.3, pan: -0.2 },
    bell: { patch: bell, echo: 0.45, pan: 0.3 },
    pluck: { patch: squarePluck, pan: 0.15, gain: 0.8 },
    arp: { patch: arpPluck, pan: -0.25 },
    bass: { patch: subBass },
    drums: { kit: standardKit },
    hats: { kit: standardKit, pan: 0.2, gain: 0.7 },
  },
  patterns: {
    intro: {
      pluck: over(broken, [Cmaj7, Cmaj7]),
      bell: bars('G6 . . . . . . . E6 . . . . . . .', 'B5 . . . . . . . . . . . . . . .'),
      hats: bars('-', '. . . . . . . . h:4 . h:5 . h:6 . h:7 .'),
    },
    tune: {
      lead: bars(...dreamTune),
      pluck: over(broken, dreamA),
      bass: over('r . . . . . . . o . . . r . . .', dreamA),
      drums: bars(repeat(halfBeat, 7), halfFill),
      hats: repeat(halfHats, 8),
    },
    bridge: {
      counter: bars(
        'C6 . . . . . B5 . A5 . . . E5 . . .',
        'F5 . . . . . A5 . C6 . . . . . . .',
        'G5 . . . . . E5 . C5 . . . E5 . G5 .',
        'D6 . . . . . . . B5 . . . . . . .',
        'C6 . . . . . B5 . A5 . . . E5 . A5 .',
        'C6 . . . . . A5 . F5 . . . A5 . C6 .',
        'D6 . . . C6 . . . A5 . . . F5 . . .',
        'G5 . . . . . . . F5 . . . D5 . B4 .',
      ),
      arp: over('v . . . . . . . v . . . . . . .', dreamBridge),
      bass: over('r . o . r . o . r . o . r . o .', dreamBridge),
      drums: bars(repeat(halfBeat, 7), halfFill),
      hats: repeat(halfHats, 8),
    },
    reprise: {
      lead: bars(...dreamTune.slice(0, 6)),
      bell: bars(
        'A6 . . . . . . . . . . . . . . .',
        'D6 . . . . . . . . . . . . . . .',
        'B6 . . . . . . . . . . . . . . .',
        'E6 . . . . . . . . . . . . . . .',
        'F6 . . . . . . . . . . . . . . .',
        'D6 . . . . . . . . . . . . . . .',
      ),
      pluck: over(broken, dreamA.slice(0, 6)),
      bass: over('r . . . . . . . o . . . r . . .', dreamA.slice(0, 6)),
      drums: bars(repeat(halfBeat, 5), halfFill),
      hats: repeat(halfHats, 6),
    },
    // The high score lands: up to the major seventh, then home.
    end: {
      lead: bars(
        'A5 . . . C6 . . . E6 . . . . . . .',
        'D6 . . . . . . . B5 . . . G5 . . .',
        'C6 . . . . . . . . . . . . . . .',
      ),
      bell: bars('-', '.', 'G6 . . . E6 . . . C6 . . . . . . .'),
      pluck: bars(over(broken, [Fmaj7, G]), 'C4 E4 G4 B4 C5 . . . . . . . . . . .'),
      bass: bars(
        'F1 . . . . . . . F2 . . . F1 . . .',
        'G1 . . . . . . . G2 . . . G1 . . .',
        'C2 . . . . . . . . . . . . . . .',
      ),
      drums: bars(halfBeat, halfFill, 'k . . . . . . . . . . . . . . .'),
      hats: bars(halfHats, halfHats, 'o:6 . . . . . . . . . . . . . . .'),
    },
  },
  sequence: ['intro', 'tune', 'bridge', 'reprise', 'end'],
};

// ── Continue? ─────────────────────────────────────────────────────────────────

const tense = [Am, F, Dm, E, Am, F, Dm, E7] as const;
const triumph = [C, F, G, C, F, G] as const;
const tick = 'r . . . r . . . r . . . r . . .';
const gallop = 'r . r o r . r o r . r o r . r o';
const tenseTune = [
  'A5 . . . . . C6 . B5 . A5 . E5 . . .',
  'F5 . . . . . A5 . C6 . . . A5 . . .',
  'D6 . . . C6 . . . A5 . F5 . D5 . . .',
  'E5 . . . G#5 . . . B5 . . . D6 . . .',
  'C6 . . . . . B5 . A5 . . . E6 . . .',
  'F6 . . . E6 . D6 . C6 . . . A5 . . .',
  'D6 . . . . . F6 . E6 . D6 . C6 . . .',
  'B5 . . . . . . . G#5 . . . E5 . D5 .',
] as const;

export const continueQuestion: Song = {
  bpm: 150,
  echo: { beats: 0.5, feedback: 0.22, tone: 3000 },
  channels: {
    lead: { patch: pulseLead, echo: 0.15 },
    brass: { patch: brass, echo: 0.12, pan: -0.15 },
    stab: { patch: brassStab, play: 'chord', pan: 0.15 },
    count: { patch: arpPluck, echo: 0.3, pan: 0.25 },
    bell: { patch: bell, echo: 0.4, pan: 0.3 },
    bass: { patch: subBass },
    drums: { kit: standardKit },
    clock: { kit: standardKit, pan: -0.3, gain: 0.8 },
  },
  patterns: {
    // Nine, eight, seven… the clock on the continue screen.
    intro: {
      clock: repeat(tick, 2),
      count: bars('E6 . . . D6 . . . C6 . . . B5 . . .', 'A5 . . . G#5 . . . A5 . . . B5 . . .'),
      bass: bars('A1 . . . . . . . . . . . . . . .', 'E1 . . . . . . . E2 . . . E1 . E2 .'),
    },
    tense: {
      lead: bars(...tenseTune),
      bass: over(gallop, tense),
      drums: bars(repeat('k . h . s . h . k . h . s . h .', 7), beatFill),
      clock: repeat(tick, 8),
    },
    urgent: {
      brass: bars(...tenseTune),
      count: over('a b c d c b a b a b c d c b a b', tense),
      bass: over(gallop, tense),
      drums: bars(repeat('k h s h k h s h k h s h k h s s', 7), 'k . s s s . s s s s s s s s s s'),
      clock: repeat('r . r . r . r . r . r . r . r .', 8),
    },
    // A coin! C major, brass and bell: the game goes on.
    credit: {
      brass: bars(
        'C5 . . E5 . . G5 . . . C6 . . . . .',
        'A5 . . . C6 . . . F6 . . . E6 . . .',
        'D6 . . . B5 . . . G5 . . . B5 . D6 .',
        'E6 . . . . . . . C6 . . . E6 . G6 .',
        'F6 . . . E6 . . . D6 . . . C6 . . .',
        'B5 . . . . . . . D6 . . . . . . .',
      ),
      stab: over('v . . . . . v . . . v . . . . .', triumph),
      bell: bars('B5 E6 . . . . . . . . . . . . . .', '-', '.', 'B5 E6 . . . . . . . . . . . . . .', '-', '.'),
      bass: over(bounce, triumph),
      drums: bars(repeat(beat, 5), beatFill),
    },
    end: {
      brass: 'C6 . . . . . . . . . . . . . . .',
      stab: 'C5[47c] . . . . . . . . . . . . . . .',
      bell: 'B5 E6 . . . . . . . . . . . . . .',
      bass: 'C2 . . . . . . . - . . . . . . .',
      drums: 'x . . . . . . . . . . . . . . .',
    },
  },
  sequence: ['intro', 'tense', 'urgent', 'credit', 'end'],
};
