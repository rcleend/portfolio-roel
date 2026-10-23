import { bars } from '@/engine/audio/sequencer/compose';
import type { KitPiece } from '@/engine/audio/sequencer/song';
import type { Envelope } from '@/engine/audio/synth/envelope';
import type { Patch } from '@/engine/audio/synth/patch';
import { Rng } from '@/engine/math/Rng';

/**
 * Patches the placeholder albums add to the game's band (game/audio/instruments): the
 * same synth, so the radio's stand-in music sounds like it came from the same attic.
 * Authoring only: these are rendered to files and never reach the site's code.
 */

function env(attack: number, decay: number, sustain: number, release: number): Envelope {
  return { attack, decay, sustain, release };
}

// ── Night Shift (lo-fi) ─────────────────────────────────────────────────────────

/** A worn FM electric piano: soft tine, chorused, low-passed like tape that has been played a lot. */
export const dustyKeys: Patch = {
  wave: { type: 'fm', ratio: 1, index: 1.1, indexTo: 0.25, indexTime: 0.6 },
  env: env(0.004, 1.8, 0.3, 0.6),
  gain: 0.2,
  unison: 9,
  filter: { type: 'lowpass', frequency: 2300, q: 0.6 },
};

/** The e-piano's top line: a bell-ier tine with a slow, lazy vibrato. */
export const tineLead: Patch = {
  wave: { type: 'fm', ratio: 2, index: 0.8, indexTo: 0.2, indexTime: 0.5 },
  env: env(0.003, 1.2, 0.3, 0.45),
  gain: 0.2,
  filter: { type: 'lowpass', frequency: 3000, q: 0.5 },
  vibrato: { rate: 4.6, depth: 7, delay: 0.35 },
  glide: 0.08,
};

/** Warm round bass: a triangle with a breath of FM grit, closed down. */
export const roundBass: Patch = {
  wave: { type: 'fm', ratio: 1, index: 0.5, indexTo: 0.15, indexTime: 0.2 },
  env: env(0.006, 0.5, 0.55, 0.12),
  gain: 0.5,
  filter: { type: 'lowpass', frequency: 700, q: 0.7 },
  glide: 0.09,
};

/** A muted nylon pluck for picked arpeggios. */
export const nylonPluck: Patch = {
  wave: { type: 'fm', ratio: 2, index: 1.6, indexTo: 0.1, indexTime: 0.25 },
  env: env(0.002, 0.55, 0, 0.18),
  gain: 0.16,
  filter: { type: 'lowpass', frequency: 2600, q: 0.6 },
};

/** A soft, low-passed pulse that hums a melody rather than sings it. */
export const hummingPulse: Patch = {
  wave: { type: 'pulse', duty: 0.375 },
  env: env(0.03, 0.4, 0.6, 0.3),
  gain: 0.13,
  filter: { type: 'lowpass', frequency: 1500, q: 0.5 },
  vibrato: { rate: 5, depth: 10, delay: 0.25 },
  glide: 0.1,
};

/** A kettle starting to sing on the hob: a breathy sine that slides up and wavers. */
export const kettle: Patch = {
  wave: { type: 'sine' },
  env: env(0.6, 0.4, 0.8, 1.4),
  gain: 0.045,
  vibrato: { rate: 6.2, depth: 22, delay: 0.4 },
  glide: 1.4,
};

const softKick: Patch = {
  wave: { type: 'sine' },
  env: env(0.002, 0.3, 0, 0.05),
  gain: 0.85,
  sweep: { from: 18, time: 0.045 },
};
const dullSnare: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: env(0.002, 0.17, 0, 0.05),
  gain: 0.38,
  filter: { type: 'bandpass', frequency: 1700, q: 0.7 },
};
const dullSnareBody: Patch = {
  wave: { type: 'triangle' },
  env: env(0.001, 0.09, 0, 0.03),
  gain: 0.4,
  sweep: { from: 5, time: 0.04 },
};
const tickHat: Patch = {
  wave: { type: 'noise', color: 'metallic' },
  env: env(0.001, 0.035, 0, 0.015),
  gain: 0.12,
  filter: { type: 'highpass', frequency: 6500 },
};
const crackleClick: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: env(0.0003, 0.004, 0, 0.003),
  gain: 0.11,
  filter: { type: 'highpass', frequency: 2400 },
};
const woodRim: Patch = {
  wave: { type: 'pulse', duty: 0.5 },
  env: env(0.001, 0.03, 0, 0.01),
  gain: 0.18,
  filter: { type: 'bandpass', frequency: 1500, q: 2.2 },
};

