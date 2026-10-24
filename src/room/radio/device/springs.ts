/**
 * Closed-form motion curves for the radio's parts: damped springs of any damping ratio and spin channels whose
 * angle is the exact integral of their speed. Every curve is a pure function of time, so the choreography can be
 * sampled at any moment (a frame, a test, a stat) and retargeted from its live value and velocity without jumps.
 */

export interface SpringSample {
  /** Offset from the rest position. */
  readonly x: number;
  readonly v: number;
}

/**
 * A damped harmonic oscillator released at offset `x0` from rest with velocity `v0` (units per second), damping
 * ratio `zeta` and natural frequency `hz`, after `seconds`.
 */
export function springAt(x0: number, v0: number, zeta: number, hz: number, seconds: number): SpringSample {
  const t = Math.max(0, seconds);
  const w0 = 2 * Math.PI * hz;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.exp(-zeta * w0 * t);
    const b = (v0 + zeta * w0 * x0) / wd;
    const cos = Math.cos(wd * t);
    const sin = Math.sin(wd * t);
    const x = decay * (x0 * cos + b * sin);
    const v = decay * ((b * wd - zeta * w0 * x0) * cos - (x0 * wd + zeta * w0 * b) * sin);
    return { x, v };
  }
  if (zeta === 1) {
    const decay = Math.exp(-w0 * t);
    const b = v0 + w0 * x0;
    return { x: decay * (x0 + b * t), v: decay * (b - w0 * (x0 + b * t)) };
  }
  const root = Math.sqrt(zeta * zeta - 1);
  const r1 = -w0 * (zeta - root);
  const r2 = -w0 * (zeta + root);
  const c2 = (v0 - r1 * x0) / (r2 - r1);
  const c1 = x0 - c2;
  return {
    x: c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t),
    v: c1 * r1 * Math.exp(r1 * t) + c2 * r2 * Math.exp(r2 * t),
  };
}

/** When an underdamped spring released at `x0` with `v0` first stops (its first extremum), in seconds; null if never. */
export function springFirstStop(x0: number, v0: number, zeta: number, hz: number): number | null {
  if (zeta >= 1) return null;
  const w0 = 2 * Math.PI * hz;
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  // v(t) ∝ A cos(wd t) − B sin(wd t) = 0  ⇒  tan(wd t) = A / B.
  const b = (v0 + zeta * w0 * x0) / wd;
  const a = b * wd - zeta * w0 * x0;
  const c = x0 * wd + zeta * w0 * b;
  let t = Math.atan2(a, c) / wd;
  if (t <= 1e-9) t += Math.PI / wd;
  return t;
}

/**
 * The fastest an underdamped spring released at rest from offset x goes, as a share of x · ω₀ (rad/s):
 * exp(−ζ / √(1 − ζ²) · atan(√(1 − ζ²) / ζ)); for ζ ≥ 1 the critically damped e⁻¹, an upper bound.
 */
export function springPeakShare(zeta: number): number {
  if (zeta >= 1) return Math.exp(-1);
  const root = Math.sqrt(1 - zeta * zeta);
  return Math.exp((-zeta / root) * Math.atan(root / zeta));
}

/**
 * A scalar that springs towards a target and can be retargeted at any time from its live value and velocity.
 * Its value is a pure function of time between retargets.
 */
export class Spring {
  #t0 = 0;
  #x0: number;
  #v0 = 0;
  #goal: number;

  constructor(
    value: number,
    readonly zeta: number,
    readonly hz: number,
  ) {
    this.#x0 = value;
    this.#goal = value;
  }

  get target(): number {
    return this.#goal;
  }

  value(t: number): number {
    return this.#goal + springAt(this.#x0 - this.#goal, this.#v0, this.zeta, this.hz, (t - this.#t0) / 1000).x;
  }

