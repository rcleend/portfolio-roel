import { SCREEN_HEIGHT, SCREEN_WIDTH } from '@/game/createGame';
import type { TileZoom } from '../state/playgroundState';

/** Space between tiles on a board, in CSS pixels. */
export const TILE_GAP = 24;
/** Space around a tile's screen, inside its frame, in CSS pixels. */
export const TILE_PADDING = 10;
/** Auto zoom stops here: anything larger is what focus mode is for. */
const AUTO_MAX_ZOOM = 2;

export interface GridLayout {
  readonly columns: number;
  /** Whole CSS pixels per game pixel. */
  readonly zoom: number;
  /** Width of one tile, screen and padding, in CSS pixels. */
  readonly tileWidth: number;
}

/**
 * Columns and zoom for a board of `count` tiles, `width` CSS pixels wide.
 * Auto takes the largest zoom (up to 2) that still fits two tiles side by
 * side, so a board always reads as a comparison. Rows are balanced: four
 * tiles sit two by two rather than three and one.
 */
export function gridLayout(width: number, count: number, zoom: TileZoom): GridLayout {
  const fitting = (factor: number): number =>
    Math.max(1, Math.floor((width + TILE_GAP) / (tileWidth(factor) + TILE_GAP)));
  const factor = zoom === 'auto' ? autoZoom(fitting, count) : zoom;
  const tiles = Math.max(1, count);
  const rows = Math.ceil(tiles / Math.min(tiles, fitting(factor)));
  return { columns: Math.ceil(tiles / rows), zoom: factor, tileWidth: tileWidth(factor) };
}

function tileWidth(zoom: number): number {
  return SCREEN_WIDTH * zoom + 2 * TILE_PADDING;
}

function autoZoom(fitting: (factor: number) => number, count: number): number {
  const sideBySide = Math.min(count, 2);
  for (let factor = AUTO_MAX_ZOOM; factor > 1; factor--) {
    if (fitting(factor) >= sideBySide) return factor;
  }
  return 1;
}

/** The largest whole zoom at which the native screen fits `width` × `height` CSS pixels; at least 1. */
export function fitZoom(width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(width / SCREEN_WIDTH, height / SCREEN_HEIGHT)));
}
