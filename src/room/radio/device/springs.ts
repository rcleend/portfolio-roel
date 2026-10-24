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
    case 'settle': {
      const s = springAt(segment.phi0 - segment.target, segment.omega0, segment.zeta, segment.hz, seconds);
      return { phi: segment.target + s.x, omega: s.v };
    }
  }
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
