import { DEFAULT_MIX } from '@/engine/audio/mix/Mixer';
import type { SfxRecipe, SfxVoice } from '@/engine/audio/sfx/recipe';
import type { Patch } from '@/engine/audio/synth/patch';
import type { RadioCue } from '../deck';

/**
 * The radio's mechanical sounds (SPEC §8.6): one synthesised engine recipe per cue the
 * room emits, plus the app's own `seek`. Small clicks, latches and motor sweeps at
 * −22 to −40 dBFS under the music, nothing continuous: a real CD motor is silent at
 * speed. Pure data.
 */

export type FoleyCue = RadioCue | 'seek';

/** The effects bus and master a recipe passes through (the engine's mixer): a recipe's gain targets its level after them. */
const BUS = DEFAULT_MIX.sfx * DEFAULT_MIX.master;
/**
 * Recipe gain for a peak of `db` dBFS. `shortfall` is how far below full scale the recipe's voices
 * peak together at gain 1 (clicks a few milliseconds long, filtered noise and decays never reach
 * it; a sweep with a long hold overshoots), measured by rendering them offline; the end-to-end
 * check (e2e/radio-player.spec.ts) holds every cue to within 3 dB of its level.
 */
const level = (db: number, shortfall: number): number => 10 ** ((db + shortfall) / 20) / BUS;

/** A bare envelope: `ms` long, a sharp attack and an exponential tail. */
function short(ms: number, attack = 0.0005): Patch['env'] {
  return { attack, decay: ms / 1000, sustain: 0, release: Math.max(0.002, ms / 4000) };
}

const tick = (note: string, ms: number, at = 0, velocity = 1): SfxVoice => ({
  patch: { wave: { type: 'pulse', duty: 0.5 }, env: short(ms), filter: { type: 'highpass', frequency: 700 } },
  note,
  at,
  hold: ms / 2000,
  velocity,
});

const sine = (note: string, ms: number, at = 0, velocity = 1, attack = 0.0005): SfxVoice => ({
  patch: { wave: { type: 'sine' }, env: short(ms, attack) },
  note,
  at,
  hold: ms / 2000,
  velocity,
});

const noise = (
  ms: number,
  filter: NonNullable<Patch['filter']>,
  options: { readonly at?: number; readonly velocity?: number; readonly attack?: number } = {},
): SfxVoice => ({
  patch: { wave: { type: 'noise', color: 'white' }, env: short(ms, options.attack), filter },
  note: 'A4',
  at: options.at ?? 0,
  hold: ms / 2000,
  velocity: options.velocity ?? 1,
});

/** A whoosh: noise through a band that sweeps from `from` to `to` Hz over `ms`. */
const whoosh = (ms: number, from: number, to: number, velocity = 1): SfxVoice => ({
  patch: {
    wave: { type: 'noise', color: 'white' },
    env: { attack: ms / 4000, decay: ms / 1000, sustain: 0, release: 0.04 },
    filter: { type: 'bandpass', frequency: from, q: 1.4, to, time: ms / 1000 },
  },
  note: 'A4',
  hold: (ms / 1000) * 0.6,
  velocity,
});

/** A small glassy bell, for the discs' rise and sink. */
const chime = (note: string, velocity: number, at = 0.03): SfxVoice => ({
  patch: {
    wave: { type: 'fm', ratio: 3.5, index: 1.4, indexTo: 0.1, indexTime: 0.3 },
    env: { attack: 0.002, decay: 0.45, sustain: 0, release: 0.15 },
  },
  note,
  at,
  hold: 0.05,
  velocity,
});

/** A key's click: the plastic leaving its rest (higher) or landing back (lower). */
const keyClick = (note: string, shortfall: number): SfxRecipe => ({
  gain: level(-24, shortfall),
  cooldown: 0.02,
  maxInstances: 4,
  voices: [noise(8, { type: 'highpass', frequency: 3000 }, { velocity: 0.55 }), sine(note, 12, 0.001, 0.75)],
});

