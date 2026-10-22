import type { CharacterId, SkillId } from '@/content';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import type { AttackVisual } from '../../entities/shots/AttackVisual';
import type { SkillVisual } from '../../skills/SkillVisual';
import type { CharacterAnimation, CustomerAnimation, SkillIconAnimation } from './contracts';
import type { LookId } from './ids';
import type { LookSelection } from './selection';

/**
 * The art the game draws with: one loaded look per hero, the customer and
 * each skill, as chosen by `selection`. Scenes draw through this and never
 * through a particular look, so any mix of looks plays the same game.
 */
export interface Looks {
  readonly selection: LookSelection;
  readonly characters: Readonly<Record<CharacterId, HeroLook>>;
  readonly customer: CustomerLook;
  readonly skills: SkillLooks;
}

export interface HeroLook {
  readonly lookId: LookId;
  readonly sheet: SpriteSheet<CharacterAnimation>;
  readonly attack: AttackVisual;
}

export interface CustomerLook {
  readonly lookId: LookId;
  readonly sheet: SpriteSheet<CustomerAnimation>;
}

export interface SkillLook<K extends SkillId> {
  readonly lookId: LookId;
  readonly icon: SpriteSheet<SkillIconAnimation>;
  /** Complete: every part the look leaves out is classic's. */
  readonly visual: SkillVisual<K>;
}

/** Each skill's look keeps its own skill's typing, so `skills['power-chord'].visual` draws power-chord state. */
export type SkillLooks = { readonly [K in SkillId]: SkillLook<K> };

/** Every skill's icon on show, e.g. to size a row of slots for the largest. */
export function skillIcons(looks: Looks): readonly SpriteSheet<SkillIconAnimation>[] {
  return Object.values(looks.skills).map((skill) => skill.icon);
}
