import type { Gfx } from '@/engine/gfx/Gfx';
import type { SpriteDrawOptions, SpriteSheet } from '@/engine/gfx/SpriteSheet';

/**
 * Draws a sprite at a whole-number scale around its origin. Integer scaling
 * with smoothing off keeps every art pixel a crisp square block — the
 * escalated customer is the same sheet at 2×.
 */
export function drawSpriteScaled<A extends string>(
  gfx: Gfx,
  sheet: SpriteSheet<A>,
  animation: A,
  time: number,
  x: number,
  y: number,
  scale: number,
  options?: SpriteDrawOptions,
): void {
  if (scale === 1) {
    gfx.sprite(sheet, animation, time, x, y, options);
    return;
  }
  const { ctx } = gfx;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale, scale);
  sheet.draw(ctx, animation, time, 0, 0, options);
  ctx.restore();
}
