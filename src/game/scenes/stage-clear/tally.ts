import { easeOutCubic } from '@/engine/motion/easing';
import { segment } from '@/engine/motion/progress';

/**
 * Number formatting and count-up maths for the results tally. Score is
 * presented as MRR: every customer won over is recurring revenue.
 */

/** "$12,340". Grouping is fixed (not locale-driven) so the pixel layout never changes under a visitor's locale. */
export function formatMrr(score: number): string {
  const whole = Math.max(0, Math.floor(score));
  return `$${whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** "1:05" — minutes and seconds of play, rounded down. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The value shown while counting up to `target` across [start, start + duration]:
 * fast at first, settling on the exact target — the arcade bonus-tally feel.
 */
export function countUp(target: number, time: number, start: number, duration: number): number {
  return Math.round(target * segment(time, start, start + duration, easeOutCubic));
}
