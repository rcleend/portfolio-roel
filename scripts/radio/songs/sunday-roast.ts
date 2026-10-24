import { bars, fill, repeat } from '@/engine/audio/sequencer/compose';
import type { Song } from '@/engine/audio/sequencer/song';
import type { Patch } from '@/engine/audio/synth/patch';
import { bossaKeys, brushKit, flute, uprightBass } from './instruments';

/**
 * Sunday Roast, by Trio Placeholder (placeholder): bossa nova at 126 bpm with a
 * light swing, rootless E♭ major-seventh voicings, an upright-ish bass on the
 * bossa's dotted figure, brushes and a cross-stick clave.
 */

/** Vibraphone: a soft FM mallet with a slow shimmer. */
const vibes: Patch = {
  wave: { type: 'fm', ratio: 4, index: 1.1, indexTo: 0.1, indexTime: 0.4 },
  env: { attack: 0.002, decay: 1.5, sustain: 0, release: 0.5 },
  gain: 0.2,
  vibrato: { rate: 5.5, depth: 9, delay: 0.1 },
};

/** A type, not an interface: `fill` takes it as a plain record of notes. */
type Chord = {
  /** Rootless voicing. */
  readonly v: string;
  /** Bass root and fifth. */
  readonly r: string;
  readonly f: string;
};

const chord = (v: string, bass: string): Chord => {
  const [r = '', f = ''] = bass.split(' ');
  return { v, r, f };
};

const Ebmaj9 = chord('G3[37a]', 'Eb2 Bb1');
const Fm9 = chord('Ab3[47b]', 'F2 C2');
const Bb13 = chord('Ab3[6b]', 'Bb1 F2');
const Gm7 = chord('F3[59]', 'G2 D2');
const C9 = chord('Bb3[69]', 'C2 G1');
const Abmaj7 = chord('G3[58]', 'Ab1 Eb2');
const Abm7 = chord('F#3[59]', 'Ab1 Eb2');
const Db9 = chord('F3[6a]', 'Db2 Ab1');
const Cm9 = chord('Eb3[47b]', 'C2 G1');

const over = (template: string, chords: readonly Chord[]): string => bars(...chords.map((c) => fill(template, c)));
/** A bar with two chords, two beats each. */
const split = (template: string, first: Chord, second: Chord): string => {
  const tokens = template.split(/\s+/);
  return `${fill(tokens.slice(0, 8).join(' '), first)} ${fill(tokens.slice(8).join(' '), second)}`;
};

/** The bossa bass: root for a dotted quarter, the fifth on the "and", and again. */
const bossaBass = 'r . . . . . f . r . . . . . f .';
/** The guitar's two-bar figure, as sixteenths. */
const compA = 'v . . . v . . . . . v . . . v .';
const compB = '. . v . . . v . . . . . v . . .';
const comp = (chords: readonly Chord[]): string =>
  bars(...chords.map((c, index) => fill(index % 2 === 0 ? compA : compB, c)));
const clave = 'c . . c . . c . . . c . . c . .';
const brushes = 't:3 t:2 t:5 t:2 s t:2 t:5 t:2 t:3 t:2 t:5 t:2 s t:2 t:5 t:3';
const kick = 'k:6 . . . . . k:4 . k:6 . . . . . k:4 .';

// ── Coffee Break ────────────────────────────────────────────────────────────────

const coffeeA = [Ebmaj9, Ebmaj9, Fm9, Bb13, Gm7, C9, Fm9, Bb13] as const;