/** The lo-fi kit: k kick, s snare, h hat, r rim, v a click of vinyl crackle. */
export const lofiKit = {
  k: [{ patch: softKick, note: 'A1' }],
  s: [
    { patch: dullSnare, note: 'A4' },
    { patch: dullSnareBody, note: 'F3' },
  ],
  h: { patch: tickHat, note: 'A5' },
  r: { patch: woodRim, note: 'D5' },
  v: { patch: crackleClick, note: 'A4' },
} as const satisfies Readonly<Record<string, KitPiece | readonly KitPiece[]>>;

/** Tape hiss under the whole record: held white noise, band-limited and very quiet. */
export const tapeHiss: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: env(0.8, 0.1, 1, 1.2),
  gain: 0.012,
  filter: { type: 'bandpass', frequency: 4200, q: 0.35 },
};

/**
 * Seeded vinyl crackle: `count` bars of 32nds with a few soft clicks at random places, never the
 * same bar twice, and never on the downbeat (where it would read as part of the groove).
 */
export function crackle(seed: number, count: number, density = 3): string {
  const rng = new Rng(seed);
  return bars(
    ...Array.from({ length: count }, () => {
      const tokens = Array.from({ length: 32 }, () => '.');
      for (let i = 0; i < density + rng.int(-1, 2); i++) tokens[rng.int(1, 31)] = `v:${rng.int(1, 7)}`;
      return tokens.join(' ');
    }),
  );
}

// ── Low Tide (ambient) ──────────────────────────────────────────────────────────

/** A wide, slow pad that breathes in over a second and a half. */
export const tidePad: Patch = {
  wave: { type: 'saw' },
  env: env(1.6, 2.2, 0.75, 2.6),
  gain: 0.12,
  unison: 16,
  filter: { type: 'lowpass', frequency: 1100, q: 0.4 },
};

/** A glassy harbour bell: an inharmonic FM ratio whose brightness fades as it rings. */
export const harbourBell: Patch = {
  wave: { type: 'fm', ratio: 3.5, index: 2.2, indexTo: 0.15, indexTime: 1.6 },
  env: env(0.002, 3.2, 0, 1.2),
  gain: 0.16,
};

/** A softer, rounder bell (ratio 2) for the lower answers. */
export const roundBell: Patch = {
  wave: { type: 'fm', ratio: 2, index: 1.4, indexTo: 0.1, indexTime: 1.4 },
  env: env(0.003, 2.6, 0, 1),
  gain: 0.14,
};

/** Waves on the shingle: white noise whose band rises as the swell comes in. */
export const swell: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: env(1.8, 1.6, 0.35, 2.2),
  gain: 0.06,
  filter: { type: 'bandpass', frequency: 420, q: 0.9, to: 1500, time: 2.6 },
};

/** A pure low sine under everything. */
export const seaFloor: Patch = {
  wave: { type: 'sine' },
  env: env(1.2, 1, 0.85, 2.4),
  gain: 0.26,
};

/** A distant foghorn: low FM brass that blooms slowly. */
export const foghorn: Patch = {
  wave: { type: 'fm', ratio: 1, index: 0.4, indexTo: 1.5, indexTime: 1.2 },
  env: env(0.5, 1.2, 0.7, 1.6),
  gain: 0.16,
  filter: { type: 'lowpass', frequency: 600, q: 0.5 },
  vibrato: { rate: 3, depth: 5, delay: 0.6 },
};

// ── Solar Drive (synthwave) ─────────────────────────────────────────────────────

/** Saw bass with a plucked filter: the driving eighths of every night drive. */
export const sawBass: Patch = {
  wave: { type: 'saw' },
  env: env(0.002, 0.16, 0.45, 0.05),
  gain: 0.3,
  unison: 6,
  filter: { type: 'lowpass', frequency: 1500, q: 2.5, to: 320, time: 0.16 },
};

/** A wide saw lead that sings over the grid. */
export const neonLead: Patch = {
  wave: { type: 'saw' },
  env: env(0.012, 0.3, 0.7, 0.25),
  gain: 0.13,
  unison: 12,
  filter: { type: 'lowpass', frequency: 3400, q: 0.8 },
  vibrato: { rate: 5.4, depth: 14, delay: 0.25 },
  glide: 0.06,
};

/** Detuned saw chords, held. */
export const neonPad: Patch = {
  wave: { type: 'saw' },
  env: env(0.25, 1, 0.75, 0.7),
  gain: 0.1,
  unison: 18,
  filter: { type: 'lowpass', frequency: 1800, q: 0.5 },
};

