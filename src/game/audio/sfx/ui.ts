import { melody, type SfxRecipe } from '@/engine/audio/sfx/recipe';
import type { Patch } from '@/engine/audio/synth/patch';

const blip: Patch = {
  wave: { type: 'pulse', duty: 0.25 },
  env: { attack: 0.001, decay: 0.06, sustain: 0.3, release: 0.03 },
  gain: 0.32,
};

const click: Patch = {
  wave: { type: 'noise', color: 'metallic' },
  env: { attack: 0.0005, decay: 0.012, sustain: 0, release: 0.006 },
  gain: 0.3,
  filter: { type: 'highpass', frequency: 3500 },
};

/**
 * Switching the set on: a relay thunk and crackle, then the rising whine of
 * the flyback transformer (pitched well below its real 15.7 kHz so it is
 * pleasant rather than piercing).
 */
export const powerOn: SfxRecipe = {
  cooldown: 1,
  maxInstances: 1,
  voices: [
    {
      patch: {
        wave: { type: 'sine' },
        env: { attack: 0.001, decay: 0.22, sustain: 0, release: 0.05 },
        gain: 0.9,
        sweep: { from: 12, to: -5, time: 0.12 },
      },
      note: 'A1',
      hold: 0.2,
    },
    {
      patch: {
        wave: { type: 'noise', color: 'white' },
        env: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.02 },
        gain: 0.45,
        filter: { type: 'lowpass', frequency: 1400 },
      },
      note: 'A4',
      hold: 0.06,
    },
    {
      patch: {
        wave: { type: 'noise', color: 'white' },
        env: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.05 },
        gain: 0.14,
        filter: { type: 'highpass', frequency: 3000 },
      },
      note: 'A4',
      at: 0.03,
      hold: 0.25,
    },
    {
      patch: {
        wave: { type: 'sine' },
        env: { attack: 0.35, decay: 0.2, sustain: 0.8, release: 0.35 },
        gain: 0.06,
        sweep: { from: -24, time: 1 },
        vibrato: { rate: 7, depth: 6 },
      },
      note: 'B6',
      at: 0.08,
      hold: 0.85,
    },
  ],
};

/** Credit in: a metallic clink and a bright two-step chime. */
export const coin: SfxRecipe = {
  cooldown: 0.12,
  maxInstances: 2,
  voices: [
    { patch: click, note: 'A5', hold: 0.01, velocity: 0.8 },
    ...melody({ ...blip, env: { attack: 0.001, decay: 0.3, sustain: 0.25, release: 0.12 }, gain: 0.3 }, 'D6 A6', {
      step: 0.06,
      hold: 0.06,
    }),
    {
      patch: {
        wave: { type: 'fm', ratio: 5.2, index: 1.8, indexTo: 0.1, indexTime: 0.4 },
        env: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.15 },
        gain: 0.16,
      },
      note: 'A6',
      at: 0.06,
      hold: 0.3,
    },
  ],
};

export const menuMove: SfxRecipe = {
  cooldown: 0.04,
  maxInstances: 2,
  gain: 2.2,
  voices: [{ patch: blip, note: 'A5', hold: 0.025, velocity: 0.8 }],
};

export const menuConfirm: SfxRecipe = {
  cooldown: 0.1,
  maxInstances: 1,
  voices: [
    { patch: click, note: 'A5', hold: 0.01 },
    ...melody({ ...blip, env: { ...blip.env, decay: 0.12, release: 0.08 } }, 'E5 B5 E6', { step: 0.045 }),
  ],
};

export const menuBack: SfxRecipe = {
  cooldown: 0.1,
  maxInstances: 1,
  gain: 1.4,
  voices: melody({ ...blip, wave: { type: 'pulse', duty: 0.125 } }, 'A5 D5', { step: 0.05, velocities: [0.8, 0.7] }),
};

/** A soft key tick: quiet and short, since it fires for every character typed. */
export const typewriter: SfxRecipe = {
  cooldown: 0.02,
  maxInstances: 2,
  gain: 0.7,
  voices: [
    { patch: click, note: 'C6', hold: 0.008 },
    {
      patch: {
        wave: { type: 'triangle' },
        env: { attack: 0.0005, decay: 0.02, sustain: 0, release: 0.01 },
        gain: 0.25,
      },
      note: 'E5',
      hold: 0.012,
    },
  ],
};

/** The pause chime: a quick rising three-note figure. */
export const pause: SfxRecipe = {
  cooldown: 0.2,
  maxInstances: 1,
  voices: melody({ ...blip, env: { ...blip.env, decay: 0.1, release: 0.06 } }, 'E5 B5 E6', {
    step: 0.055,
    velocities: [0.7, 0.8, 1],
  }),
};
