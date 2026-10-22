import { AssetStore } from '@/engine/assets/AssetStore';
import { loadFonts } from './fonts';
import { loadLevelArt } from './levels/art/LevelArt';
import type { GameServices } from './services';

/**
 * The part of `GameServices` that is loaded rather than made: fonts and
 * their styles and every stage's art. Read-only once loaded, so a page
 * loads it once and shares it between the game and any number of scene
 * previews. The looks are not part of it: each game loads only the looks it
 * selects (`loadLooks`).
 */
export type GameResources = Pick<GameServices, 'assets' | 'fonts' | 'text' | 'levelArt'>;

/**
 * Downloads fonts and level art in parallel, into `assets`; pass a store to
 * share it with loads running alongside, such as the selected looks.
 */
export async function loadGameResources(assets: AssetStore = new AssetStore()): Promise<GameResources> {
  const [{ fonts, styles }, levelArt] = await Promise.all([loadFonts(assets), loadLevelArt(assets)]);
  return { assets, fonts, text: styles, levelArt };
}
