import { Rng } from '../../math/Rng';

/**
 * Fourier series of a pulse wave that is high for `duty` of its cycle, as the
 * `real` (cosine) and `imag` (sine) arrays `createPeriodicWave` expects.
 * Index 0 (DC) is left at zero so the wave stays centred.
 */
export function pulseHarmonics(duty: number, harmonics: number): { real: Float32Array; imag: Float32Array } {
  if (!(duty > 0 && duty < 1)) throw new RangeError(`Pulse duty must be between 0 and 1, got ${duty}`);
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    const phase = 2 * Math.PI * n * duty;
    real[n] = Math.sin(phase) / (Math.PI * n);
    imag[n] = (1 - Math.cos(phase)) / (Math.PI * n);
  }
  return { real, imag };
}

/** Enough harmonics for a bright pulse; the browser band-limits per playback frequency. */
const PULSE_HARMONICS = 96;

const pulseCache = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();

export function pulseWave(context: BaseAudioContext, duty: number): PeriodicWave {
  let waves = pulseCache.get(context);
  if (!waves) {
    waves = new Map();
    pulseCache.set(context, waves);
  }
  let wave = waves.get(duty);
  if (!wave) {
    const { real, imag } = pulseHarmonics(duty, PULSE_HARMONICS);
    wave = context.createPeriodicWave(real, imag);
    waves.set(duty, wave);
  }
  return wave;
}

/**
 * One period of the SSG's "short" noise mode: a 15-bit LFSR tapped at bits 0
 * and 6 repeats every 93 steps, which gives the tonal, clangy colour of chip
 * cymbals. Values are ±1.
 */
export function metallicNoise(): Float32Array<ArrayBuffer> {
  const period: number[] = [];
  let register = 1;
  do {
    const feedback = (register ^ (register >> 6)) & 1;
    register = (register >> 1) | (feedback << 14);
    period.push(register & 1 ? 1 : -1);
  } while (register !== 1 && period.length < 32768);
  return Float32Array.from(period);
}

/** Seeded so offline renders (and therefore the loudness checks) are reproducible. */
export function whiteNoise(length: number, seed = 0x5eed): Float32Array<ArrayBuffer> {
  const rng = new Rng(seed);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = rng.range(-1, 1);
  return samples;
}

/** The sample rate at which noise buffers play back at their natural pitch (MIDI A4). */
const NOISE_BASE_RATE = 44100;

const noiseCache = new WeakMap<BaseAudioContext, Map<'white' | 'metallic', AudioBuffer>>();

/** A looping noise buffer for this context. Pitch it with `playbackRate` relative to A4. */
export function noiseBuffer(context: BaseAudioContext, color: 'white' | 'metallic'): AudioBuffer {
  let buffers = noiseCache.get(context);
  if (!buffers) {
    buffers = new Map();
    noiseCache.set(context, buffers);
  }
  let buffer = buffers.get(color);
  if (!buffer) {
    const samples = color === 'white' ? whiteNoise(NOISE_BASE_RATE) : tile(metallicNoise(), 4096);
    buffer = context.createBuffer(1, samples.length, NOISE_BASE_RATE);
    buffer.copyToChannel(samples, 0);
    buffers.set(color, buffer);
  }
  return buffer;
}

/** Repeats a short period to at least `minLength` samples so looping costs nothing per period. */
function tile(period: Float32Array, minLength: number): Float32Array<ArrayBuffer> {
  const repeats = Math.ceil(minLength / period.length);
  const out = new Float32Array(period.length * repeats);
  for (let i = 0; i < repeats; i++) out.set(period, i * period.length);
  return out;
}
