import { type CharacterId, getCharacter, type SkillId } from '@/content';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { Vec2 } from '@/engine/math/Vec2';

/** Every hero sheet plays these, facing right; the game flips them to face left. */
export const CHARACTER_ANIMATIONS = ['idle', 'run', 'jump', 'fall', 'attack', 'skill', 'hurt', 'victory'] as const;
export type CharacterAnimation = (typeof CHARACTER_ANIMATIONS)[number];

/** A hero sheet may pose a skill its own way, the way Terraria gives each item its own use: `skill-<skillId>`. */
export type SkillPose = `skill-${SkillId}`;

/** The moves a hero keeps his legs in while he attacks or casts, as Terraria does. */
export const LAYERED_MOVES = ['run', 'jump', 'fall'] as const;
export type LayeredMove = (typeof LAYERED_MOVES)[number];
/** What a hero does with his arms, whatever his legs are doing. */
export type ActionAnimation = 'attack' | 'skill' | SkillPose;

/**
 * A hero sheet drawn in layers splits each layered move into its legs, `<move>-legs`, and each attack and
 * skill pose into its upper body, `<pose>-upper`, so the game can draw a hero attacking or casting on the
 * move: the move's legs, with the pose's upper body over them (docs/LOOKS.md).
 */
export type LegsLayer = `${LayeredMove}-legs`;
export type UpperLayer = `${ActionAnimation}-upper`;

/** What a hero sheet can play: the eight it must, and the skill poses and layers it may add. */
export type HeroAnimation = CharacterAnimation | SkillPose | LegsLayer | UpperLayer;

/** The name of a hero sheet's own pose of `skill`. */
export function skillPose(skill: SkillId): SkillPose {
  return `skill-${skill}`;
}

export function legsLayer(move: LayeredMove): LegsLayer {
  return `${move}-legs`;
}

export function upperLayer(action: ActionAnimation): UpperLayer {
  return `${action}-upper`;
}

/**
 * What a hero sheet for `characterId` plays that it may not: anything beyond the eight hero animations, the
 * poses of his own skills and their layers, which would never play.
 */
export function strayHeroAnimations(animations: readonly string[], characterId: CharacterId): string[] {
  const actions: ActionAnimation[] = ['attack', 'skill', ...getCharacter(characterId).skills.map(skillPose)];
  const allowed = new Set<string>([
    ...CHARACTER_ANIMATIONS,
    ...actions,
    ...LAYERED_MOVES.map(legsLayer),
    ...actions.map(upperLayer),
  ]);
  return animations.filter((animation) => !allowed.has(animation));
}

/**
 * What is wrong with how a hero `sheet` is layered, if it is: one drawn in layers must
 * split every layered move and every attack and skill pose it plays, each split row playing as many frames
 * as fast as the row it splits. A sheet drawn whole has nothing to answer for.
 */
export function heroLayerErrors(sheet: SpriteSheet<string>): string[] {
  const names = sheet.animationNames;
  if (!names.some((name) => name.endsWith('-legs') || name.endsWith('-upper'))) return [];
  const actions = names.filter((name) => name === 'attack' || (name.startsWith('skill') && !name.endsWith('-upper')));
  const splits: readonly (readonly [whole: string, layer: string])[] = [
    ...LAYERED_MOVES.map((move) => [move, legsLayer(move)] as const),
    ...actions.map((action) => [action, `${action}-upper`] as const),
  ];
  const errors: string[] = [];
  for (const [whole, layer] of splits) {
    if (!sheet.has(layer)) errors.push(`"${layer}" is missing: a sheet drawn in layers splits "${whole}" too`);
    else if (sheet.frameCount(layer) !== sheet.frameCount(whole) || sheet.duration(layer) !== sheet.duration(whole))
      errors.push(`"${layer}" must play as many frames, as fast, as "${whole}"`);
  }
  return errors;
}

/** The pose `sheet` strikes to cast `skill`: its own pose of it if it draws one, else the shared one. */
function castPose(sheet: SpriteSheet<HeroAnimation>, skill: SkillId | null): 'skill' | SkillPose {
  if (skill === null) return 'skill';
  const own = skillPose(skill);
  return sheet.has(own) ? own : 'skill';
}