/** The pentatonic bell each disc sounds as it rises, in its place in the stagger (SPEC §3.2). */
export const RISE_NOTES = ['C5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7', 'E7'] as const;
/** The same chord descending as the discs sink home. */
export const SINK_NOTES = ['C6', 'A5', 'G5', 'E5', 'C5', 'A4', 'G4', 'E4', 'D4', 'C4', 'A3', 'G3'] as const;

/** Spin-up: the motor's whine rising 90 → 310 Hz over 0.9 s, its hiss, and three servo ticks as the laser focuses. */
const spinUp: SfxRecipe = {
  gain: level(-34, -4.7),
  cooldown: 0.1,
  maxInstances: 2,
  voices: [
    {
      patch: {
        wave: { type: 'sine' },
        env: { attack: 0.06, decay: 0.9, sustain: 0.55, release: 0.22 },
        sweep: { from: -21.4, to: 0, time: 0.9 },
      },
      note: 'D#4',
      hold: 0.9,
      velocity: 0.8,
    },
    {
      patch: {
        wave: { type: 'noise', color: 'white' },
        env: { attack: 0.15, decay: 0.75, sustain: 0, release: 0.15 },
        filter: { type: 'bandpass', frequency: 300, q: 2, to: 1300, time: 0.9 },
      },
      note: 'A4',
      hold: 0.75,
      velocity: 0.5,
    },
    tick('E6', 3, 0.06, 0.5),
    tick('E6', 3, 0.13, 0.45),
    tick('E6', 3, 0.2, 0.4),
  ],
};

/** Spin-down: the whine falling 310 → 60 Hz over 1.1 s as the disc coasts to a stop. */
const spinDown: SfxRecipe = {
  gain: level(-34, 0.4),
  cooldown: 0.1,
  maxInstances: 2,
  voices: [
    {
      patch: {
        wave: { type: 'sine' },
        env: { attack: 0.01, decay: 1.1, sustain: 0.2, release: 0.2 },
        sweep: { from: 28.4, to: 0, time: 1.1 },
      },
      note: 'B1',
      hold: 1.05,
      velocity: 0.8,
    },
    {
      patch: {
        wave: { type: 'noise', color: 'white' },
        env: { attack: 0.01, decay: 0.9, sustain: 0, release: 0.15 },
        filter: { type: 'bandpass', frequency: 1200, q: 2, to: 250, time: 1 },
      },
      note: 'A4',
      hold: 0.8,
      velocity: 0.45,
    },
  ],
};