export const coffeeBreak: Song = {
  bpm: 126,
  swing: 0.12,
  echo: { beats: 0.75, feedback: 0.22, tone: 2600 },
  channels: {
    flute: { patch: flute, echo: 0.25, pan: 0.1 },
    keys: { patch: bossaKeys, play: 'chord', pan: -0.2 },
    bass: { patch: uprightBass },
    clave: { kit: brushKit, pan: 0.3 },
    brushes: { kit: brushKit, pan: -0.1 },
    kick: { kit: brushKit },
  },
  patterns: {
    intro: {
      keys: comp([Ebmaj9, Ebmaj9]),
      clave: repeat(clave, 2),
      bass: bars('-', '. . . . . . . . . . . . . . Bb1 .'),
    },
    a: {
      flute: bars(
        'G5 . . . . . F5 . G5 . . . Bb5 . . .',
        'D5 . . . . . . . . . . . - . Eb5 F5',
        'Ab5 . . . . . G5 . Ab5 . . . C6 . . .',
        'Bb5 . . . . . Ab5 . F5 . . . D5 . . .',
        'F5 . . . . . D5 . Bb4 . . . D5 . F5 .',
        'E5 . . . . . . . G5 . . . Bb5 . . .',
        'Ab5 . . . . . G5 . F5 . . . Eb5 . . .',
        'D5 . . . . . . . - . . . . . . .',
      ),
      keys: comp(coffeeA),
      bass: over(bossaBass, coffeeA),
      clave: repeat(clave, 8),
      brushes: repeat(brushes, 8),
      kick: repeat(kick, 8),
    },
    b: {
      flute: bars(
        'C6 . . . . . Bb5 . G5 . . . Eb5 . . .',
        'B5 . . . . . Ab5 . F5 . . . Eb5 . . .',
        'D5 . . . . . F5 . Bb5 . . . A5 . . .',
        'G5 . . . . . E5 . . . . . - . . .',
        'Ab5 . . . . . C6 . Bb5 . . . Ab5 . . .',
        'G5 . . . . . F5 . D5 . . . Bb4 . . .',
        'Eb5 . . . G5 . . . Bb5 . . . D6 . . .',
        'C6 . . . . . . . Bb5 . . . Ab5 . F5 .',
      ),
      keys: bars(
        fill(compA, Abmaj7),
        split(compB, Abm7, Db9),
        fill(compA, Gm7),
        fill(compB, C9),
        fill(compA, Fm9),
        fill(compB, Bb13),
        fill(compA, Ebmaj9),
        fill(compB, Bb13),
      ),
      bass: bars(
        fill(bossaBass, Abmaj7),
        split(bossaBass, Abm7, Db9),
        fill(bossaBass, Gm7),
        fill(bossaBass, C9),
        fill(bossaBass, Fm9),
        fill(bossaBass, Bb13),
        fill(bossaBass, Ebmaj9),
        fill(bossaBass, Bb13),
      ),
      clave: repeat(clave, 8),
      brushes: repeat(brushes, 8),
      kick: repeat(kick, 8),
    },
    again: {
      flute: bars(
        'G5 . . . . . F5 . G5 . . . Bb5 . . .',
        'Ab5 . . . . . G5 . F5 . . . D5 . . .',
        'Eb5 . . . . . . . . . . . . . . .',
        '- . . . . . . . . . Bb5 . G5 . F5 .',
      ),
      keys: bars(fill(compA, Ebmaj9), split(compB, Fm9, Bb13), fill(compA, Ebmaj9), fill(compB, Ebmaj9)),
      bass: bars(
        fill(bossaBass, Ebmaj9),
        split(bossaBass, Fm9, Bb13),
        fill(bossaBass, Ebmaj9),
        fill(bossaBass, Ebmaj9),
      ),
      clave: repeat(clave, 4),
      brushes: repeat(brushes, 4),
      kick: repeat(kick, 4),
    },
    end: {
      flute: 'Eb5 . . . . . . . . . . . . . . .',
      keys: 'G3[37a]:8 . . . . . . . . . . . . . . .',
      bass: 'Eb2 . . . . . . . . . . . . . . .',
      clave: 'c . . . . . . . . . . . . . . .',
      kick: 'k:6 . . . . . . . . . . . . . . .',
    },
  },
  sequence: ['intro', 'a', 'b', 'again', 'end'],
};

// ── Encore ──────────────────────────────────────────────────────────────────────

const encoreA = [Fm9, Bb13, Ebmaj9, Cm9, Fm9, Bb13] as const;
/** The six-bar verse, then the bar of Gm7–C9 and the bar of Fm9–B♭13 that turn it round. */
const encoreKeys = (): string => bars(comp(encoreA), split(compA, Gm7, C9), split(compB, Fm9, Bb13));
const encoreBass = (): string => bars(over(bossaBass, encoreA), split(bossaBass, Gm7, C9), split(bossaBass, Fm9, Bb13));

