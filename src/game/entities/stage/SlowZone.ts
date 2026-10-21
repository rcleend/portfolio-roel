import type { Gfx } from '@/engine/gfx/Gfx';
import { intersects, type Rect } from '@/engine/math/Rect';
import type { PropSheet } from '../../levels/art/LevelArt';
import type { MoveScale } from '../player/movement';

/** How long each sway frame of the vines is held. */
const SWAY_SECONDS = 0.45;

/**
 * Scope creep: a patch of vines and tape that drags at the player's legs.
 * Drawn in front of the player so it visibly tangles them.
 */
export class SlowZone {
  readonly rect: Rect;
  readonly scale: MoveScale;

  constructor(rect: Rect, scale: MoveScale) {
    this.rect = rect;
    this.scale = scale;
  }

  contains(body: Rect): boolean {
    return intersects(body, this.rect);
  }

  render(gfx: Gfx, prop: PropSheet, time: number): void {
    const { x, y, w, h } = this.rect;
    gfx.withClip(x, y - prop.height + h, w, prop.height, () => {
      for (let left = x, index = 0; left < x + w; left += prop.width, index++) {
        // Neighbouring tufts sway out of phase so the patch ripples instead of pulsing.
        const frame = Math.floor(time / SWAY_SECONDS + index) % prop.frames;
        prop.draw(gfx, left, y + h - prop.height, frame);
      }
    });
  }
}
