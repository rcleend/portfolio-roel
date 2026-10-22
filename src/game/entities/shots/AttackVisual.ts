import type { Gfx } from '@/engine/gfx/Gfx';
import type { BurstView } from '../effects/Burst';
import type { RenderKit } from '../RenderKit';
import type { ShotView } from './Shot';

/**
 * How a hero's basic attack looks: the shot in flight and the impact where it
 * strikes. Speed, arc, damage and rate of fire belong to `PRIMARY_ATTACKS`
 * and are the same in every look.
 *
 * Both are drawn in world pixels. When the hero's sheet has a `muzzle`
 * anchor on `attack`, the whole attack is drawn shifted from the hand point
 * the game simulates to that anchor, so it leaves the keyboard, guitar or
 * hand the art shows — hits still land exactly where they always did.
 */
export interface AttackVisual {
  readonly shot: (gfx: Gfx, shot: AttackShotView, kit: RenderKit) => void;
  readonly impact: (gfx: Gfx, impact: AttackImpactView, kit: RenderKit) => void;
}

export const ATTACK_VISUAL_PARTS = ['shot', 'impact'] as const satisfies readonly (keyof AttackVisual)[];

export interface AttackShotView extends ShotView {
  /** How many shots the hero fired before this one, so a look can vary them (Artsy cycles paint colours). */
  readonly index: number;
}

/** Where a basic-attack shot struck a customer or a wall: the spark burst the world rolled, and the way it flew. */
export interface AttackImpactView extends BurstView {
  readonly direction: -1 | 1;
}
