import { melody, type SfxRecipe } from '@/engine/audio/sfx/recipe';
import type { Patch } from '@/engine/audio/synth/patch';

/**
 * A grumbly blurt: a buzzy, low "voice" (a saw through a resonant formant
 * filter with a fast, wide wobble) that mutters down and back up, like
 * "hmmf-mph!". Varies naturally with the per-call detune option.
 */
const grumble: Patch = {
  wave: { type: 'saw' },
  env: { attack: 0.015, decay: 0.2, sustain: 0.7, release: 0.06 },
  gain: 0.5,
  vibrato: { rate: 13, depth: 70 },
  filter: { type: 'bandpass', frequency: 750, q: 3.5 },
  glide: 0.05,
};

export const complaint: SfxRecipe = {
  cooldown: 0.25,
  maxInstances: 2,
  gain: 1.6,
  voices: [
    {
      patch: grumble,
      note: 'D3',
      hold: 0.3,
      slides: [
        { after: 0.1, note: 'A2' },
        { after: 0.2, note: 'C3' },
      ],
    },
    {
      patch: { ...grumble, filter: { type: 'bandpass', frequency: 1900, q: 5 }, gain: 0.18 },
      note: 'D3',
      hold: 0.3,
      slides: [
        { after: 0.1, note: 'A2' },
        { after: 0.2, note: 'C3' },
      ],
    },
  ],
};

/** Won over: a little ascending chime in major. */
export const customerHappy: SfxRecipe = {
  cooldown: 0.12,
  maxInstances: 2,
  voices: [
    ...melody(
      {
        wave: { type: 'fm', ratio: 3.5, index: 1.8, indexTo: 0.1, indexTime: 0.4 },
        env: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.15 },
        gain: 0.22,
      },
      'G5 B5 D6 G6',
      { step: 0.07, hold: 0.12, velocities: [0.7, 0.8, 0.9, 1] },
    ),
    ...melody(
      {
        wave: { type: 'pulse', duty: 0.25 },
        env: { attack: 0.001, decay: 0.08, sustain: 0.2, release: 0.04 },
        gain: 0.12,
      },
      'D6 G6',
      { step: 0.07, at: 0.21, hold: 0.05 },
    ),
  ],
};
