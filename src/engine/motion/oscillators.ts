/**
 * Time-based oscillators. All take scene time in seconds and are pure, so the
 * same time always yields the same pose — screenshots stay deterministic.
 */

/**
 * Hard on/off blinking, the arcade way (never an opacity fade).
 * `blink(t, frames(32), frames(16))` is the classic "PRESS START" rhythm.
 */
export function blink(time: number, onSeconds: number, offSeconds: number): boolean {
  const period = onSeconds + offSeconds;
  if (period <= 0) return true;
  const phase = ((time % period) + period) % period;
  return phase < onSeconds;
}

/** Smooth sine offset in [-amplitude, amplitude]; round the result before drawing. */
export function wobble(time: number, amplitude: number, periodSeconds: number, phase = 0): number {
  return amplitude * Math.sin(((time / periodSeconds) * 2 + phase) * Math.PI);
}

/**
 * Integer bob that alternates between 0 and `amplitude` — reads as a sprite
 * "breathing" in two hand-drawn poses rather than a floaty sine.
 */
export function bob(time: number, amplitude: number, periodSeconds: number): number {
  return blink(time, periodSeconds / 2, periodSeconds / 2) ? 0 : amplitude;
}

/**
 * Deterministic screen-shake offset that changes once per frame. Intensity
 * fades linearly to zero over `durationSeconds` after `startTime`.
 */
export function shake(
  time: number,
  startTime: number,
  durationSeconds: number,
  intensity: number,
): { readonly x: number; readonly y: number } {
  const elapsed = time - startTime;
  if (elapsed < 0 || elapsed >= durationSeconds) return { x: 0, y: 0 };
  const strength = intensity * (1 - elapsed / durationSeconds);
  const frame = Math.floor(elapsed * 60);
  return {
    x: Math.round((hash01(frame * 2 + 1) * 2 - 1) * strength),
    y: Math.round((hash01(frame * 2 + 2) * 2 - 1) * strength),
  };
}

/** Cheap integer hash to [0, 1); avoids threading an Rng through purely visual noise. */
function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