/** A short, bright pluck for sixteenth-note arpeggios. */
export const gridPluck: Patch = {
  wave: { type: 'saw' },
  env: env(0.001, 0.14, 0, 0.06),
  gain: 0.12,
  filter: { type: 'lowpass', frequency: 3800, q: 3, to: 900, time: 0.12 },
};

const gatedNoise: Patch = {
  wave: { type: 'noise', color: 'white' },
  // A held body that stops dead: the gated reverb snare of 80s records.
  env: env(0.001, 0.22, 0.65, 0.02),
  gain: 0.3,
  filter: { type: 'bandpass', frequency: 2200, q: 0.6 },
};
const gatedBody: Patch = {
  wave: { type: 'triangle' },
  env: env(0.001, 0.12, 0, 0.03),
  gain: 0.5,
  sweep: { from: 6, time: 0.05 },
};
const punchKick: Patch = {
  wave: { type: 'sine' },
  env: env(0.001, 0.36, 0, 0.04),
  gain: 0.95,
  sweep: { from: 24, time: 0.05 },
};
const synthHat: Patch = {
  wave: { type: 'noise', color: 'metallic' },
  env: env(0.001, 0.04, 0, 0.02),
  gain: 0.12,
  filter: { type: 'highpass', frequency: 8000 },
};
const synthCrash: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: env(0.001, 1.8, 0, 0.4),
  gain: 0.16,
  filter: { type: 'highpass', frequency: 5000 },
};

/** The drive kit: k kick, g gated snare, h hat, x crash. */
export const driveKit = {
  k: [{ patch: punchKick, note: 'A1' }],
  g: [
    { patch: gatedNoise, note: 'A4' },
    { patch: gatedBody, note: 'G3' },
  ],
  h: { patch: synthHat, note: 'A5' },
  x: { patch: synthCrash, note: 'A4' },
} as const satisfies Readonly<Record<string, KitPiece | readonly KitPiece[]>>;

// ── Sunday Roast (bossa) ────────────────────────────────────────────────────────

/** Mellow nylon-and-felt comping chords. */
export const bossaKeys: Patch = {
  wave: { type: 'fm', ratio: 1, index: 0.9, indexTo: 0.2, indexTime: 0.35 },
  env: env(0.003, 0.7, 0.25, 0.22),
  gain: 0.17,
  unison: 5,
  filter: { type: 'lowpass', frequency: 2600, q: 0.5 },
};

/** A breathy flute: triangle, a slow attack and a singer's vibrato. */
export const flute: Patch = {
  wave: { type: 'triangle' },
  env: env(0.05, 0.4, 0.75, 0.18),
  gain: 0.24,
  filter: { type: 'lowpass', frequency: 3600, q: 0.4 },
  vibrato: { rate: 5.2, depth: 14, delay: 0.2 },
  glide: 0.05,
};

/** Upright-ish bass: a soft FM thump that dies away like a plucked string. */
export const uprightBass: Patch = {
  wave: { type: 'fm', ratio: 1, index: 1.2, indexTo: 0.3, indexTime: 0.12 },
  env: env(0.003, 0.6, 0.2, 0.1),
  gain: 0.55,
  filter: { type: 'lowpass', frequency: 900, q: 0.6 },
};

const brushSwish: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: env(0.035, 0.16, 0, 0.06),
  gain: 0.2,
  filter: { type: 'bandpass', frequency: 3200, q: 0.8 },
};
const brushTap: Patch = {
  wave: { type: 'noise', color: 'white' },
  env: env(0.002, 0.06, 0, 0.03),
  gain: 0.12,
  filter: { type: 'bandpass', frequency: 4200, q: 1.1 },
};
const feltKick: Patch = {
  wave: { type: 'sine' },
  env: env(0.002, 0.22, 0, 0.04),
  gain: 0.55,
  sweep: { from: 12, time: 0.04 },
};
const clave: Patch = {
  wave: { type: 'sine' },
  env: env(0.001, 0.05, 0, 0.02),
  gain: 0.13,
  filter: { type: 'bandpass', frequency: 2400, q: 3 },
};

/** The brushed kit: k felt kick, s brush swish, t brush tap, c cross-stick clave. */
export const brushKit = {
  k: { patch: feltKick, note: 'A1' },
  s: { patch: brushSwish, note: 'A4' },
  t: { patch: brushTap, note: 'A4' },
  c: { patch: clave, note: 'D6' },
} as const satisfies Readonly<Record<string, KitPiece | readonly KitPiece[]>>;
