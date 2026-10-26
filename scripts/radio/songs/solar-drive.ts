import { bars, fill, repeat } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import { riser } from '@/game/audio/instruments/patches';
import { driveKit, gridPluck, neonLead, neonPad, sawBass } from './instruments';

/**
 * Solar Drive, by Neon Rafters (placeholder): synthwave at 104 bpm in A minor.
 * Octave saw bass in eighths, gated snares, wide saw chords, sixteenth-note
 * arpeggios and a lead with a dotted-eighth echo.
 */

/** A type, not an interface: `fill` takes it as a plain record of notes. */
type Chord = {
  /** Pad voicing. */
  readonly v: string;
  /** Bass root and octave. */
  readonly r: string;
  readonly o: string;
  /** Arpeggio tones, low to high. */
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

const Am = chord('A3[37]', 'A1 A2', 'A3 C4 E4 A4');
const F = chord('A3[38]', 'F1 F2', 'F3 A3 C4 F4');
const C = chord('G3[59]', 'C2 C3', 'C4 E4 G4 C5');
const G = chord('G3[47]', 'G1 G2', 'G3 B3 D4 G4');
const Em = chord('G3[49]', 'E1 E2', 'E3 G3 B3 E4');
const Dm = chord('A3[58]', 'D2 D3', 'D3 F3 A3 D4');
const E = chord('G#3[38]', 'E1 E2', 'E3 G#3 B3 E4');
const A = chord('A3[47c]', 'A1 A2', 'A3 C#4 E4 A4');

const over = (template: string, chords: readonly Chord[]): string => bars(...chords.map((c) => fill(template, c)));
const octaves = 'r . o . r . o . r . o . r . o .';
const arp = 'a b c d a b c d a b c d a b c d';
const held = 'v . . . . . . . . . . . . . . .';
const fourFloor = 'k . . . k . . . k . . . k . . .';
const backbeat = '. . . . g . . . . . . . g . . .';
const backbeatFill = '. . . . g . . . . . . . g . g g';
const sixteenths = 'h:3 . h:8 h:3 h:3 . h:8 h:3 h:3 . h:8 h:3 h:3 . h:8 h:4';

// ── Overdrive ───────────────────────────────────────────────────────────────────

const drive = [Am, F, C, G, Am, F, C, G] as const;
const lift = [F, G, Am, Am] as const;

export const overdrive: Song = {
  bpm: 104,
  echo: { beats: 0.75, feedback: 0.35, tone: 2800 },
  channels: {
    lead: { patch: neonLead, echo: 0.35 },
    pad: { patch: neonPad, play: 'chord', pan: -0.1 },
    arp: { patch: gridPluck, echo: 0.2, pan: 0.25 },
    bass: { patch: sawBass },
    kick: { kit: driveKit },
    snare: { kit: driveKit },
    hats: { kit: driveKit, pan: 0.2 },
    rise: { patch: riser },
  },
  patterns: {
    // Headlights on: chords and the arpeggio, then the kick, the hats and a rising wash.
    intro: {
      pad: over(held, [Am, F, C, G]),
      arp: over(arp, [Am, F, C, G]),
      kick: bars('-', '.', fourFloor, fourFloor),
      hats: bars('-', '.', '-', sixteenths),
      rise: bars('-', '.', 'A4 . . . . . . . . . . . . . . .', '. . . . . . . . . . . . . . - .'),
    },
    verse: {
      lead: bars(
        'E5 . . . . . . . . . A5 . G5 . E5 .',
        'F5 . . . . . . . C5 . . . . . . .',
        'E5 . . . G5 . . . C6 . . . B5 . G5 .',
        'D5 . . . . . . . . . . . B4 . D5 .',
        'E5 . . . . . . . . . A5 . B5 . C6 .',
        'A5 . . . . . . . F5 . . . A5 . C6 .',
        'G5 . . . . . E5 . . . C5 . . . E5 .',
        'D5 . . . . . . . - . . . . . . .',
      ),
      pad: over(held, drive),
      arp: over(arp, drive),
      bass: over(octaves, drive),
      kick: repeat(fourFloor, 8),
      snare: bars(repeat(backbeat, 7), backbeatFill),
      hats: repeat(sixteenths, 8),
    },
    lift: {
      lead: bars(
        'C6 . . . . . . . A5 . . . C6 . D6 .',
        'D6 . . . . . . . B5 . . . G5 . . .',
        'E6 . . . . . . . . . . . D6 . C6 .',
        'B5 . . . . . A5 . . . . . - . . .',
      ),
      pad: over(held, lift),
      arp: over(arp, lift),
      bass: over(octaves, lift),
      kick: repeat(fourFloor, 4),
      snare: bars(repeat(backbeat, 3), backbeatFill),
      hats: repeat(sixteenths, 4),
    },
    // Off the motorway: the tune once more, then the band stops on the tonic.
    outro: {
      lead: bars(
        'A5 . . . . . . . C6 . . . F6 . . .',
        'D6 . . . . . . . B5 . . . G5 . . .',
        'A5 . . . . . . . . . . . . . . .',
        '. . . . . . . . . . . . . . . .',
      ),
      pad: over(held, [F, G, Am, Am]),
      arp: bars(over(arp, [F, G, Am]), 'A3 C4 E4 A4 C5 E5 A5 . . . . . . . . .'),
      bass: bars(over(octaves, [F, G, Am]), 'A1 . . . . . . . . . . . . . . .'),
      kick: bars(fourFloor, fourFloor, fourFloor, 'k . . . . . . . . . . . . . . .'),
      snare: bars(backbeat, backbeat, backbeatFill, 'x . . . . . . . . . . . . . . .'),
      hats: bars(sixteenths, sixteenths, sixteenths, '-'),
    },
  },
  sequence: ['intro', 'verse', 'lift', 'outro'],
};

// ── Last Exit ───────────────────────────────────────────────────────────────────

const road = [Am, Em, F, G, Am, Em, F, G] as const;
const exit = [Dm, Am, F, E] as const;
const halfTime = 'k . . . . . . . . . k . . . . .';
const halfBack = '. . . . . . . . g . . . . . . .';
const halfFill = '. . . . . . . . g . . . g . g g';
const eighths = 'h:6 . h:3 . h:6 . h:3 . h:6 . h:3 . h:6 . h:3 .';

export const lastExit: Song = {
  bpm: 104,
  echo: { beats: 0.75, feedback: 0.38, tone: 2400 },
  channels: {
    lead: { patch: neonLead, echo: 0.4, pan: 0.05 },
    pad: { patch: neonPad, play: 'chord', pan: -0.15 },
    arp: { patch: gridPluck, echo: 0.25, pan: 0.25 },
    bass: { patch: sawBass },
    kick: { kit: driveKit },
    snare: { kit: driveKit },
    hats: { kit: driveKit, pan: -0.2 },
  },
  patterns: {
    intro: {
      arp: over(arp, [Am, Em, F, G]),
      pad: bars('-', '.', fill(held, F), fill(held, G)),
    },
    road: {
      lead: bars(
        'C5 . . . . . . . B4 . . . A4 . . .',
        'G4 . . . . . . . E4 . . . . . . .',
        'A4 . . . C5 . . . F5 . . . E5 . . .',
        'D5 . . . . . . . . . . . B4 . . .',
        'E5 . . . . . . . D5 . . . C5 . . .',
        'B4 . . . . . . . G4 . . . E4 . . .',
        'F4 . . . A4 . . . C5 . . . F5 . . .',
        'G5 . . . . . . . - . . . . . . .',
      ),
      pad: over(held, road),
      arp: over(arp, road),
      bass: over(octaves, road),
      kick: repeat(halfTime, 8),
      snare: bars(repeat(halfBack, 7), halfFill),
      hats: repeat(eighths, 8),
    },
    // The slip road: borrowed E major pulls towards home.
    exit: {
      lead: bars(
        'F5 . . . . . . . E5 . . . D5 . . .',
        'C5 . . . . . . . E5 . . . A5 . . .',
        'A5 . . . . . G5 . F5 . . . C5 . . .',
        'B4 . . . . . . . G#4 . . . E5 . . .',
      ),
      pad: over(held, exit),
      arp: over(arp, exit),
      bass: over(octaves, exit),
      kick: repeat(fourFloor, 4),
      snare: bars(backbeat, backbeat, backbeat, backbeatFill),
      hats: repeat(sixteenths, 4),
    },
    outro: {
      lead: bars(
        'A5 . . . . . . . . . . . G5 . E5 .',
        'E5 . . . . . . . . . . . D5 . B4 .',
        'C5 . . . . . . . F5 . . . A5 . . .',
        'G5 . . . . . . . B5 . . . . . . .',
      ),
      pad: over(held, [Am, Em, F, G]),
      arp: over(arp, [Am, Em, F, G]),
      bass: over(octaves, [Am, Em, F, G]),
      kick: repeat(fourFloor, 4),
      snare: bars(backbeat, backbeat, backbeat, backbeatFill),
      hats: repeat(sixteenths, 4),
    },
    // Home, and in a major key: the last chord is A major.
    end: {
      lead: 'C#6 . . . . . . . . . . . . . . .',
      pad: fill(held, A),
      arp: 'A3 C#4 E4 A4 C#5 E5 A5 . . . . . . . . .',
      bass: 'A1 . . . . . . . . . . . . . . .',
      kick: 'k . . . . . . . . . . . . . . .',
      snare: 'x . . . . . . . . . . . . . . .',
    },
  },
  sequence: ['intro', 'road', 'exit', 'outro', 'end'],
};
