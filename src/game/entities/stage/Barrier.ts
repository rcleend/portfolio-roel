import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import type { PropSheet } from '../../levels/art/LevelArt';
import type { Surface } from '../../world/collision';

/** A Baustelle barrier: decoration with a walkable top bar, handy as a step over a pit. */
export class Barrier implements Surface {
  readonly rect: Rect;
  readonly dx = 0;
  readonly dy = 0;
  readonly #x: number;
  readonly #top: number;

  constructor(x: number, groundY: number, propWidth: number, propHeight: number, topInset: number) {
    this.#x = x;
    this.#top = groundY - propHeight;
    this.rect = { x, y: this.#top + topInset, w: propWidth, h: 4 };
  }

  render(gfx: Gfx, prop: PropSheet): void {
    prop.draw(gfx, this.#x, this.#top);
  }
}
