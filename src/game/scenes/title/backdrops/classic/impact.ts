import { segment } from '@/engine/motion/progress';

/** The classic opening hit, in seconds of intro time. */
export const IMPACT_TIMES = {
  /** The fireball has collapsed to nothing… */
  fireballEnd: 0.3,
  /** …and the crater is there. */
  crater: 0.3,
} as const;

/** Fireball radius on the first frame — big enough to fill most of the screen. */
export const FIREBALL_RADIUS = 92;

const FIREBALL_GLOW_STEPS = 3;

export function fireballRadius(time: number): number {
  if (time >= IMPACT_TIMES.fireballEnd) return 0;
  return Math.round(FIREBALL_RADIUS * (1 - segment(time, 0, IMPACT_TIMES.fireballEnd)));
}

/** How brightly the fireball lights the card, 0–1 in flat steps. */
export function fireballGlow(time: number): number {
  return Math.ceil((fireballRadius(time) / FIREBALL_RADIUS) * FIREBALL_GLOW_STEPS) / FIREBALL_GLOW_STEPS;
}

export function craterVisible(time: number): boolean {
  return time >= IMPACT_TIMES.crater;
}
