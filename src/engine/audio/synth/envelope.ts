/**
 * ADSR amplitude envelopes as pure data, applied to an `AudioParam` by
 * `applyAutomation`. Keeping the curve maths pure lets tests check it without
 * an audio context, and lets the voice compute a level for any moment.
 *
 * Decay and release are exponential and their times run to -60 dB, the way a
 * plucked or struck sound dies away; the attack is a linear rise.
 */
export interface Envelope {
  /** Seconds from silence to peak. */
  readonly attack: number;
  /** Seconds from peak to the sustain level (to -60 dB when `sustain` is 0). */
  readonly decay: number;
  /** Level held while the note is down, 0–1 of the peak. */
  readonly sustain: number;
  /** Seconds from note-off to -60 dB. */
  readonly release: number;
}

export interface AutomationPoint {
  /** `set` jumps, `linear` and `exp` ramp from the previous point. */
  readonly kind: 'set' | 'linear' | 'exp';
  readonly value: number;
  readonly time: number;
}

/** -60 dB: where exponential curves stop, since they can never reach zero. */
export const SILENCE = 0.001;

/** Seconds until a note held for `hold` seconds has fully released. */
export function envelopeLength(env: Envelope, hold: number): number {
  return Math.max(0, hold) + env.release;
}

/** Level of the envelope `t` seconds after note-on, for a note held `hold` seconds. */
export function envelopeLevel(env: Envelope, peak: number, hold: number, t: number): number {
  const off = Math.max(0, hold);
  if (t < 0) return 0;
  if (t <= off) return heldLevel(env, peak, t);
  const atOff = heldLevel(env, peak, off);
  const into = t - off;
  if (into >= env.release || atOff <= 0) return 0;
  return expBetween(atOff, atOff * SILENCE, into / env.release);
}

/**
 * The automation that draws `envelopeLevel` for a note starting at `start`.
 * The last point is always a `set` to 0 at `start + envelopeLength(...)`.
 */
export function envelopePoints(env: Envelope, peak: number, start: number, hold: number): AutomationPoint[] {
  const off = Math.max(0, hold);
  const points: AutomationPoint[] = [{ kind: 'set', value: 0, time: start }];
  if (peak <= 0) return points;
  const attackEnd = Math.min(env.attack, off);
  if (env.attack > 0) {
    points.push({ kind: 'linear', value: heldLevel(env, peak, attackEnd), time: start + attackEnd });
  } else {
    points.push({ kind: 'set', value: peak, time: start });
  }
  if (off > env.attack && env.decay > 0) {
    const decayEnd = Math.min(env.attack + env.decay, off);
    points.push({ kind: 'exp', value: heldLevel(env, peak, decayEnd), time: start + decayEnd });
  }
  if (off > env.attack + env.decay) {
    points.push({ kind: 'set', value: heldLevel(env, peak, off), time: start + off });
  }
  const atOff = heldLevel(env, peak, off);
  if (env.release > 0 && atOff > 0) {
    points.push({ kind: 'exp', value: atOff * SILENCE, time: start + off + env.release });
  }
  points.push({ kind: 'set', value: 0, time: start + off + env.release });
  return points;
}

/** Writes points onto a parameter. Exponential ramps need positive values, which `envelopePoints` guarantees. */
export function applyAutomation(param: AudioParam, points: readonly AutomationPoint[]): void {
  for (const point of points) {
    if (point.kind === 'set') param.setValueAtTime(point.value, point.time);
    else if (point.kind === 'linear') param.linearRampToValueAtTime(point.value, point.time);
    else param.exponentialRampToValueAtTime(Math.max(point.value, Number.MIN_VALUE), point.time);
  }
}

function heldLevel(env: Envelope, peak: number, t: number): number {
  if (t < env.attack) return env.attack > 0 ? (peak * t) / env.attack : peak;
  const sustain = Math.max(env.sustain, SILENCE) * peak;
  const intoDecay = t - env.attack;
  if (env.decay <= 0 || intoDecay >= env.decay) return sustain;
  return expBetween(peak, sustain, intoDecay / env.decay);
}

function expBetween(from: number, to: number, fraction: number): number {
  return from * (to / from) ** fraction;
}
