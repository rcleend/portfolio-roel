import type { CharacterId } from '@/content';
import type { PixelArtSheet } from '@/engine/gfx/PixelArt';
import { artsySheet } from './looks/classic/characters/artsy/sheet';
import { hackermanSheet } from './looks/classic/characters/hackerman/sheet';
import { strategySheet } from './looks/classic/characters/strategy/sheet';
import { unhappyCustomerSheet } from './looks/classic/customer/sheet';
import type { CharacterAnimation } from './looks/contracts';

export type { CharacterAnimation, CustomerAnimation, SkillIconAnimation } from './looks/contracts';

/**
 * Classic's sheets, bundled as code. The loading screen draws with them
 * before any look has loaded; everything in the game draws through
 * `services.looks` instead.
 */
export const characterSheets: Readonly<Record<CharacterId, PixelArtSheet<CharacterAnimation>>> = {
  hackerman: hackermanSheet,
  artsy: artsySheet,
  strategy: strategySheet,
};

export { unhappyCustomerSheet };
