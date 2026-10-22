import type { Gfx } from '@/engine/gfx/Gfx';
import type { TitleFrame } from '../TitleBackdrop';
import { INK, shadeOf } from './inks';
import { circle, PenPath } from './pen';
import { flare, plotPointRadius, RINGS, ringInk } from './timeline';

/** The compass rings, rasterised once around the origin and drawn wherever the strike lands. */
export function strikeRings(): readonly PenPath[] {
  return RINGS.radii.map((radius) => new PenPath([circle(0, 0, radius)]));
}

/**
 * The opening strike (docs/ART-DIRECTION.md › Title › Blueprint): a
 * white-hot plot point with a cross flare that retracts into it, while
 * compass rings snap outwards and cool down the ramp a step every two
 * frames. Under reduced motion only the plot point is struck.
 */
export function drawStrike(gfx: Gfx, frame: TitleFrame, at: number, rings: readonly PenPath[]): void {
  const { impact, reducedMotion } = frame;
  const radius = plotPointRadius(at, reducedMotion);
  if (reducedMotion) {
    if (radius !== null) gfx.circle(impact.x, impact.y, radius, shadeOf(INK.hot));
    return;
  }
  const { ctx } = gfx;
  const cross = flare(at);
  if (cross) {
    ctx.fillStyle = shadeOf(cross.ink);
    ctx.fillRect(impact.x - cross.x, impact.y, cross.x * 2 + 1, 1);
    ctx.fillRect(impact.x, impact.y - cross.y, 1, cross.y * 2 + 1);
    if (cross.core > 0) {
      ctx.fillRect(impact.x - cross.core, impact.y - 1, cross.core * 2 + 1, 3);
      ctx.fillRect(impact.x - 1, impact.y - cross.core, 3, cross.core * 2 + 1);
    }
  }
  gfx.withOffset(impact.x, impact.y, () => {
    rings.forEach((ring, index) => {
      const ink = ringInk(at, index);
      if (ink !== null) ring.ink(ctx, ring.length, shadeOf(ink));
    });
  });
  if (radius !== null) gfx.circle(impact.x, impact.y, radius, shadeOf(INK.hot));
}
