import { TILE, TileGrid } from '../grid';
import { GRID_ROWS, GROUND_ROW, type LevelLayout } from './layout';

/** The art's ground line; the grid is offset so `GROUND_ROW` starts exactly here. */
export const GROUND_Y = 200;
export const GRID_ORIGIN_Y = GROUND_Y - GROUND_ROW * TILE;

/**
 * The static collision grid of a layout: ground (three rows deep, absent over
 * pits), one-way platforms and solid highlight blocks. Moving platforms,
 * barriers and gates are entities and collide through `CollisionWorld`.
 * `platforms: false` leaves the one-way platforms out, for bodies too big to
 * stand on them.
 */
export function buildGrid(layout: LevelLayout, options: { readonly platforms?: boolean } = {}): TileGrid {
  const grid = new TileGrid(layout.columns, GRID_ROWS, GRID_ORIGIN_Y);
  layout.ground.forEach((present, col) => {
    if (!present) return;
    for (let row = GROUND_ROW; row < GRID_ROWS; row++) grid.set(col, row, 'solid');
  });
  if (options.platforms !== false) {
    for (const run of layout.platforms) {
      for (let col = run.from; col <= run.to; col++) grid.set(col, run.row, 'oneWay');
    }
  }
  for (const block of layout.blocks) grid.set(block.col, block.row, 'solid');
  return grid;
}
