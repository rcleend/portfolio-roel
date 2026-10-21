import type { Envelope } from '@/engine/audio/synth/envelope';
import type { Patch } from '@/engine/audio/synth/patch';

/**
 * The band. Every song and most effects draw from these instruments, which
 * keeps the soundtrack sounding like one cartridge: FM bass, brass and bells
 * in the YM2610's style, SSG-style pulse leads, and a soft saw pad.
 */
function env(attack: number, decay: number, sustain: number, release: number): Envelope {
  return { attack, decay, sustain, release };
}

const singingVibrato = { rate: 5.6, depth: 18, delay: 0.22 } as const;

/** 25% pulse: the bright, vocal lead of countless arcade themes. */
export const pulseLead: Patch = {
  wave: { type: 'pulse', duty: 0.25 },
  env: env(0.004, 0.3, 0.6, 0.12),
  gain: 0.3,
  vibrato: singingVibrato,
  glide: 0.05,
};

/** 12.5% pulse: thin and nasal, for night-time melodies and counter-lines. */
export const thinLead: Patch = {
  wave: { type: 'pulse', duty: 0.125 },
  env: env(0.006, 0.4, 0.55, 0.18),
  gain: 0.28,
  vibrato: { rate: 5, depth: 14, delay: 0.3 },
  glide: 0.07,
};

/** Square lead with a short decay: bouncy, plucked menu melodies. */
export const squarePluck: Patch = {
  wave: { type: 'pulse', duty: 0.5 },
  env: env(0.002, 0.16, 0.25, 0.06),
  gain: 0.28,
};

/** FM brass: the index blooms after the attack, like a player leaning into the note. */
export const brass: Patch = {
  wave: { type: 'fm', ratio: 1, index: 0.6, indexTo: 2.2, indexTime: 0.09 },
  env: env(0.025, 0.35, 0.7, 0.14),
  gain: 0.32,
  vibrato: { rate: 5.2, depth: 12, delay: 0.3 },
  glide: 0.06,
};

/** Short, bright FM brass chord hits. */
export const brassStab: Patch = {
  wave: { type: 'fm', ratio: 1, index: 2.8, indexTo: 1, indexTime: 0.18 },
  env: env(0.006, 0.2, 0.25, 0.09),
  gain: 0.26,
};

/** Punchy FM bass: a bright attack that closes down, like a slapped string. */
export const fmBass: Patch = {
  wave: { type: 'fm', ratio: 1, index: 2.4, indexTo: 0.5, indexTime: 0.12 },
  env: env(0.002, 0.22, 0.5, 0.05),
  gain: 0.48,
};

/** Funkier, more percussive bass for the San Francisco stage. */
export const slapBass: Patch = {
  wave: { type: 'fm', ratio: 1, index: 4, indexTo: 0.7, indexTime: 0.07 },
  env: env(0.001, 0.18, 0.35, 0.04),
  gain: 0.5,
  glide: 0.04,
};

/** Filtered saw with a closing cutoff: the rolling bass of the Berlin stage. */
export const acidBass: Patch = {
  wave: { type: 'saw' },
  env: env(0.002, 0.14, 0.3, 0.04),
  gain: 0.36,
  filter: { type: 'lowpass', frequency: 1800, q: 6, to: 260, time: 0.13 },
};

/** Round triangle sub-bass, for weight under other bass parts. */
export const subBass: Patch = {
  wave: { type: 'triangle' },
  env: env(0.003, 0.2, 0.7, 0.06),
  gain: 0.5,
};

/** FM bell: an inharmonic ratio and a fading index give a struck, glassy tone. */
export const bell: Patch = {
  wave: { type: 'fm', ratio: 3.5, index: 2.6, indexTo: 0.2, indexTime: 0.8 },
  env: env(0.001, 1.4, 0, 0.5),
  gain: 0.22,
};

/** FM electric piano for funky chord stabs. */
export const electricPiano: Patch = {
  wave: { type: 'fm', ratio: 1, index: 1.6, indexTo: 0.3, indexTime: 0.45 },
  env: env(0.002, 0.9, 0.3, 0.16),
  gain: 0.22,
};

/** Square arpeggio voice: short and percussive so fast chord cycling stays crisp. */
export const arpPluck: Patch = {
  wave: { type: 'pulse', duty: 0.5 },
  env: env(0.001, 0.12, 0.05, 0.04),
  gain: 0.18,
};

/** Thin pulse arpeggio voice with a longer tail, for echoing sequences. */
export const arpThin: Patch = {
  wave: { type: 'pulse', duty: 0.125 },
  env: env(0.001, 0.18, 0.1, 0.06),
  gain: 0.17,
};

/** Detuned saw pad, low-passed so it sits behind everything. */
export const pad: Patch = {
  wave: { type: 'saw' },
  env: env(0.3, 0.8, 0.7, 0.8),
  gain: 0.14,
  unison: 14,
  filter: { type: 'lowpass', frequency: 1500, q: 0.5 },
};

/** Pad with a long tail, for jingles that must ring on. */
export const swellPad: Patch = { ...pad, env: env(0.12, 1.2, 0.75, 1.6), gain: 0.16 };

/** Airy white noise with a rising band: a riser for builds. */
export const riser: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: env(1.2, 0.5, 0.9, 0.1),
  gain: 0.1,
  filter: { type: 'bandpass', frequency: 400, q: 1.2, to: 7000, time: 3.8 },
};
