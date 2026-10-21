import { melody, type SfxRecipe } from '@/engine/audio/sfx/recipe';
import type { Patch } from '@/engine/audio/synth/patch';

/** Skills are the big moments: each gets a longer, layered signature sound. */

/** Front-end, back-end and database as three stacked oscillators firing one beam. */
export const fullStack: SfxRecipe = {
  cooldown: 0.3,
  maxInstances: 1,
  gain: 1.4,
  voices: [
    {
      patch: {
        wave: { type: 'saw' },
        env: { attack: 0.005, decay: 0.5, sustain: 0.2, release: 0.12 },
        gain: 0.3,
        unison: 20,
        sweep: { from: 12, to: -7, time: 0.45 },
        filter: { type: 'lowpass', frequency: 5000, to: 600, time: 0.5 },
      },
      note: 'C3',
      hold: 0.35,
      chord: [0, 7, 12],
    },
    {
      patch: {
        wave: { type: 'pulse', duty: 0.125 },
        env: { attack: 0.001, decay: 0.3, sustain: 0.3, release: 0.08 },
        gain: 0.16,
        arpSpeed: 0.03,
      },
      note: 'C6',
      hold: 0.3,
      arpeggio: [0, 7, 12, 19],
    },
    {
      patch: {
        wave: { type: 'noise', color: 'white' },
        env: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.05 },
        gain: 0.3,
        filter: { type: 'bandpass', frequency: 2400, q: 1, to: 500, time: 0.3 },
      },
      note: 'A4',
      hold: 0.2,
    },
  ],
};

/** An AI drone powers up: a computer chirp and a hovering, wobbling hum. */
export const agentSummon: SfxRecipe = {
  cooldown: 0.3,
  maxInstances: 1,
  gain: 1.4,
  voices: [
    ...melody(
      {
        wave: { type: 'pulse', duty: 0.25 },
        env: { attack: 0.001, decay: 0.07, sustain: 0.4, release: 0.03 },
        gain: 0.2,
      },
      'C5 G5 E5 C6 G6',
      { step: 0.05, hold: 0.04 },
    ),
    {
      patch: {
        wave: { type: 'fm', ratio: 2, index: 1.2 },
        env: { attack: 0.08, decay: 0.3, sustain: 0.6, release: 0.25 },
        gain: 0.18,
        vibrato: { rate: 11, depth: 45 },
        sweep: { from: -12, time: 0.25 },
      },
      note: 'G4',
      at: 0.2,
      hold: 0.45,
    },
  ],
};

/** The potion: a gulp, rising bubbles and a sparkle of insight. */
export const uxElixir: SfxRecipe = {
  cooldown: 0.3,
  maxInstances: 1,
  voices: [
    ...['C5', 'G5', 'E5', 'A5', 'D6'].map((note, index) => ({
      patch: {
        wave: { type: 'sine' as const },
        env: { attack: 0.002, decay: 0.06, sustain: 0, release: 0.02 },
        gain: 0.32,
        sweep: { from: -9, time: 0.05 },
      },
      note,
      at: index * 0.055,
      hold: 0.04,
    })),
    ...melody(
      {
        wave: { type: 'fm', ratio: 4, index: 1.5, indexTo: 0.1, indexTime: 0.5 },
        env: { attack: 0.001, decay: 0.7, sustain: 0, release: 0.2 },
        gain: 0.14,
      },
      'E6 G6 B6 D7',
      { step: 0.05, at: 0.28, hold: 0.3 },
    ),
  ],
};

/** One mighty strum: a bright FM power chord over a sub thump, with a pick scrape. */
export const powerChord: SfxRecipe = {
  cooldown: 0.3,
  maxInstances: 1,
  voices: [
    {
      patch: {
        wave: { type: 'fm', ratio: 1, index: 4.5, indexTo: 1.6, indexTime: 0.6 },
        env: { attack: 0.004, decay: 1, sustain: 0.3, release: 0.3 },
        gain: 0.34,
        vibrato: { rate: 5.5, depth: 15, delay: 0.35 },
        unison: 12,
      },
      note: 'E3',
      hold: 0.8,
      chord: [0, 7, 12],
    },
    {
      patch: {
        wave: { type: 'noise', color: 'white' },
        env: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 },
        gain: 0.3,
        filter: { type: 'bandpass', frequency: 3000, q: 1.4, to: 1200, time: 0.05 },
      },
      note: 'A4',
      hold: 0.05,
    },
    {
      patch: {
        wave: { type: 'sine' },
        env: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.05 },
        gain: 0.7,
        sweep: { from: 12, time: 0.08 },
      },
      note: 'E1',
      hold: 0.4,
    },
  ],
};

/** A guiding star launches and homes in: a twinkling, rising arpeggio. */
export const northStar: SfxRecipe = {
  cooldown: 0.3,
  maxInstances: 1,
  gain: 1.3,
  voices: [
    {
      patch: {
        wave: { type: 'pulse', duty: 0.125 },
        env: { attack: 0.001, decay: 0.5, sustain: 0.25, release: 0.1 },
        gain: 0.18,
        arpSpeed: 0.035,
        sweep: { from: -12, time: 0.35 },
      },
      note: 'E6',
      hold: 0.4,
      arpeggio: [0, 7, 12, 4],
    },
    {
      patch: {
        wave: { type: 'fm', ratio: 3.5, index: 2, indexTo: 0.1, indexTime: 0.6 },
        env: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.2 },
        gain: 0.16,
      },
      note: 'B6',
      at: 0.3,
      hold: 0.4,
    },
  ],
};

const shieldHum: Patch = {
  wave: { type: 'fm', ratio: 2, index: 1.4, indexTo: 0.4, indexTime: 0.5 },
  env: { attack: 0.06, decay: 0.4, sustain: 0.5, release: 0.3 },
  gain: 0.24,
  vibrato: { rate: 8, depth: 25 },
  filter: { type: 'lowpass', frequency: 400, q: 3, to: 3200, time: 0.3 },
};

/** A retention bubble forms: a swelling, shimmering hum. */
export const churnShield: SfxRecipe = {
  cooldown: 0.3,
  maxInstances: 1,
  voices: [
    { patch: shieldHum, note: 'C4', hold: 0.5, chord: [0, 7, 16] },
    ...melody(
      { wave: { type: 'triangle' }, env: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.08 }, gain: 0.18 },
      'G5 C6 E6 G6',
      { step: 0.07, at: 0.12, hold: 0.1 },
    ),
  ],
};
