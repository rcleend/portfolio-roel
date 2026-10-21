import { melody, type SfxRecipe } from '@/engine/audio/sfx/recipe';
import type { Patch } from '@/engine/audio/synth/patch';
import { brass } from '../instruments/patches';

/** A bell that marks good news. */
const goodNewsBell: Patch = {
  wave: { type: 'fm', ratio: 3.5, index: 2.2, indexTo: 0.15, indexTime: 0.6 },
  env: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.3 },
  gain: 0.26,
};

const fanfarePulse: Patch = {
  wave: { type: 'pulse', duty: 0.25 },
  env: { attack: 0.001, decay: 0.1, sustain: 0.5, release: 0.05 },
  gain: 0.2,
};

/** A career highlight collected: a quick arpeggio into a held brass chord. */
export const achievement: SfxRecipe = {
  cooldown: 0.4,
  maxInstances: 1,
  gain: 0.75,
  voices: [
    ...melody(fanfarePulse, 'C5 E5 G5 C6', { step: 0.06, hold: 0.05 }),
    { patch: { ...brass, gain: 0.3 }, note: 'C5', at: 0.24, hold: 0.45, chord: [0, 4, 7] },
    { patch: goodNewsBell, note: 'E6', at: 0.24, hold: 0.4 },
  ],
};

/** The stage-clear sting, before the stage-clear music takes over. */
export const stageClear: SfxRecipe = {
  cooldown: 1,
  maxInstances: 1,
  gain: 0.7,
  voices: [
    ...melody(fanfarePulse, 'G4 C5 E5 G5 C6', { step: 0.07, hold: 0.06 }),
    { patch: { ...brass, gain: 0.32 }, note: 'C5', at: 0.35, hold: 0.6, chord: [0, 4, 7, 12] },
    {
      patch: {
        wave: { type: 'noise', color: 'white' },
        env: { attack: 0.001, decay: 1, sustain: 0, release: 0.2 },
        gain: 0.16,
        filter: { type: 'highpass', frequency: 4500 },
      },
      note: 'A4',
      at: 0.35,
      hold: 0.4,
    },
    { patch: goodNewsBell, note: 'G6', at: 0.35, hold: 0.5 },
  ],
};

export const checkpoint: SfxRecipe = {
  cooldown: 0.5,
  maxInstances: 1,
  voices: [
    ...melody(goodNewsBell, 'G5 D6', { step: 0.11, hold: 0.25 }),
    ...melody(
      {
        wave: { type: 'pulse', duty: 0.25 },
        env: { attack: 0.001, decay: 0.1, sustain: 0.3, release: 0.06 },
        gain: 0.14,
      },
      'G5 B5 D6 G6',
      { step: 0.04, at: 0.11 },
    ),
  ],
};