const FIXED: Readonly<Record<Exclude<FoleyCue, 'disc-rise' | 'disc-sink'>, SfxRecipe>> = {
  'power-on': {
    gain: level(-30, 7.4),
    cooldown: 0.2,
    maxInstances: 1,
    voices: [tick('A#6', 3), noise(20, { type: 'highpass', frequency: 2500 }, { at: 0.002, velocity: 0.5 })],
  },
  'lid-push': keyClick('C7', 10.8),
  'key-down': keyClick('C7', 10.8),
  'key-up': keyClick('G#6', 10.5),
  'lid-unlatch': {
    gain: level(-24, 6.7),
    cooldown: 0.05,
    maxInstances: 1,
    voices: [tick('D7', 4), tick('D7', 4, 0.018, 0.8)],
  },
  'lid-swing': { gain: level(-34, 13.3), cooldown: 0.1, maxInstances: 1, voices: [whoosh(280, 600, 300)] },
  'lid-stop': {
    gain: level(-28, 10.3),
    cooldown: 0.05,
    maxInstances: 1,
    voices: [sine('C#3', 40), noise(40, { type: 'lowpass', frequency: 1000 }, { velocity: 0.5 })],
  },
  'lid-close': { gain: level(-22, 17.3), cooldown: 0.1, maxInstances: 1, voices: [whoosh(220, 500, 260, 0.8)] },
  'lid-latch': {
    gain: level(-22, 9.7),
    cooldown: 0.05,
    maxInstances: 1,
    voices: [noise(20, { type: 'highpass', frequency: 2000 }, { velocity: 0.6 }), sine('A5', 15, 0.002, 0.8)],
  },
  'disc-flip': { gain: level(-40, 9.8), cooldown: 0.015, maxInstances: 6, voices: [sine('F#8', 5)] },
  'disc-pick': { gain: level(-30, 7.2), cooldown: 0.05, maxInstances: 2, voices: [sine('E7', 60, 0, 1, 0.012)] },
  'disc-seat': {
    gain: level(-24, 9.8),
    cooldown: 0.05,
    maxInstances: 2,
    voices: [noise(8, { type: 'highpass', frequency: 4000 }, { velocity: 0.6 }), sine('D6', 25, 0.001, 0.8)],
  },
  'disc-unseat': {
    gain: level(-24, 10.7),
    cooldown: 0.05,
    maxInstances: 2,
    voices: [noise(8, { type: 'highpass', frequency: 4000 }, { velocity: 0.6 }), sine('D6', 25, 0.001, 0.7)],
  },
  'spin-up': spinUp,
  'spin-down': spinDown,
  seek: { gain: level(-30, -1.8), cooldown: 0.05, maxInstances: 2, voices: [tick('A6', 3), tick('A6', 3, 0.07)] },
};

const rises = RISE_NOTES.map(
  (note): SfxRecipe => ({
    gain: level(-32, 4.4),
    cooldown: 0.02,
    maxInstances: 1,
    voices: [whoosh(200, 800, 2400, 0.7), chime(note, 10 ** ((-36 + 32) / 20))],
  }),
);
const sinks = SINK_NOTES.map(
  (note): SfxRecipe => ({
    gain: level(-36, 2.4),
    cooldown: 0.02,
    maxInstances: 1,
    voices: [whoosh(200, 2400, 800, 0.7), chime(note, 0.8)],
  }),
);

/** The recipe for a cue; disc cues ring the note of their place in the stagger. */
export function foleyRecipe(cue: FoleyCue, order = 0): SfxRecipe {
  const index = Math.max(0, Math.min(RISE_NOTES.length - 1, Math.round(order)));
  if (cue === 'disc-rise') return rises[index] as SfxRecipe;
  if (cue === 'disc-sink') return sinks[index] as SfxRecipe;
  return FIXED[cue];
}

/** The limiter's id for a cue: each disc's bell is its own, so a stagger of five is never cut short. */
export function foleyId(cue: FoleyCue, order = 0): string {
  return cue === 'disc-rise' || cue === 'disc-sink' ? `${cue}:${Math.round(order)}` : cue;
}

/** Every cue the foley answers, for the lab and the checks. */
export const FOLEY_CUES: readonly FoleyCue[] = [
  'power-on',
  'lid-push',
  'lid-unlatch',
  'lid-swing',
  'lid-stop',
  'lid-close',
  'lid-latch',
  'disc-rise',
  'disc-flip',
  'disc-sink',
  'disc-pick',
  'disc-seat',
  'disc-unseat',
  'key-down',
  'key-up',
  'spin-up',
  'spin-down',
  'seek',
];

/** The level each cue is mixed to, dBFS (SPEC §8.6), for the offline checks. */
export const FOLEY_LEVELS: Readonly<Record<FoleyCue, number>> = {
  'power-on': -30,
  'lid-push': -24,
  'key-down': -24,
  'key-up': -24,
  'lid-unlatch': -24,
  'lid-swing': -34,
  'lid-stop': -28,
  'lid-close': -22,
  'lid-latch': -22,
  'disc-rise': -32,
  'disc-sink': -36,
  'disc-flip': -40,
  'disc-pick': -30,
  'disc-seat': -24,
  'disc-unseat': -24,
  'spin-up': -34,
  'spin-down': -34,
  seek: -30,
};
