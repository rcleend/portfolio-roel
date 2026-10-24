import { type CharacterId, getCharacter, type SkillId } from '@/content';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { Vec2 } from '@/engine/math/Vec2';

/** Every hero sheet plays these, facing right; the game flips them to face left. */
export const CHARACTER_ANIMATIONS = ['idle', 'run', 'jump', 'fall', 'attack', 'skill', 'hurt', 'victory'] as const;
export type CharacterAnimation = (typeof CHARACTER_ANIMATIONS)[number];

/** A hero sheet may pose a skill its own way, the way Terraria gives each item its own use: `skill-<skillId>`. */
export type SkillPose = `skill-${SkillId}`;
/** What a hero sheet can play: the eight it must, and the skill poses it may add. */
export type HeroAnimation = CharacterAnimation | SkillPose;

/** The name of a hero sheet's own pose of `skill`. */
export function skillPose(skill: SkillId): SkillPose {
  return `skill-${skill}`;
}

/**
 * What a hero sheet for `characterId` plays that it may not: anything beyond the eight hero animations that
 * is not a pose of one of his own skills, which would never play.
 */
export function strayHeroAnimations(animations: readonly string[], characterId: CharacterId): string[] {
  const allowed = new Set<string>([...CHARACTER_ANIMATIONS, ...getCharacter(characterId).skills.map(skillPose)]);
  return animations.filter((animation) => !allowed.has(animation));
}

/** The animation `sheet` plays for `animation`: while casting `skill`, its own pose of it if it draws one. */
export function heroAnimation(
  sheet: SpriteSheet<HeroAnimation>,
  animation: CharacterAnimation,
  skill: SkillId | null,
): HeroAnimation {
  if (animation !== 'skill' || skill === null) return animation;
  const own = skillPose(skill);
  return sheet.has(own) ? own : animation;
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
