import type { Vector3 } from 'three';
import type { PoseSegment } from './discMotion';

/**
 * Fast-forward for a stretch of the storyboard (docs/ROOM.md › The CD player): `span` ms of a part's planned motion,
 * from film time `filmStart`, play in `duration` ms of real time from `realStart`. Its paths are kept exactly, only
 * sooner, so what was drawn clear of every other disc stays clear of every disc that does not move meanwhile. The
 * film's speed is its own at both ends (no jolt where the hurry starts or ends) and highest in the middle:
 * film(u) = a u + (1 − a)(3u² − 2u³) of the span at u = elapsed / duration, a = duration / span.
 */
export interface TimeWarp {
  readonly realStart: number;
  readonly realEnd: number;
  readonly filmStart: number;
  readonly filmEnd: number;
  /** The film time shown at real time `t` (the film runs on at its own speed outside the warp). */
  film(t: number): number;
  /** The real time film time `f` is shown at. */
  real(f: number): number;
}

export function hurry(realStart: number, filmStart: number, span: number, duration: number): TimeWarp {
  const length = Math.max(0, span);
  const real = Math.max(0, Math.min(duration, length));
  const a = length > 0 ? real / length : 1;
  const shape = (u: number) => a * u + (1 - a) * u * u * (3 - 2 * u);
  const slope = (u: number) => a + (1 - a) * 6 * u * (1 - u);
  return {
    realStart,
    realEnd: realStart + real,
    filmStart,
    filmEnd: filmStart + length,
    film(t) {
      if (t <= realStart) return filmStart + (t - realStart);
      if (t >= realStart + real) return filmStart + length + (t - realStart - real);
      return filmStart + length * shape((t - realStart) / real);
    },
    real(f) {
      if (f <= filmStart) return realStart + (f - filmStart);
      if (f >= filmStart + length) return realStart + real + (f - filmStart - length);
      // Newton on the monotone shape, from the linear guess: a few steps reach a microsecond.
      const v = (f - filmStart) / length;
      let u = v;
      for (let i = 0; i < 8; i++) u = Math.min(1, Math.max(0, u - (shape(u) - v) / slope(u)));
      return realStart + real * u;
    },
  };
}

/**
 * The parts of `segments` inside the warp's film, each played through it: clipped to the film's stretch and timed in
 * real time. Each keeps whatever else it carries (its phase).
 */
export function warpSegments<S extends PoseSegment>(segments: readonly S[], warp: TimeWarp): S[] {
  const out: S[] = [];
  for (const segment of segments) {
    const from = Math.max(segment.start, warp.filmStart);
    const to = Math.min(segment.end, warp.filmEnd);
    if (to <= from) continue;
    out.push({
      ...segment,
      start: warp.real(from),
      end: warp.real(to),
      at: (t: number) => segment.at(warp.film(t)),
    });
  }
  return out;
}

/**
 * The quickest hurry of `span` ms of film no shorter than `duration` that moves `path` (the film's position at a
 * film time) no faster than `maxSpeed` (m/ms), read every `step` ms of real time; the film as it is if none is.
 */
export function hurryWithin(
  path: (film: number) => Vector3,
  realStart: number,
  filmStart: number,
  span: number,
  duration: number,
  maxSpeed: number,
  step = 4,
): TimeWarp {
  for (let real = Math.min(duration, span); ; real += 2 * step) {
    const warp = hurry(realStart, filmStart, span, real);
    if (real >= span || peakSpeed(path, warp, step) <= maxSpeed) return warp;
  }
}

/** The fastest `path` moves through the warp (m/ms), from samples `step` ms of real time apart. */
export function peakSpeed(path: (film: number) => Vector3, warp: TimeWarp, step: number): number {
  let peak = 0;
  let before = warp.realStart;
  let last = path(warp.film(before));
  while (before < warp.realEnd) {
    const at = Math.min(before + step, warp.realEnd);
    const next = path(warp.film(at));
    peak = Math.max(peak, last.distanceTo(next) / (at - before));
    before = at;
    last = next;
  }
  return peak;
}
