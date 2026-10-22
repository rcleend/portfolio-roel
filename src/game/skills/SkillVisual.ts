import type { SkillId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import type { Vec2 } from '@/engine/math/Vec2';
import type { BurstView } from '../entities/effects/Burst';
import type { RingView } from '../entities/effects/Ring';
import type { RenderKit } from '../entities/RenderKit';
import type { StarShotView } from '../entities/shots/HomingStar';
import type { ShotView } from '../entities/shots/Shot';
import type { SkillCaster, SkillLayer } from './Skill';

/**
 * How one skill looks. Its behaviour reduces everything visible about a use
 * to small typed state, and a look draws that state:
 *
 * - `active`: the running skill — its cast moment and persistent effect —
 *   behind or in front of the hero;
 * - `shot`: its projectiles in flight;
 * - `effect`: what it leaves in the world (hit sparks, rings, impacts), which
 *   may outlive the skill.
 *
 * A look may draw any subset; classic draws the rest. Visuals only read:
 * timing, damage and targeting are the behaviour's, identical in every look.
 */
export interface SkillVisual<K extends SkillId> {
  readonly active?: (
    gfx: Gfx,
    state: SkillVisualTypes[K]['state'],
    caster: CasterSnapshot,
    layer: SkillLayer,
    kit: RenderKit,
  ) => void;
  readonly shot?: (gfx: Gfx, shot: SkillVisualTypes[K]['shot'], kit: RenderKit) => void;
  readonly effect?: (gfx: Gfx, fx: SkillVisualTypes[K]['fx'], kit: RenderKit) => void;
}

export const SKILL_VISUAL_PARTS = [
  'active',
  'shot',
  'effect',
] as const satisfies readonly (keyof SkillVisual<SkillId>)[];

/** The hero as a skill sees it this frame: the caster, plus its sprite's anchors in world pixels. */
export interface CasterSnapshot extends SkillCaster {
  /** The current frame's `hand` anchor — where a skill pose holds the potion or the guitar — if the sheet has one. */
  readonly hand: Vec2 | null;
  /** The current frame's `muzzle` anchor, if any. */
  readonly muzzle: Vec2 | null;
  /** Frame height of the hero's sprite, so an effect meant to clear the head clears any look's head. */
  readonly height: number;
}

/** What each skill hands its look: the running state, its shots and the effects it leaves. `never` where it has none. */
export interface SkillVisualTypes {
  readonly 'full-stack-attack': {
    readonly state: FullStackState;
    readonly shot: never;
    readonly fx: { readonly role: 'struck'; readonly burst: BurstView };
  };
  readonly 'agent-summon': {
    readonly state: AgentSummonState;
    readonly shot: ShotView;
    readonly fx: { readonly role: 'impact'; readonly burst: BurstView };
  };
  readonly 'ux-elixir': {
    readonly state: UxElixirState;
    readonly shot: never;
    readonly fx: { readonly role: 'sparkle'; readonly burst: BurstView };
  };
  readonly 'power-chord': {
    readonly state: PowerChordState;
    readonly shot: never;
    readonly fx: { readonly role: 'ring'; readonly ring: RingView };
  };
  readonly 'north-star': {
    /** The cast is instant: the star does the work, so there is no running state to draw. */
    readonly state: never;
    readonly shot: StarShotView;
    readonly fx: { readonly role: 'launch' | 'impact'; readonly burst: BurstView };
  };
  readonly 'churn-shield': {
    readonly state: ChurnShieldState;
    readonly shot: never;
    readonly fx: never;
  };
}

/** How far into a timed skill we are. */
export interface SkillTiming {
  readonly age: number;
  readonly duration: number;
}

/** FULL-STACK ATTACK: a beam from the hand to the edge of the view; `struck` sparks mark every customer it pierced. */
export interface FullStackState extends SkillTiming {
  readonly facing: -1 | 1;
  /** The beam's full reach, which is also what it hits; null until its first step. */
  readonly area: Rect | null;
}

/** AGENT SUMMON: a drone orbiting the hero, firing pulses; `impact` bursts where a pulse lands. */
export interface AgentSummonState extends SkillTiming {
  /** Orbit phase in radians: the drone passes behind the hero while `sin(angle) < 0`. */
  readonly angle: number;
  /** Where the drone is, and where its pulses leave from. */
  readonly drone: Vec2;
}

/** UX ELIXIR: drunk at the cast, then `sparkle` bursts rise from every customer under the spell. */
export type UxElixirState = SkillTiming;

/** POWER CHORD: one strum; a shockwave races out and three `ring`s spread from the caster. */
export interface PowerChordState extends SkillTiming {
  /** The caster's centre at the strum, where the shockwave starts. */
  readonly origin: Vec2;
}

/** CHURN SHIELD: a bubble around the hero that customers bounce off. */
export interface ChurnShieldState extends SkillTiming {
  /** Centre and radius of the bubble, which is also what customers bump into. */
  readonly center: Vec2;
  readonly radius: number;
}
