import { MRR } from '../../world/scoring';

/** Everything that distinguishes a regular customer from the escalated one closing each level. */
export interface CustomerTuning {
  /** Integer draw scale of the shared 32 × 40 sheet. */
  readonly scale: 1 | 2;
  readonly hitbox: { readonly w: number; readonly h: number };
  /** Hits (at 1 damage each) needed to win them over. */
  readonly frustration: number;
  readonly walkSpeed: number;
  /** Starts approaching and shouting when the player is this close, px. */
  readonly sightRange: number;
  /** Stops walking at this distance and shouts from there, px. */
  readonly keepDistance: number;
  /** Seconds between shouts, randomised within the range. */
  readonly shoutEvery: readonly [number, number];
  /** The shout pose is held this long before the bubble leaves. */
  readonly windup: number;
  readonly recover: number;
  /** Bubbles per shout. */
  readonly volley: number;
  /** Heavy rushes across the arena; `null` for regular customers. */
  readonly charge: ChargeTuning | null;
  readonly mrr: number;
}

export interface ChargeTuning {
  readonly every: readonly [number, number];
  readonly windup: number;
  readonly speed: number;
  readonly maxSeconds: number;
}

export const REGULAR_CUSTOMER: CustomerTuning = {
  scale: 1,
  hitbox: { w: 14, h: 28 },
  frustration: 4,
  walkSpeed: 30,
  sightRange: 190,
  keepDistance: 76,
  shoutEvery: [2.2, 3.4],
  windup: 0.4,
  recover: 0.5,
  volley: 1,
  charge: null,
  mrr: MRR.customer,
};

export const ESCALATED_CUSTOMER: CustomerTuning = {
  scale: 2,
  hitbox: { w: 26, h: 56 },
  frustration: 40,
  walkSpeed: 34,
  sightRange: 400,
  keepDistance: 96,
  shoutEvery: [2.3, 3.3],
  windup: 0.5,
  recover: 0.6,
  volley: 2,
  charge: { every: [6, 8], windup: 0.8, speed: 165, maxSeconds: 1.6 },
  mrr: MRR.escalated,
};
