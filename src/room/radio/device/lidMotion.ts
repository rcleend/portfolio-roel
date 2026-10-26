import { clamp01 } from '../../motion/easing';
import { springAt, springFirstStop } from './springs';

/**
 * The CD lid's angle as a pure function of time (docs/ROOM.md › The CD player): pushed (the front edge dips),
 * popped off its latch, swung open on a damped spring, and closed with a falling slam and a little latch rebound.
 * Any plan can start from the live angle and velocity, so a visitor turning back mid-swing never sees a jump.
 */

export const LID = {
  openDegrees: 84,
  pushMs: 80,
  pushDegrees: -0.6,
  popMs: 60,
  popDegrees: 5,
  zeta: 0.72,
  hz: 1.4,
  /** The pop hands the swing this much speed (°/s). */
  swingVelocity: 220,
  closeMs: 340,
  reboundMs: 70,
  reboundDegrees: 0.9,
} as const;

/** The discs may rise only once the lid is this far open: above it no rising disc can touch it (unit-tested). */
export const LID_DISC_GATE_DEGREES = 80;

export type LidPlan =
  /** Shut and latched. */
  | { readonly kind: 'closed' }
  /** At rest open (reduced motion, or a device that wakes up at the radio). */
  | { readonly kind: 'open' }
  /** Push at `start`, pop, then swing open. */
  | { readonly kind: 'opening'; readonly start: number }
  /** Swing towards open from a live angle and speed (a visitor turning back mid-close). */
  | { readonly kind: 'swing'; readonly start: number; readonly from: number; readonly velocity: number }
  /** Fall shut from `from` degrees at `start`, then rebound off the latch. */
  | { readonly kind: 'closing'; readonly start: number; readonly from: number };

export interface LidSample {
  readonly degrees: number;
  /** °/s */
  readonly velocity: number;
  /** Still moving (a frame is needed). */
  readonly moving: boolean;
}

/** The swing counts as settled within this many degrees of open (the spec's ±0.3° from +781 ms). */
const SETTLED_DEGREES = 0.05;

const sineInOut = (u: number): number => (1 - Math.cos(Math.PI * u)) / 2;
const outCubic = (u: number): number => 1 - (1 - u) ** 3;

/** θ(u) = θ₀ (1 − u² (1.6 − 0.6 u)): it falls slowly, then slams. */
function closeCurve(from: number, u: number): { degrees: number; velocity: number } {
  const shape = u * u * (1.6 - 0.6 * u);
  const slope = 3.2 * u - 1.8 * u * u;
  return { degrees: from * (1 - shape), velocity: (-from * slope * 1000) / LID.closeMs };
}

function swing(from: number, velocity: number, seconds: number): LidSample {
  const s = springAt(from - LID.openDegrees, velocity, LID.zeta, LID.hz, seconds);
  const moving = Math.abs(s.x) > SETTLED_DEGREES || Math.abs(s.v) > SETTLED_DEGREES * 10;
  return { degrees: LID.openDegrees + s.x, velocity: s.v, moving };
}

export function lidAt(plan: LidPlan, t: number): LidSample {
  switch (plan.kind) {
    case 'closed':
      return { degrees: 0, velocity: 0, moving: false };
    case 'open':
      return { degrees: LID.openDegrees, velocity: 0, moving: false };
    case 'opening': {
      const elapsed = t - plan.start;
      if (elapsed < 0) return { degrees: 0, velocity: 0, moving: true };
      if (elapsed < LID.pushMs) {
        const u = elapsed / LID.pushMs;
        return {
          degrees: LID.pushDegrees * sineInOut(u),
          velocity: ((LID.pushDegrees * Math.PI * Math.sin(Math.PI * u)) / 2 / LID.pushMs) * 1000,
          moving: true,
        };
      }
      if (elapsed < LID.pushMs + LID.popMs) {
        const u = (elapsed - LID.pushMs) / LID.popMs;
        const span = LID.popDegrees - LID.pushDegrees;
        return {
          degrees: LID.pushDegrees + span * outCubic(u),
          velocity: ((span * 3 * (1 - u) ** 2) / LID.popMs) * 1000,
          moving: true,
        };
      }
      return swing(LID.popDegrees, LID.swingVelocity, (elapsed - LID.pushMs - LID.popMs) / 1000);
    }
    case 'swing':
      return swing(plan.from, plan.velocity, (t - plan.start) / 1000);
    case 'closing': {
      const elapsed = t - plan.start;
      if (elapsed < LID.closeMs) {
        const u = clamp01(elapsed / LID.closeMs);
        return { ...closeCurve(plan.from, u), moving: true };
      }
      const rebound = (elapsed - LID.closeMs) / LID.reboundMs;
      if (rebound < 1) {
        return {
          degrees: LID.reboundDegrees * Math.sin(Math.PI * rebound),
          velocity: ((LID.reboundDegrees * Math.PI * Math.cos(Math.PI * rebound)) / LID.reboundMs) * 1000,
          moving: true,
        };
      }
      return { degrees: 0, velocity: 0, moving: false };
    }
  }
}

