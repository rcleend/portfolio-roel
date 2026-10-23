import type { Gfx } from '@/engine/gfx/Gfx';
import type { Tileset } from '../../../levels/art/LevelArt';
import { TILE } from '../../../world/grid';
import { GRID_ORIGIN_Y } from '../../../world/map/buildGrid';
import { GROUND_ROW, type LevelLayout } from '../../../world/map/layout';

const rowTop = (row: number): number => GRID_ORIGIN_Y + row * TILE;

/** Deterministic per-column variation so `_alt` tiles break up the repetition without a pattern. */
function altColumn(col: number, salt: number): boolean {
  const hash = Math.imul(col * 2654435761 + salt * 40503, 0x9e3779b1) >>> 0;
  return hash % 5 === 0;
}

/**
 * Picks the three ground tiles (top, fill, base) for a column from its
 * neighbours, following the tileset contract: a pit's left lip uses
 * `pit_edge_left` above `*_right` end caps, its right lip `pit_edge_right`
 * above `*_left` caps, and the pit itself `pit_top` over `pit_fill`.
 */
export function groundTiles(ground: readonly boolean[], col: number): readonly [string, string, string] {
  if (!ground[col]) return ['pit_top', 'pit_fill', 'pit_fill'];
  // Off the level's ends counts as ground, so the edges of the world never show caps.
  const left = col === 0 || ground[col - 1] === true;
  const right = col === ground.length - 1 || ground[col + 1] === true;
  if (!right) return ['pit_edge_left', 'ground_fill_right', 'ground_base_right'];
  if (!left) return ['pit_edge_right', 'ground_fill_left', 'ground_base_left'];
  return [
    altColumn(col, 1) ? 'ground_top_alt' : 'ground_top',
    altColumn(col, 2) ? 'ground_fill_alt' : 'ground_fill',
    altColumn(col, 3) ? 'ground_base_alt' : 'ground_base',
  ];
}

/** Platform tile for a column of a run: end caps at both ends, alternating middles. */
export function platformTile(from: number, to: number, col: number): string {
  if (from === to) return 'platform_mid';
  if (col === from) return 'platform_left';
  if (col === to) return 'platform_right';
  return altColumn(col, 4) ? 'platform_mid_alt' : 'platform_mid';
}

/** Draws the visible part of the play plane: ground and pits, platform supports, platforms. */
export function drawPlayPlane(gfx: Gfx, layout: LevelLayout, tileset: Tileset, viewX: number): void {
  const first = Math.max(0, Math.floor(viewX / TILE));
  const last = Math.min(layout.columns - 1, Math.floor((viewX + gfx.width) / TILE));
  for (let col = first; col <= last; col++) {
    const [top, fill, base] = groundTiles(layout.ground, col);
    const x = col * TILE;
    tileset.draw(gfx, top, x, rowTop(GROUND_ROW));
    tileset.draw(gfx, fill, x, rowTop(GROUND_ROW + 1));
    tileset.draw(gfx, base, x, rowTop(GROUND_ROW + 2));
  }
  for (const cell of layout.supports) {
    if (cell.col >= first && cell.col <= last) tileset.draw(gfx, 'platform_support', cell.col * TILE, rowTop(cell.row));
  }
  for (const run of layout.platforms) {
    for (let col = Math.max(run.from, first); col <= Math.min(run.to, last); col++) {
      tileset.draw(gfx, platformTile(run.from, run.to, col), col * TILE, rowTop(run.row));
    }
  }
}
