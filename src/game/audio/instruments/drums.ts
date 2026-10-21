import type { KitPiece } from '@/engine/audio/sequencer/song';
import type { Patch } from '@/engine/audio/synth/patch';

/**
 * Drum voices, synthesised like a 90s board would: a pitched sine kick, a
 * noise-plus-tone snare, and hats from the SSG's short metallic noise.
 */

const kickPatch: Patch = {
  wave: { type: 'sine' },
  env: { attack: 0.001, decay: 0.34, sustain: 0, release: 0.04 },
  gain: 0.95,
  sweep: { from: 26, time: 0.05 },
};

/** A click on the kick's attack so it reads on small speakers. */
const kickClick: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: { attack: 0.0005, decay: 0.012, sustain: 0, release: 0.005 },
  gain: 0.25,
  filter: { type: 'highpass', frequency: 2500 },
};

const snareNoise: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.05 },
  gain: 0.42,
  filter: { type: 'highpass', frequency: 1300, q: 0.8 },
};

const snareBody: Patch = {
  wave: { type: 'triangle' },
  env: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.03 },
  gain: 0.55,
  sweep: { from: 7, time: 0.05 },
};

const clapPatch: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: { attack: 0.003, decay: 0.2, sustain: 0, release: 0.06 },
  gain: 0.5,
  filter: { type: 'bandpass', frequency: 1300, q: 1.6 },
};

const closedHatPatch: Patch = {
  wave: { type: 'noise', color: 'metallic' },
  env: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
  gain: 0.2,
  filter: { type: 'highpass', frequency: 7000 },
};

const openHatPatch: Patch = {
  ...closedHatPatch,
  env: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.06 },
  gain: 0.16,
};

const crashPatch: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: { attack: 0.001, decay: 1.6, sustain: 0, release: 0.3 },
  gain: 0.2,
  filter: { type: 'highpass', frequency: 4500 },
};

const tomPatch: Patch = {
  wave: { type: 'sine' },
  env: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.05 },
  gain: 0.7,
  sweep: { from: 7, time: 0.12 },
};

const rimPatch: Patch = {
  wave: { type: 'pulse', duty: 0.5 },
  env: { attack: 0.001, decay: 0.035, sustain: 0, release: 0.01 },
  gain: 0.22,
  filter: { type: 'bandpass', frequency: 1800, q: 2 },
};

export const kick: readonly KitPiece[] = [
  { patch: kickPatch, note: 'A1' },
  { patch: kickClick, note: 'A4' },
];
export const snare: readonly KitPiece[] = [
  { patch: snareNoise, note: 'A4' },
  { patch: snareBody, note: 'G3' },
];
export const clap: KitPiece = { patch: clapPatch, note: 'A4' };
export const closedHat: KitPiece = { patch: closedHatPatch, note: 'A5' };
export const openHat: KitPiece = { patch: openHatPatch, note: 'A5' };
export const crash: KitPiece = { patch: crashPatch, note: 'A4' };
export const lowTom: KitPiece = { patch: tomPatch, note: 'D2' };
export const highTom: KitPiece = { patch: tomPatch, note: 'A2' };
export const rim: KitPiece = { patch: rimPatch, note: 'E5' };

/**
 * The standard kit. Lane letters: k kick, s snare, c clap, h closed hat,
 * o open hat, x crash, t low tom, u high tom, r rim.
 */
export const standardKit = {
  k: kick,
  s: snare,
  c: clap,
  h: closedHat,
  o: openHat,
  x: crash,
  t: lowTom,
  u: highTom,
  r: rim,
} as const;
