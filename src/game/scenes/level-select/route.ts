import { clamp } from '@/engine/math/scalar';
import { type Easing, easeInOutCubic } from '@/engine/motion/easing';

/**
 * The career route: the plane flies SF → Berlin → "?" in chronological
 * order, resting at each stop, then starts over. Position is measured in
 * stops (0 = first postcard, 1 = second, 2 = the teaser), so the drawing code
 * maps it onto whatever x the postcards have.
 */
interface Leg {
  readonly from: number;
  readonly to: number;
  readonly seconds: number;
  readonly ease: Easing;
}

const hold = (at: number, seconds: number): Leg => ({ from: at, to: at, seconds, ease: (t) => t });
const fly = (from: number, to: number, seconds: number): Leg => ({ from, to, seconds, ease: easeInOutCubic });

const LEGS: readonly Leg[] = [hold(0, 1.0), fly(0, 1, 2.6), hold(1, 1.2), fly(1, 2, 1.8), hold(2, 1.4)];

export const ROUTE_LOOP_SECONDS = LEGS.reduce((sum, leg) => sum + leg.seconds, 0);

export interface RoutePose {
  /** Position along the route, in stops. */
  readonly position: number;
  /** True while flying (as opposed to parked at a stop). */
  readonly flying: boolean;
}

export function routePose(time: number): RoutePose {
  let t = ((time % ROUTE_LOOP_SECONDS) + ROUTE_LOOP_SECONDS) % ROUTE_LOOP_SECONDS;
  for (const leg of LEGS) {
    if (t < leg.seconds) {
      return { position: leg.from + (leg.to - leg.from) * leg.ease(t / leg.seconds), flying: leg.from !== leg.to };
    }
    t -= leg.seconds;
  }
  const last = LEGS[LEGS.length - 1];
  return { position: last?.to ?? 0, flying: false };
}

/** Screen x for a position in stops, interpolating between the stop coordinates. */
export function stopToX(position: number, stops: readonly number[]): number {
  if (stops.length === 0) return 0;
  const clamped = clamp(position, 0, stops.length - 1);
  const index = Math.floor(clamped);
  const from = stops[index] ?? 0;
  const to = stops[index + 1] ?? from;
  return Math.round(from + (to - from) * (clamped - index));
}
