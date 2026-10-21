import type { CharacterId, SkillId } from '@/content';
import type { PixelArtSheet } from '@/engine/gfx/PixelArt';
import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { artsySheet } from './characters/artsy';
import { hackermanSheet } from './characters/hackerman';
import type { CharacterAnimation } from './characters/rig';
import { strategySheet } from './characters/strategy';
import { type CustomerAnimation, unhappyCustomerSheet } from './enemies/unhappy-customer';
import { type SkillIconAnimation, skillIconSheets } from './icons/skills';

export type { CharacterAnimation } from './characters/rig';
export type { CustomerAnimation } from './enemies/unhappy-customer';
export type { SkillIconAnimation } from './icons/skills';

/** Source data for every shared sheet; tests validate these without a canvas. */
export const characterSheets: Readonly<Record<CharacterId, PixelArtSheet<CharacterAnimation>>> = {
  hackerman: hackermanSheet,
  artsy: artsySheet,
  strategy: strategySheet,
};

export { skillIconSheets, unhappyCustomerSheet };

/**
 * Compiled sprite sheets, built once at startup. All sheets face right;
 * draw with `flipX` to face left.
 */
export interface Sprites {
  readonly characters: Readonly<Record<CharacterId, SpriteSheet<CharacterAnimation>>>;
  readonly unhappyCustomer: SpriteSheet<CustomerAnimation>;
  readonly skillIcons: Readonly<Record<SkillId, SpriteSheet<SkillIconAnimation>>>;
}

export function compileSprites(): Sprites {
  const map = <K extends string, A extends string>(sheets: Readonly<Record<K, PixelArtSheet<A>>>, prefix: string) =>
    Object.fromEntries(
      Object.entries<PixelArtSheet<A>>(sheets).map(([id, sheet]) => [
        id,
        SpriteSheet.compile(sheet, `${prefix}/${id}`),
      ]),
    ) as Record<K, SpriteSheet<A>>;
  return {
    characters: map(characterSheets, 'characters'),
    unhappyCustomer: SpriteSheet.compile(unhappyCustomerSheet, 'enemies/unhappy-customer'),
    skillIcons: map(skillIconSheets, 'icons'),
  };
}
