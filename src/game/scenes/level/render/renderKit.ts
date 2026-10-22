import { fxSprites } from '../../../art/fx';
import type { RenderKit } from '../../../entities/RenderKit';
import type { LevelArt } from '../../../levels/art/LevelArt';
import type { GameServices } from '../../../services';
import type { LevelTextStyles } from '../../../ui/hud/styles';
import type { World } from '../../../world/World';

/** What entities draw with this frame, on `art`'s stage at `world`'s time. */
export function levelRenderKit(
  services: GameServices,
  levelText: LevelTextStyles,
  world: World,
  art: LevelArt,
): RenderKit {
  const { looks, text, fonts, settings } = services;
  return {
    time: world.time,
    looks,
    fx: fxSprites(),
    text,
    fonts,
    levelText,
    art,
    reducedMotion: settings.reducedMotion,
  };
}
