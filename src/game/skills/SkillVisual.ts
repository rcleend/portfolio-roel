import type { SkillId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import type { Vec2 } from '@/engine/math/Vec2';
import type { BurstView } from '../entities/effects/Burst';
import type { TimerView } from '../entities/effects/Effect';
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
 * - `effect`: what it leaves in the world (hit sparks, rings, impacts, a
 *   stun, its end), which may outlive the skill; `fx.role` says which;
 * - `customer`: what it puts on each customer it holds a rule over, drawn
 *   right after the customer's frustration meter (UX ELIXIR's calm heart).
 *
 * A look may draw any subset; classic draws the rest. Visuals only read:
 * timing, damage, targeting and every random roll are the behaviour's,
 * identical in every look.
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
  readonly customer?: (gfx: Gfx, customer: SkillVisualTypes[K]['customer'], kit: RenderKit) => void;
}

export const SKILL_VISUAL_PARTS = [
  'active',
  'shot',
  'effect',
  'customer',
] as const satisfies readonly (keyof SkillVisual<SkillId>)[];

/** The hero as a skill sees it this frame: the caster, plus its sprite's anchors in world pixels. */
export interface CasterSnapshot extends SkillCaster {
  /** The current frame's `hand` anchor — where a skill pose holds the potion or the guitar — if the sheet has one. */
  readonly hand: Vec2 | null;
  /** The current frame's `muzzle` anchor, if any. */
  readonly muzzle: Vec2 | null;
  /** Any other anchor of the current frame (a `mouth`, say), or null. */
  anchor(name: string): Vec2 | null;
  /** Frame height of the hero's sprite, so an effect meant to clear the head clears any look's head. */
  readonly height: number;
  /** Whether the hero's look poses `skill` its own way (`skill-<skillId>`), drawing what that pose holds. */
  posesOwn(skill: SkillId): boolean;
}

/** A spark burst the world rolled for this skill: on a customer it hit (`hit`), where a shot ended (`impact`), … */
export interface SkillSpark<R extends string> {
  readonly role: R;
  readonly burst: BurstView;
}

/** Left when a timed skill ends, for a last beat (smoke, a fade) after the behaviour is done; lasts `LOOK_EFFECT_SECONDS`. */
export interface SkillEnded<S> {
  readonly role: 'ended';
  /** The skill's final state. */
  readonly state: S;
  /** Where the hero stood as it ended. */
  readonly caster: SkillCaster;
  readonly timer: TimerView;
}

/** What each skill hands its look: running state, shots, what it leaves and what it puts on customers. `never` where it has none. */
export interface SkillVisualTypes {
  readonly 'full-stack-attack': {
    readonly state: FullStackState;
    readonly shot: never;
    readonly fx:
      | SkillSpark<'hit'>
      /** The beam's own extra spark on every customer it pierces, with the beam it came from. */
      | (SkillSpark<'struck'> & { readonly area: Rect; readonly facing: -1 | 1 })
      | SkillEnded<FullStackState>;
    readonly customer: never;
  };
  readonly 'agent-summon': {
    readonly state: AgentSummonState;
    readonly shot: ShotView;
    readonly fx: SkillSpark<'hit' | 'impact'> | SkillEnded<AgentSummonState>;
    readonly customer: never;
  };
  readonly 'ux-elixir': {
    readonly state: UxElixirState;
    readonly shot: never;
    readonly fx: SkillSpark<'sparkle'> | SkillEnded<UxElixirState>;
    readonly customer: CalmedCustomer;
  };
  readonly 'power-chord': {
    readonly state: PowerChordState;
    readonly shot: never;
    readonly fx:
      | { readonly role: 'ring'; readonly ring: RingView }
      /** One per customer the strum stunned, for as long as the stun lasts. */
      | {
          readonly role: 'stunned';
          readonly target: StunnedTarget;
          /** Where the shockwave started. */
          readonly origin: Vec2;
          readonly timer: TimerView;
        }
      | SkillEnded<PowerChordState>;
    readonly customer: never;
  };
  readonly 'north-star': {
    /** The cast is instant: the star does the work, so there is no running state to draw. */
    readonly state: never;
    readonly shot: StarShotView;
    readonly fx: SkillSpark<'launch' | 'hit' | 'impact'>;
    readonly customer: never;
  };
  readonly 'churn-shield': {
    readonly state: ChurnShieldState;
    readonly shot: never;
    /** `hit` marks every bump: a customer meeting the bubble. */
    readonly fx: SkillSpark<'hit'> | SkillEnded<ChurnShieldState>;
    readonly customer: never;
  };
}

/** A customer a skill follows after it hit it: read live, so a look can tell when the stun is over or the customer won. */
export interface StunnedTarget {
  readonly rect: Rect;
  readonly stunned: boolean;
  readonly escalated: boolean;
}

/** A regular customer while UX ELIXIR calms everyone, as its look draws over it. */
export interface CalmedCustomer {
  /** Centre x and feet line. */
  readonly x: number;
  readonly feet: number;
  readonly scale: number;
  /** How much taller the customer look stands than classic, at `scale`: overhead art rises by this much. */
  readonly lift: number;
  /** The running elixir; null on the one frame its rule outlasts it. */
  readonly elixir: UxElixirState | null;
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

/** AGENT SUMMON: a drone orbiting the hero, firing pulses; `impact` bursts where a pulse lands, `hit` on the customer. */
export interface AgentSummonState extends SkillTiming {
  /** Orbit phase in radians: the drone passes behind the hero while `sin(angle) < 0`. */
  readonly angle: number;
  /** When (seconds into the skill) and at what point the drone last fired, if it has. */
  readonly lastShot: { readonly age: number; readonly toward: Vec2 } | null;
  /** Where the drone is around a hero standing at `caster`, which is also where its pulses leave from. */
  droneAt(caster: SkillCaster): Vec2;
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
  /** The bubble's radius, which is also what customers bump into. */
  readonly radius: number;
  /** The bubble's centre around a hero standing at `caster`. */
  centerAt(caster: SkillCaster): Vec2;
}
