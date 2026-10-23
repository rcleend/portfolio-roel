import type { SkillId } from '@/content';
import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import type { Rng } from '@/engine/math/Rng';
import type { SfxId } from '../audio/ids';
import type { Burst } from '../entities/effects/Burst';
import type { Effect } from '../entities/effects/Effect';
import type { RenderKit } from '../entities/RenderKit';
import type { Shot } from '../entities/shots/Shot';
import type { CasterSnapshot } from './SkillVisual';

/**
 * The Skill behaviour contract.
 *
 * A `Skill` is a stateless definition: `cast` starts one use and returns an
 * `ActiveSkill`, which the level steps every frame until it reports `done`.
 * Cooldowns live outside the skill, in `SkillSlot`, using the content's
 * `cooldownSeconds`, so a skill module only describes what happens.
 *
 * Skills touch the level exclusively through `SkillWorld` — a narrow,
 * intention-revealing API — and influence the rules of play declaratively
 * through `modifiers` (slow customers, block damage, …), which the world
 * combines across every running skill. That keeps each skill a small,
 * self-contained module and the world free of per-skill special cases.
 *
 * How a skill looks is not its business: it hands its typed state to the
 * selected look's `SkillVisual` (skills/SkillVisual.ts), so every look plays
 * exactly the same skill.
 */
export interface Skill {
  readonly id: SkillId;
  readonly sfx: SfxId;
  cast(world: SkillWorld): ActiveSkill;
}

/** One running use of a skill. */
export interface ActiveSkill {
  readonly done: boolean;
  /** Rules this skill imposes while it runs; read every step. */
  readonly modifiers: SkillModifiers;
  update(world: SkillWorld, dt: number): void;
  /** Draws through the skill's look, in world coordinates; `layer` puts auras behind the player and beams in front. */
  render(gfx: Gfx, kit: RenderKit, caster: CasterSnapshot, layer: SkillLayer): void;
}

export type SkillLayer = 'behind' | 'front';

export interface SkillModifiers {
  /** Multiplies every customer's walking speed. */
  readonly customerSpeed?: number;
  /** Customers stop shouting. */
  readonly customersCalm?: boolean;
  /** Any hit wins a regular customer over (the escalated one takes triple damage). */
  readonly decisiveHits?: boolean;
  /** The player takes no damage. */
  readonly playerShielded?: boolean;
}

export const NO_MODIFIERS: SkillModifiers = {};

/** The caster as skills see it: centre, feet and facing. */
export interface SkillCaster {
  readonly x: number;
  readonly y: number;
  readonly feet: number;
  readonly facing: -1 | 1;
}

/** A customer as skills see it. */
export interface SkillTarget {
  readonly rect: Rect;
  readonly frustration: number;
  readonly escalated: boolean;
  readonly stunned: boolean;
}

/** What a skill may observe and change in the level. Implemented by the level's world. */
export interface SkillWorld {
  readonly time: number;
  readonly caster: SkillCaster;
  /** The camera view in world coordinates — "on screen" for skills. */
  readonly view: Rect;
  readonly rng: Rng;
  /** Customers that can still be won over. */
  targets(): readonly SkillTarget[];
  /**
   * Hits a customer. `spark` wraps the spark the world rolls for the hit,
   * e.g. in a `SkillEffect`, so the skill's look draws it; without it the
   * spark is the shared one.
   */
  hit(target: SkillTarget, damage: number, direction: -1 | 1, spark?: (burst: Burst) => Effect): void;
  stun(target: SkillTarget, seconds: number): void;
  /** Pops every complaint bubble overlapping `area`; returns how many popped. */
  popBubbles(area: Rect): number;
  fire(shot: Shot): void;
  effect(effect: Effect): void;
  /** Screen shake; ignored under reduced motion. */
  shake(intensity: number, seconds: number): void;
  /** Full-screen flash; ignored under reduced motion. */
  flash(color: string, seconds: number): void;
}