/** The plan that opens the lid from wherever `current` leaves it at `t`, starting no earlier than `pushAt`. */
export function openFrom(current: LidPlan, t: number, pushAt: number): LidPlan {
  if (current.kind === 'open' || current.kind === 'opening' || current.kind === 'swing') return current;
  if (current.kind === 'closed') return { kind: 'opening', start: Math.max(t, pushAt) };
  const live = lidAt(current, t);
  // Already down on the latch: open it properly.
  if (live.degrees <= 0.5 && t - current.start >= LID.closeMs) return { kind: 'opening', start: Math.max(t, pushAt) };
  return { kind: 'swing', start: t, from: live.degrees, velocity: live.velocity };
}

/** The plan that closes the lid from wherever `current` leaves it at `t`. */
export function closeFrom(current: LidPlan, t: number): LidPlan {
  if (current.kind === 'closed' || current.kind === 'closing') return current;
  const live = lidAt(current, t);
  if (current.kind === 'opening' && t < current.start) return { kind: 'closed' };
  return { kind: 'closing', start: t, from: Math.max(0, live.degrees) };
}

/** A mechanical moment of the lid and when it happens. */
export interface LidMoment {
  readonly cue: 'lid-push' | 'lid-unlatch' | 'lid-swing' | 'lid-stop' | 'lid-close' | 'lid-latch';
  readonly at: number;
}

/** The cue moments a plan makes, in time order. */
export function lidMoments(plan: LidPlan): LidMoment[] {
  switch (plan.kind) {
    case 'opening': {
      const swingStart = plan.start + LID.pushMs + LID.popMs;
      const stop = springFirstStop(LID.popDegrees - LID.openDegrees, LID.swingVelocity, LID.zeta, LID.hz);
      return [
        { cue: 'lid-push', at: plan.start },
        { cue: 'lid-unlatch', at: plan.start + LID.pushMs },
        { cue: 'lid-swing', at: swingStart },
        ...(stop === null ? [] : [{ cue: 'lid-stop' as const, at: swingStart + stop * 1000 }]),
      ];
    }
    case 'swing': {
      const stop = springFirstStop(plan.from - LID.openDegrees, plan.velocity, LID.zeta, LID.hz);
      return stop === null ? [] : [{ cue: 'lid-stop', at: plan.start + stop * 1000 }];
    }
    case 'closing':
      return [
        { cue: 'lid-close', at: plan.start },
        { cue: 'lid-latch', at: plan.start + LID.closeMs },
      ];
    default:
      return [];
  }
}

/** How finely, and how far ahead, lidReaches looks for the first moment past its angle. */
const REACH_STEP_MS = 16;
const REACH_HORIZON_MS = 3000;

/**
 * When an opening plan first reaches `degrees` (ms), or null if it never does. A swing may first carry on the way the
 * lid was going (a visitor turning back while it closes) before it turns and opens, so this steps forward until the
 * lid is past the angle and then bisects that step, rather than trusting the spring's first stop to be the top.
 */
export function lidReaches(plan: LidPlan, degrees: number, from: number): number | null {
  if (plan.kind === 'open') return from;
  if (plan.kind !== 'opening' && plan.kind !== 'swing') return null;
  if (lidAt(plan, from).degrees >= degrees) return from;
  const begin = Math.max(plan.start, from);
  let low = begin;
  let high: number | null = null;
  for (let at = begin + REACH_STEP_MS; at <= begin + REACH_HORIZON_MS; at += REACH_STEP_MS) {
    if (lidAt(plan, at).degrees >= degrees) {
      high = at;
      break;
    }
    low = at;
  }
  if (high === null) return null;
  let past: number = high;
  for (let i = 0; i < 30; i++) {
    const mid = (low + past) / 2;
    if (lidAt(plan, mid).degrees >= degrees) past = mid;
    else low = mid;
  }
  return past;
}
