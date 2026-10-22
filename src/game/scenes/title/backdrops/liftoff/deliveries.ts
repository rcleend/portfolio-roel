import type { Gfx } from '@/engine/gfx/Gfx';
import type { TitleBeats } from '../../titleTimeline';
import { FLAME, TRAIL } from './colors';

/**
 * Continuous delivery: while the title idles, another little rocket goes up
 * now and then, far away behind the skyline, first from Berlin and then
 * from San Francisco. Each climbs on a thin trail, leans into its gravity
 * turn and burns out under the logo; the trail lingers and cools away from
 * its oldest end.
 */
export interface Delivery {
  /** Seconds after the title settles. */
  readonly after: number;
  /** Where it clears the rooftops, in screen pixels. */
  readonly x: number;
  readonly y: number;
  /** Sideways pixels at burnout: the gravity turn. */
  readonly lean: number;
}

/**
 * Between glints, so a launch never competes with the shine on the logo,
 * and timed so the second trail has cooled away before the attract loop
 * replays the intro. Each lifts off between the city's landmarks, clear of
 * "PRESS ANY BUTTON".
 */
export const DELIVERIES: readonly Delivery[] = [
  { after: 5.6, x: 64, y: 190, lean: -7 },
  { after: 15.6, x: 302, y: 191, lean: -24 },
];

/** Powered flight, then how long the trail takes to cool away completely. */
export const BURN_SECONDS = 2.6;
export const DELIVERY_SECONDS = BURN_SECONDS + 5;
/** How high it climbs before burnout. */
const CLIMB = 48;
/** The climb accelerates: progress along the path goes as time to this power. */
const THRUST = 1.6;
/** Trail colour by age in seconds: hot at the rocket, cooling to the sky's violet, then gone. */
const COOLING = [0.15, 0.6, 1.4, 2.4, 3.6, 5] as const;

/** Seconds since `delivery` lifted off, or `null` when it is not in the sky. */
export function deliveryAge(delivery: Delivery, time: number, beats: TitleBeats): number | null {
  const age = time - beats.settled - delivery.after;
  return age >= 0 && age < DELIVERY_SECONDS ? age : null;
}

/** Draws `delivery` `age` seconds after liftoff: its trail, and the rocket itself until burnout. */
export function drawDelivery(gfx: Gfx, delivery: Delivery, age: number): void {
  const reached = progressAt(Math.min(age, BURN_SECONDS));
  const points = Math.ceil(reached * CLIMB);
  for (let i = 0; i <= points; i++) {
    const along = Math.min(reached, i / CLIMB);
    const step = coolingStep(age - BURN_SECONDS * along ** (1 / THRUST));
    // The coolest trail is broken up, as if dispersing.
    if (step < 0 || (step >= 4 && i % 2 === 1)) continue;
    gfx.pixel(pathX(delivery, along), pathY(delivery, along), TRAIL[step] ?? TRAIL[0]);
  }
  if (age < BURN_SECONDS) {
    const x = pathX(delivery, reached);
    const y = pathY(delivery, reached);
    gfx.pixel(x, y - 1, TRAIL[0]);
    gfx.pixel(x, y, FLAME[3]);
  }
}

/** The `TRAIL` step for a stretch of trail `seconds` old, or -1 once it has cooled away. */
function coolingStep(seconds: number): number {
  for (let step = 0; step < COOLING.length; step++) if (seconds < (COOLING[step] ?? 0)) return step;
  return -1;
}

function progressAt(age: number): number {
  return (age / BURN_SECONDS) ** THRUST;
}

function pathX(delivery: Delivery, along: number): number {
  return Math.round(delivery.x + delivery.lean * along * along);
}

function pathY(delivery: Delivery, along: number): number {
  return Math.round(delivery.y - CLIMB * along);
}
