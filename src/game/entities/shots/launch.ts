import type { Gfx } from '@/engine/gfx/Gfx';
import type { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { type Vec2, ZERO } from '@/engine/math/Vec2';
import type { HeroAnimation } from '../../art/looks/contracts';
import { HAND } from '../player/size';

/**
 * How far a hero's look shifts its basic attack on screen: from the hand
 * point the game simulates to the `muzzle` anchor of the sheet's first
 * `attack` frame (the pose on show as the shot leaves), mirrored with the
 * hero. Purely visual: shots fly and hit from the hand in every look.
 */
export function launchOffset(sheet: SpriteSheet<HeroAnimation>, facing: -1 | 1): Vec2 {
  const muzzle = sheet.anchor('attack', 'muzzle', 0);
  if (!muzzle) return ZERO;
  const fromOrigin = sheet.toScreen(muzzle, 0, 0, facing < 0);
  return { x: fromOrigin.x - facing * HAND.reach, y: fromOrigin.y + HAND.height };
}

/** Runs `draw` shifted by the hero look's launch offset. */
export function drawLaunched(gfx: Gfx, sheet: SpriteSheet<HeroAnimation>, facing: -1 | 1, draw: () => void): void {
  const offset = launchOffset(sheet, facing);
  if (offset.x === 0 && offset.y === 0) draw();
  else gfx.withOffset(offset.x, offset.y, draw);
}
