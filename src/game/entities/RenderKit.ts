import type { FxSprites } from '../art/fx';
import type { Looks } from '../art/looks/Looks';
import type { GameFonts, TextStyles } from '../fonts';
import type { LevelArt } from '../levels/art/LevelArt';
import type { LevelTextStyles } from '../ui/hud/styles';

/**
 * Everything an entity may need to draw itself. Entities draw in world
 * coordinates; the level scene applies the camera offset around them.
 */
export interface RenderKit {
  /** World time in seconds; all animation is a function of it. */
  readonly time: number;
  /** The selected look of every hero, the customer and every skill. */
  readonly looks: Looks;
  /** Effect sheets every look shares. */
  readonly fx: FxSprites;
  readonly text: TextStyles;
  readonly fonts: GameFonts;
  readonly levelText: LevelTextStyles;
  readonly art: LevelArt;
  readonly reducedMotion: boolean;
}
