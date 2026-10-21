import type { Gfx } from '@/engine/gfx/Gfx';
import type { Rect } from '@/engine/math/Rect';
import type { Tileset } from '../../levels/art/LevelArt';
import { TILE } from '../../world/grid';

const BUMP_SECONDS = 0.18;
const BUMP_HEIGHT = 5;
const SHINE_EVERY = 1.3;
const SHINE_SECONDS = 0.12;

/** A gold "?" block holding one career highlight. Head-butt it or shoot it to unlock the highlight. */
export class HighlightBlock {
  readonly col: number;
  readonly row: number;
  readonly highlightId: string;
  readonly #x: number;
  readonly #y: number;
  #usedAt: number | null = null;

  constructor(col: number, row: number, top: number, highlightId: string) {
    this.col = col;
    this.row = row;
    this.highlightId = highlightId;
    this.#x = col * TILE;
    this.#y = top;
  }

  get used(): boolean {
    return this.#usedAt !== null;
  }

  get rect(): Rect {
    return { x: this.#x, y: this.#y, w: TILE, h: TILE };
  }

  /** Collects the highlight; returns true the first time only. */
  collect(time: number): boolean {
    if (this.used) return false;
    this.#usedAt = time;
    return true;
  }

  render(gfx: Gfx, tileset: Tileset, time: number): void {
    if (this.#usedAt !== null) {
      const t = time - this.#usedAt;
      const bump = t < BUMP_SECONDS ? Math.round(Math.sin((t / BUMP_SECONDS) * Math.PI) * BUMP_HEIGHT) : 0;
      tileset.draw(gfx, 'block_used', this.#x, this.#y - bump);
      return;
    }
    // Each block shines on its own beat (offset by column) so a row of blocks twinkles rather than strobes.
    const phase = (time + this.col * 0.37) % SHINE_EVERY;
    tileset.draw(gfx, phase < SHINE_SECONDS ? 'block_highlight_shine' : 'block_highlight', this.#x, this.#y);
  }
}