/** The animation `sheet` plays for `animation`: while casting `skill`, its own pose of it if it draws one. */
export function heroAnimation(
  sheet: SpriteSheet<HeroAnimation>,
  animation: CharacterAnimation,
  skill: SkillId | null,
): CharacterAnimation | SkillPose {
  return animation === 'skill' ? castPose(sheet, skill) : animation;
}

/** A hero's pose as gameplay reduces it (entities/player/Player.ts). */
export interface HeroPose {
  /** The animation a sheet drawn whole shows, and how far into it. */
  readonly animation: CharacterAnimation;
  /** The skill being cast while the animation is `skill`, which a look may pose its own way; otherwise null. */
  readonly skill: SkillId | null;
  readonly time: number;
  /** Attacking or casting while running, jumping or falling; otherwise null. */
  readonly onTheMove: OnTheMove | null;
}

/**
 * An attack or a skill on the move. A sheet drawn whole shows a skill pose standing and drops an attack
 * pose (`HeroPose.animation`); one drawn in layers keeps the move's legs under the pose's upper body, the
 * way Terraria keeps the legs of the current move and swings the item with the arms.
 */
export interface OnTheMove {
  readonly action: 'attack' | 'skill';
  readonly actionTime: number;
  readonly move: LayeredMove;
  /** How long the hero has been making the move, so the legs keep their stride through the attack. */
  readonly moveTime: number;
}

/** One animation of a hero sheet, and how far into it. */
export interface HeroLayer {
  readonly animation: HeroAnimation;
  readonly time: number;
}

/** What a hero sheet draws for a pose: the frame on top, whose anchors are the hero's, over any legs. */
export interface HeroFrame extends HeroLayer {
  readonly legs: HeroLayer | null;
}

/** The frame `sheet` draws for `pose`. */
export function heroFrame(sheet: SpriteSheet<HeroAnimation>, pose: HeroPose): HeroFrame {
  const moving = pose.onTheMove;
  if (moving) {
    const upper = upperLayer(moving.action === 'skill' ? castPose(sheet, pose.skill) : 'attack');
    const legs = legsLayer(moving.move);
    if (sheet.has(upper) && sheet.has(legs)) {
      return { animation: upper, time: moving.actionTime, legs: { animation: legs, time: moving.moveTime } };
    }
  }
  return { animation: heroAnimation(sheet, pose.animation, pose.skill), time: pose.time, legs: null };
}

/** The customer's moods, from furious to won over (`happy`). */
export const CUSTOMER_ANIMATIONS = ['walk', 'shout', 'hurt', 'stunned', 'happy'] as const;
export type CustomerAnimation = (typeof CUSTOMER_ANIMATIONS)[number];

/** A skill icon is one gently animated loop. */
export const SKILL_ICON_ANIMATIONS = ['idle'] as const;
export type SkillIconAnimation = (typeof SKILL_ICON_ANIMATIONS)[number];

/**
 * What an image sheet of one kind must provide (docs/LOOKS.md). Looks are
 * interchangeable only because they agree on frame size and origin, so a
 * sheet that does not is rejected at load time. Classic's pixel art predates
 * the sizes and is held to its animations only.
 */
export interface SheetContract<A extends string> {
  readonly animations: readonly A[];
  readonly frame: { readonly w: number; readonly h: number };
  readonly origin: Vec2;
}

/** Heroes and the customer stand in 64 × 64 frames with their feet on the bottom-centre origin. */
export const HERO_SHEET: SheetContract<HeroAnimation> = {
  animations: CHARACTER_ANIMATIONS,
  frame: { w: 64, h: 64 },
  origin: { x: 32, y: 64 },
};

export const CUSTOMER_SHEET: SheetContract<CustomerAnimation> = {
  animations: CUSTOMER_ANIMATIONS,
  frame: { w: 64, h: 64 },
  origin: { x: 32, y: 64 },
};

/** Icons are drawn from their top-left corner into a bevelled slot sized to fit them. */
export const SKILL_ICON_SHEET: SheetContract<SkillIconAnimation> = {
  animations: SKILL_ICON_ANIMATIONS,
  frame: { w: 24, h: 24 },
  origin: { x: 0, y: 0 },
};