export const encore: Song = {
  bpm: 126,
  swing: 0.12,
  echo: { beats: 0.75, feedback: 0.25, tone: 2800 },
  channels: {
    vibes: { patch: vibes, echo: 0.3, pan: 0.15 },
    flute: { patch: flute, echo: 0.25, pan: -0.05 },
    keys: { patch: bossaKeys, play: 'chord', pan: -0.2 },
    bass: { patch: uprightBass },
    clave: { kit: brushKit, pan: 0.3 },
    brushes: { kit: brushKit, pan: -0.1 },
    kick: { kit: brushKit },
  },
  patterns: {
    count: {
      keys: fill(compB, Bb13),
      clave: clave,
      bass: '. . . . . . . . . . . . . . Bb1 .',
    },
    vibes: {
      vibes: bars(
        'C6 . . Ab5 . . F5 . . . G5 . Ab5 . . .',
        'Bb5 . . . . . G5 . . . F5 . D5 . . .',
        'Eb5 . . G5 . . Bb5 . D6 . . . . . . .',
        'C6 . . . Bb5 . . . G5 . . . Eb5 . . .',
        'F5 . . Ab5 . . C6 . . . Eb6 . C6 . . .',
        'D6 . . . . . C6 . Bb5 . . . Ab5 . . .',
        'G5 . . . Bb5 . . . E5 . . . G5 . . .',
        'Ab5 . . . . . . . F5 . . . D5 . . .',
      ),
      keys: encoreKeys(),
      bass: encoreBass(),
      clave: repeat(clave, 8),
      brushes: repeat(brushes, 8),
      kick: repeat(kick, 8),
    },
    flute: {
      flute: bars(
        'Ab5 . . . G5 . . . F5 . . . C5 . . .',
        'D5 . . . . . F5 . Ab5 . . . G5 . . .',
        'G5 . . . . . . . Bb5 . . . D6 . . .',
        'Eb6 . . . D6 . . . C6 . . . G5 . . .',
        'Ab5 . . . . . C6 . Bb5 . . . Ab5 . . .',
        'G5 . . . . . F5 . . . D5 . . . . .',
        'Bb5 . . . A5 . . . G5 . . . E5 . . .',
        'F5 . . . . . . . D5 . . . Bb4 . . .',
      ),
      vibes: bars('-', '.', 'G4 . . . . . . . . . . . . . . .', '-', '.', '.', '.', '.'),
      keys: encoreKeys(),
      bass: encoreBass(),
      clave: repeat(clave, 8),
      brushes: repeat(brushes, 8),
      kick: repeat(kick, 8),
    },
    // The tag: the turnaround three times, the flute and the vibes trading the same lick.
    tag: {
      flute: bars('Ab5 . . G5 . . F5 . D5 . . . Bb4 . . .', '-', 'Ab5 . . G5 . . F5 . D5 . . . Bb4 . . .'),
      vibes: bars('-', 'Ab5 . . G5 . . F5 . D5 . . . Bb4 . . .', '-'),
      keys: bars(split(compA, Fm9, Bb13), split(compB, Fm9, Bb13), split(compA, Fm9, Bb13)),
      bass: bars(split(bossaBass, Fm9, Bb13), split(bossaBass, Fm9, Bb13), split(bossaBass, Fm9, Bb13)),
      clave: repeat(clave, 3),
      brushes: repeat(brushes, 3),
      kick: repeat(kick, 3),
    },
    end: {
      vibes: 'Eb5 G5 Bb5 D6 F6 . . . . . . . . . . .',
      flute: 'Eb6 . . . . . . . . . . . . . . .',
      keys: 'G3[37a]:8 . . . . . . . . . . . . . . .',
      bass: 'Eb2 . . . . . . . . . . . . . . .',
      clave: 'c . . . . . . . . . . . . . . .',
      kick: 'k:6 . . . . . . . . . . . . . . .',
    },
  },
  sequence: ['count', 'vibes', 'flute', 'tag', 'end'],
};
