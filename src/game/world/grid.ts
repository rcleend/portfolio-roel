/** Side length of one play-plane tile in pixels; matches every level tileset. */
export const TILE = 16;

/**
 * What a tile does to a body:
 * - `empty`  — nothing.
 * - `solid`  — blocks from every side (ground, "?" blocks).
 * - `oneWay` — can be landed on from above and passed through from below and the sides (platforms).
 */
export type TileKind = 'empty' | 'solid' | 'oneWay';

const KIND_CODES: readonly TileKind[] = ['empty', 'solid', 'oneWay'];

/**
 * The collision grid of one level, `columns × rows` tiles.
 *
 * Rows are offset by `originY` because the art's ground line (groundY 200)
 * is not a multiple of 16: with `originY` 8, row 12 starts exactly on the
 * ground. Outside the grid, the left and right edges behave as walls and
 * everything above or below is empty, so bodies can fall out of the bottom
 * of a pit but never leave the level sideways.
 */
export class TileGrid {
  readonly columns: number;
  readonly rows: number;
  readonly originY: number;
  readonly #cells: Uint8Array;

  constructor(columns: number, rows: number, originY: number) {
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns <= 0 || rows <= 0) {
      throw new RangeError(`TileGrid: size must be positive integers, got ${columns}×${rows}`);
    }
    this.columns = columns;
    this.rows = rows;
    this.originY = originY;
    this.#cells = new Uint8Array(columns * rows);
  }

  get widthPx(): number {
    return this.columns * TILE;
  }

  kindAt(col: number, row: number): TileKind {
    if (col < 0 || col >= this.columns) return 'solid';
    if (row < 0 || row >= this.rows) return 'empty';
    return KIND_CODES[this.#cells[row * this.columns + col] ?? 0] ?? 'empty';
  }

  set(col: number, row: number, kind: TileKind): void {
    if (col < 0 || col >= this.columns || row < 0 || row >= this.rows) {
      throw new RangeError(`TileGrid: cell (${col}, ${row}) is outside ${this.columns}×${this.rows}`);
    }
    this.#cells[row * this.columns + col] = KIND_CODES.indexOf(kind);
  }

  colAt(x: number): number {
    return Math.floor(x / TILE);
  }

  rowAt(y: number): number {
    return Math.floor((y - this.originY) / TILE);
  }

  colLeft(col: number): number {
    return col * TILE;
  }

  rowTop(row: number): number {
    return this.originY + row * TILE;
  }
}
