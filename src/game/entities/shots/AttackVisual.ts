import type { Gfx } from '@/engine/gfx/Gfx';
import type { Vec2 } from '@/engine/math/Vec2';
import type { BurstView } from '../effects/Burst';
import type { RenderKit } from '../RenderKit';
import type { ShotView } from './Shot';

/**
 * How a hero's basic attack looks: the shot in flight, the impact where it
 * ends (a customer or a wall) and the spark on the customer it hits. Speed,
 * arc, damage and rate of fire belong to `PRIMARY_ATTACKS` and are the same
 * in every look.
 *
 * All three are drawn in world pixels. When the hero's sheet has a `muzzle`
 * anchor on `attack`, the whole attack is drawn shifted from the hand point
 * the game simulates to that anchor, so it leaves the keyboard, guitar or
 * hand the art shows — hits still land exactly where they always did.
 */
export interface AttackVisual {
  readonly shot: (gfx: Gfx, shot: AttackShotView, kit: RenderKit) => void;
  readonly impact: (gfx: Gfx, impact: AttackImpactView, kit: RenderKit) => void;
  /** The spark on the customer a shot hit, at the customer's centre; it comes with an `impact` at the shot. */
  readonly hit: (gfx: Gfx, hit: AttackImpactView, kit: RenderKit) => void;
}

export const ATTACK_VISUAL_PARTS = ['shot', 'impact', 'hit'] as const satisfies readonly (keyof AttackVisual)[];

export interface AttackShotView extends ShotView {
  /** How many shots the hero fired before this one, so a look can vary them (Artsy cycles paint colours). */
  readonly index: number;
  /** Where the shot left the hand, e.g. for a muzzle flash. */
  readonly from: Vec2;
}

/** A burst the world rolled for a basic-attack shot (its impact, or the spark of its hit), the way it flew and which shot it was. */
export interface AttackImpactView extends BurstView {
  readonly direction: -1 | 1;
  /** The shot's `index`, so an impact can match a shot that a look varied. */
  readonly index: number;
}
