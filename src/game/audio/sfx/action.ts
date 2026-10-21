import type { SfxRecipe } from '@/engine/audio/sfx/recipe';
import type { Patch } from '@/engine/audio/synth/patch';

const noiseBurst = (filter: Patch['filter'], decay: number, gain: number): Patch => ({
  wave: { type: 'noise', color: 'white' },
  env: { attack: 0.001, decay, sustain: 0, release: 0.04 },
  gain,
  ...(filter ? { filter } : {}),
});

export const explosion: SfxRecipe = {
  cooldown: 0.08,
  maxInstances: 2,
  voices: [
    {
      patch: noiseBurst({ type: 'lowpass', frequency: 4000, q: 1, to: 140, time: 0.7 }, 0.9, 0.85),
      note: 'A4',
      hold: 0.5,
    },
    {
      patch: {
        wave: { type: 'sine' },
        env: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.05 },
        gain: 0.9,
        sweep: { from: 14, to: -3, time: 0.3 },
      },
      note: 'A1',
      hold: 0.3,
    },
    { patch: noiseBurst({ type: 'highpass', frequency: 2500 }, 0.35, 0.18), note: 'C4', at: 0.06, hold: 0.25 },
  ],
};

/** Screen flash: a bright metallic shimmer with an upward zip. */
export const flash: SfxRecipe = {
  cooldown: 0.1,
  maxInstances: 1,
  gain: 1.4,
  voices: [
    {
      patch: {
        wave: { type: 'noise', color: 'metallic' },
        env: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.1 },
        gain: 0.22,
        filter: { type: 'highpass', frequency: 5000 },
      },
      note: 'A6',
      hold: 0.3,
    },
    {
      patch: {
        wave: { type: 'pulse', duty: 0.125 },
        env: { attack: 0.001, decay: 0.15, sustain: 0.2, release: 0.08 },
        gain: 0.18,
        sweep: { from: -12, to: 12, time: 0.12 },
      },
      note: 'C6',
      hold: 0.12,
    },
  ],
};

export const jump: SfxRecipe = {
  cooldown: 0.06,
  maxInstances: 2,
  gain: 1.6,
  voices: [
    {
      patch: {
        wave: { type: 'pulse', duty: 0.25 },
        env: { attack: 0.001, decay: 0.12, sustain: 0.3, release: 0.04 },
        gain: 0.26,
        sweep: { from: -5, to: 9, time: 0.13 },
      },
      note: 'C5',
      hold: 0.11,
    },
  ],
};

/** A soft thud: landing happens constantly, so it must stay in the background. */
export const land: SfxRecipe = {
  cooldown: 0.08,
  maxInstances: 1,
  gain: 0.9,
  voices: [
    {
      patch: {
        wave: { type: 'triangle' },
        env: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.03 },
        gain: 0.5,
        sweep: { from: 6, time: 0.05 },
      },
      note: 'E2',
      hold: 0.06,
    },
    { patch: noiseBurst({ type: 'lowpass', frequency: 700 }, 0.05, 0.3), note: 'A4', hold: 0.04 },
  ],
};

/** Code bolt: a fast bit-flipping zap. */
export const attackCode: SfxRecipe = {
  cooldown: 0.05,
  maxInstances: 3,
  gain: 2,
  voices: [
    {
      patch: {
        wave: { type: 'pulse', duty: 0.125 },
        env: { attack: 0.001, decay: 0.1, sustain: 0.3, release: 0.04 },
        gain: 0.22,
        arpSpeed: 0.022,
      },
      note: 'C6',
      hold: 0.09,
      arpeggio: [0, 12, 7, 19, 5],
    },
    {
      patch: {
        wave: { type: 'pulse', duty: 0.5 },
        env: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.03 },
        gain: 0.14,
        sweep: { from: 12, to: -12, time: 0.12 },
      },
      note: 'G5',
      hold: 0.1,
    },
  ],
};

/** Paint splat: a wet swish ending in a blob. */
export const attackPaint: SfxRecipe = {
  cooldown: 0.05,
  maxInstances: 3,
  voices: [
    {
      patch: noiseBurst({ type: 'bandpass', frequency: 3200, q: 2, to: 700, time: 0.14 }, 0.16, 0.5),
      note: 'A4',
      hold: 0.12,
    },
    {
      patch: {
        wave: { type: 'sine' },
        env: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.03 },
        gain: 0.4,
        sweep: { from: 7, to: -10, time: 0.12 },
      },
      note: 'G4',
      at: 0.06,
      hold: 0.08,
    },
  ],
};

/** Sticky note: a papery flick and a little pop as it sticks. */
export const attackNote: SfxRecipe = {
  cooldown: 0.05,
  maxInstances: 3,
  gain: 1.6,
  voices: [
    {
      patch: noiseBurst({ type: 'bandpass', frequency: 1800, q: 1.5, to: 5200, time: 0.06 }, 0.07, 0.42),
      note: 'A4',
      hold: 0.05,
    },
    {
      patch: {
        wave: { type: 'pulse', duty: 0.25 },
        env: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
        gain: 0.2,
        sweep: { from: -7, time: 0.03 },
      },
      note: 'D6',
      at: 0.05,
      hold: 0.04,
    },
  ],
};

/** An attack lands on a customer: a short punch. */
export const hit: SfxRecipe = {
  cooldown: 0.04,
  maxInstances: 3,
  gain: 2.2,
  voices: [
    { patch: noiseBurst({ type: 'bandpass', frequency: 1500, q: 1 }, 0.07, 0.6), note: 'A4', hold: 0.05 },
    {
      patch: {
        wave: { type: 'pulse', duty: 0.5 },
        env: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.02 },
        gain: 0.26,
        sweep: { from: 12, to: -12, time: 0.07 },
      },
      note: 'C4',
      hold: 0.06,
    },
  ],
};

/** The player is hurt: a falling, dissonant blare. */
export const hurt: SfxRecipe = {
  cooldown: 0.2,
  maxInstances: 1,
  voices: [
    {
      patch: {
        wave: { type: 'pulse', duty: 0.25 },
        env: { attack: 0.001, decay: 0.25, sustain: 0.3, release: 0.06 },
        gain: 0.28,
        sweep: { from: 4, to: -14, time: 0.26 },
      },
      note: 'A4',
      hold: 0.22,
      chord: [0, 1],
    },
    { patch: noiseBurst({ type: 'lowpass', frequency: 2400 }, 0.12, 0.35), note: 'A4', hold: 0.08 },
  ],
};
