import { SpriteSheet } from '@/engine/gfx/SpriteSheet';
import { type HeartAnimation, heartSheet } from './hearts';
import { type StarAnimation, starSheet } from './star';

/**
 * Effect sheets every look shares: the hearts of the HUD and of a customer
 * won over, and the highlight card's stars. What a hero's attack or a skill
 * draws belongs to its look instead.
 */
export interface FxSprites {
  readonly star: SpriteSheet<StarAnimation>;
  readonly heart: SpriteSheet<HeartAnimation>;
}

let compiled: FxSprites | null = null;

/** Compiles the sheets on first use (compiling needs a canvas, so never at import time) and caches them. */
export function fxSprites(): FxSprites {
  compiled ??= {
    star: SpriteSheet.compile(starSheet, 'fx/star'),
    heart: SpriteSheet.compile(heartSheet, 'fx/heart'),
  };
  return compiled;
}

export { heartSheet, starSheet };
