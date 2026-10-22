import { AssetStore } from '@/engine/assets/AssetStore';
import { compileSprites } from './art';
import { loadFonts } from './fonts';
import { loadLevelArt } from './levels/art/LevelArt';
import type { GameServices } from './services';

/**
 * The part of `GameServices` that is loaded rather than made: fonts and
 * their styles, compiled sprites and every stage's art. Read-only once
 * loaded, so a page loads it once and shares it between the game and any
 * number of scene previews.
 */
export type GameResources = Pick<GameServices, 'assets' | 'fonts' | 'text' | 'sprites' | 'levelArt'>;

/** Downloads fonts and level art in parallel and compiles every sprite sheet. */
export async function loadGameResources(): Promise<GameResources> {
  const assets = new AssetStore();
  const [{ fonts, styles }, levelArt] = await Promise.all([loadFonts(assets), loadLevelArt(assets)]);
  return { assets, fonts, text: styles, sprites: compileSprites(), levelArt };
}