  velocity(t: number): number {
    return springAt(this.#x0 - this.#goal, this.#v0, this.zeta, this.hz, (t - this.#t0) / 1000).v;
  }

  /** Heads for `target` from wherever it is at `t`. */
  retarget(t: number, target: number): void {
    if (target === this.#goal) return;
    const x = this.value(t);
    const v = this.velocity(t);
    this.#t0 = t;
    this.#x0 = x;
    this.#v0 = v;
    this.#goal = target;
  }

  /** Jumps to `value` at rest. */
  set(t: number, value: number): void {
    this.#t0 = t;
    this.#x0 = value;
    this.#v0 = 0;
    this.#goal = value;
  }

  /** Within `epsilon` of its target and nearly still at `t`. */
  settled(t: number, epsilon = 1e-4): boolean {
    return Math.abs(this.value(t) - this.#goal) < epsilon && Math.abs(this.velocity(t)) < epsilon * 10;
  }
}

/** How a spin's speed changes over a ramp. */
export type SpinEase = 'smooth' | 'out-cubic';

/**
 * A disc's rotation about its own axis: the angle (rad) and speed (rad/s) as one segment of motion, the angle
 * being the exact integral of the speed so retargets never skip.
 */
export type SpinSegment =
  /** Steady speed. */
  | { readonly kind: 'coast'; readonly t0: number; readonly phi0: number; readonly omega: number }
  /** Speed approaches `omega1` exponentially with time constant `tau` (ms). */
  | {
      readonly kind: 'decay';
      readonly t0: number;
      readonly phi0: number;
      readonly omega0: number;
      readonly omega1: number;
      readonly tau: number;
    }
  /** Speed eases from `omega0` to `omega1` over `duration` (ms), then coasts. */
  | {
      readonly kind: 'ramp';
      readonly t0: number;
      readonly phi0: number;
      readonly omega0: number;
      readonly omega1: number;
      readonly duration: number;
      readonly ease: SpinEase;
    }
  /**
   * The angle turns to `target` (a label-upright angle) along a cubic that leaves at `omega0` and arrives at rest
   * after `duration` (ms), then stays: the slowest way to be upright on time (see uprightTurn).
   */
  | {
      readonly kind: 'turn';
      readonly t0: number;
      readonly phi0: number;
      readonly omega0: number;
      readonly target: number;
      readonly duration: number;
    }
  /** The angle springs to `target` (a label-upright angle). */
  | {
      readonly kind: 'settle';
      readonly t0: number;
      readonly phi0: number;
      readonly omega0: number;
      readonly target: number;
      readonly zeta: number;
      readonly hz: number;
    };

export interface SpinSample {
  readonly phi: number;
  readonly omega: number;
}

/** ∫₀ᵘ ease(s) ds for the spin eases. */
function easeIntegral(ease: SpinEase, u: number): number {
  if (ease === 'smooth') return u * u * u - (u * u * u * u) / 2;
  return u - (1 - (1 - u) ** 4) / 4;
}

function easeValue(ease: SpinEase, u: number): number {
  if (ease === 'smooth') return u * u * (3 - 2 * u);
  return 1 - (1 - u) ** 3;
}

export function sampleSpin(segment: SpinSegment, t: number): SpinSample {
  const elapsed = Math.max(0, t - segment.t0);
  const seconds = elapsed / 1000;
  switch (segment.kind) {
    case 'coast':
      return { phi: segment.phi0 + segment.omega * seconds, omega: segment.omega };
    case 'decay': {
      const tau = segment.tau / 1000;
      const k = Math.exp(-seconds / tau);
      const delta = segment.omega0 - segment.omega1;
      return {
        phi: segment.phi0 + segment.omega1 * seconds + delta * tau * (1 - k),
        omega: segment.omega1 + delta * k,
      };
    }
    case 'ramp': {
      const duration = segment.duration / 1000;
      const delta = segment.omega1 - segment.omega0;
      if (seconds >= duration) {
        const atEnd = segment.phi0 + segment.omega0 * duration + delta * duration * easeIntegral(segment.ease, 1);
        return { phi: atEnd + segment.omega1 * (seconds - duration), omega: segment.omega1 };
      }
      const u = seconds / duration;
      return {
        phi: segment.phi0 + segment.omega0 * seconds + delta * duration * easeIntegral(segment.ease, u),
        omega: segment.omega0 + delta * easeValue(segment.ease, u),
      };
    }
    case 'turn': {
      const duration = segment.duration / 1000;
      if (seconds >= duration) return { phi: segment.target, omega: 0 };
      const u = seconds / duration;
      const delta = segment.target - segment.phi0;
      // Cubic Hermite from (phi0, omega0) to (target, 0).
      const h10 = u * u * u - 2 * u * u + u;
      const h01 = 3 * u * u - 2 * u * u * u;
      return {
        phi: segment.phi0 + h10 * duration * segment.omega0 + h01 * delta,
        omega: turnSpeed(delta, segment.omega0, duration, u),
      };
    }
    case 'settle': {
      const s = springAt(segment.phi0 - segment.target, segment.omega0, segment.zeta, segment.hz, seconds);
      return { phi: segment.target + s.x, omega: s.v };
    }
  }
}

/** The speed (rad/s) of a turn through `delta` (rad) leaving at `omega0`, `duration` s long, at share `u` of it. */
function turnSpeed(delta: number, omega0: number, duration: number, u: number): number {
  return (6 * (u - u * u) * delta) / duration + omega0 * (3 * u * u - 4 * u + 1);
}

/** The fastest (|rad/s|) a turn through `delta` leaving at `omega0` goes over `seconds`: its speed is a parabola in u. */
export function turnPeakSpeed(delta: number, omega0: number, seconds: number): number {
  const a = (-6 * delta) / seconds + 3 * omega0;
  const b = (6 * delta) / seconds - 4 * omega0;
  let peak = Math.abs(omega0);
  if (a !== 0) {
    const u = -b / (2 * a);
    if (u > 0 && u < 1) peak = Math.max(peak, Math.abs(turnSpeed(delta, omega0, seconds, u)));
  }
  return peak;
}

export interface UprightTurnOptions {
  /** How long the turn takes when nothing else bounds it (ms). */
  readonly nominalMs: number;
  /** The turn never goes faster than this (rad/s) unless `withinMs` forces it; a faster start only slows down. */
  readonly maxSpeed: number;
  /** It is upright by then (ms after its start) whatever the speed. */
  readonly withinMs?: number;
  /** A slow spin (≤ REVERSIBLE_SPIN) may turn back to the upright behind it when that is the gentler way. */
  readonly mayTurnBack?: boolean;
}

/** A spin this slow (rad/s: the idle drift) may stop at once or turn back to upright; a faster one runs on to it. */
export const REVERSIBLE_SPIN = 1.5;
/** The hardest a turn brakes a spin (rad/s²): a disc risen at 14 rad/s takes about half a second to stop. */
export const TURN_MAX_BRAKE = 60;
const TURN_STEP_MS = 10;

/**
 * The label wind-down from `phi0` going at `omega0`, starting at `t0` (ms): a 'turn' to the upright angle that can be
 * reached most gently. Each candidate (the next upright ahead and the turns after it, the one behind when allowed)
 * gets the nominal duration, lengthened until it is no faster than `maxSpeed` and (past REVERSIBLE_SPIN) brakes no
 * harder than TURN_MAX_BRAKE, shortened to `withinMs` and to the longest it can take without running past the target
 * and back (3·Δ/ω₀ for a cubic). The shortest candidate that keeps every bound wins; if none can, the slowest one does.
 */
export function uprightTurn(t0: number, phi0: number, omega0: number, options: UprightTurnOptions): SpinSegment {
  const turn = 2 * Math.PI;
  const ahead = uprightTarget(phi0, omega0);
  const forward = Math.abs(omega0) < 0.5 ? 0 : Math.sign(omega0);
  const targets = [ahead, ...[1, 2, 3].map((k) => ahead + (forward || 1) * k * turn)];
  if (forward === 0) targets.push(ahead - turn);
  else if (options.mayTurnBack && Math.abs(omega0) <= REVERSIBLE_SPIN) targets.push(ahead - forward * turn);
  const slow = Math.abs(omega0) <= REVERSIBLE_SPIN;
  const cap = Math.max(options.maxSpeed, Math.abs(omega0));
  let best: { target: number; ms: number; peak: number; keeps: boolean } | null = null;
  for (const target of targets) {
    const delta = target - phi0;
    let longest = options.withinMs ?? Number.POSITIVE_INFINITY;
    if (omega0 !== 0 && delta * omega0 >= 0) longest = Math.min(longest, (3000 * delta) / omega0);
    const shortest = slow ? 0 : (2000 * Math.abs(omega0)) / TURN_MAX_BRAKE;
    let ms = Math.max(options.nominalMs, shortest);
    while (ms < longest && turnPeakSpeed(delta, omega0, ms / 1000) > cap) ms += TURN_STEP_MS;
    ms = Math.max(1, Math.min(ms, longest));
    const peak = turnPeakSpeed(delta, omega0, ms / 1000);
    const keeps = peak <= cap + 1e-9 && ms >= shortest - 1e-9;
    const better =
      !best || (keeps && !best.keeps) || (keeps === best.keeps && (keeps ? ms < best.ms : peak < best.peak));
    if (better) best = { target, ms, peak, keeps };
  }
  if (!best) throw new Error('An upright turn needs a target');
  return { kind: 'turn', t0, phi0, omega0, target: best.target, duration: best.ms };
}

/**
 * A spin over time: segments in start order (`t0`), each taking over from the one before at its start. Future
 * segments are how a change is scheduled ahead (the spin-up at the press bottom, the settle when the float rests).
 */
export type SpinTrack = readonly SpinSegment[];

function segmentAt(track: SpinTrack, t: number): SpinSegment {
  let current = track[0];
  for (const segment of track) if (segment.t0 <= t) current = segment;
  if (!current) throw new Error('A spin track needs a segment');
  return current;
}

export function spinAt(track: SpinTrack, t: number): SpinSample {
  return sampleSpin(segmentAt(track, t), t);
}

/** Keeps what was decided up to `now` and continues with `next` from its own start (≥ now). */
export function spinThen(track: SpinTrack, now: number, next: SpinSegment): SpinTrack {
  return [...track.filter((segment) => segment.t0 <= now && segment.t0 < next.t0), next];
}

/** True while the spin's current segment still changes its speed or angle at `t` (a coast is steady). */
export function spinChanging(track: SpinTrack, t: number): boolean {
  const segment = segmentAt(track, t);
  switch (segment.kind) {
    case 'coast':
      return false;
    case 'decay':
      return Math.abs(sampleSpin(segment, t).omega - segment.omega1) > 0.05;
    case 'ramp':
    case 'turn':
      return t < segment.t0 + segment.duration;
    case 'settle': {
      const sample = sampleSpin(segment, t);
      return Math.abs(sample.phi - segment.target) > 0.002 || Math.abs(sample.omega) > 0.02;
    }
  }
}

/** The label-upright angle (a whole number of turns) a spin at `phi` going at `omega` settles to most naturally. */
export function uprightTarget(phi: number, omega: number): number {
  const turn = 2 * Math.PI;
  // Ahead in the direction of travel, never backwards through a quarter turn or more.
  if (Math.abs(omega) < 0.5) return Math.round(phi / turn) * turn;
  return omega > 0 ? Math.ceil(phi / turn) * turn : Math.floor(phi / turn) * turn;
}
