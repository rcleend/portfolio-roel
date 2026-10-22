import type { Choice, Picker, Picks, Subject } from './subject';

/** One row of a board: a subject whose every choice of the board's compared picker gets a tile. */
export interface BoardRow {
  readonly subject: Subject;
  /** Heads the row, e.g. the hero; a board of one row needs none. */
  readonly title?: string;
  /** Heads the group of rows this one starts, e.g. the hero whose skills follow. */
  readonly group?: string;
}

/**
 * A titled grid of live tiles. Each row compares every choice of one picker
 * of its subject (`compares`), and every tile shares the board's settings of
 * the pickers in `shares`, which every row's subject has: "Title lockup"
 * compares every lockup on one backdrop; "Characters" compares every look of
 * each hero, in one view.
 */
export interface Board {
  /** Page anchor and prefix of the board's keys in the URL. */
  readonly id: string;
  readonly title: string;
  /** One line under the title. */
  readonly summary: string;
  readonly rows: readonly BoardRow[];
  /** Id of the picker whose every choice gets a tile, in every row. */
  readonly compares: string;
  /** Ids of the pickers set once for the whole board, shown in its header. */
  readonly shares: readonly string[];
}

/** One live preview on a board: its row's subject at `picks`. */
export interface Tile {
  /** Unique on the page. */
  readonly key: string;
  readonly board: Board;
  readonly row: BoardRow;
  readonly choice: Choice;
  /** Whether this is what the game shows today. */
  readonly current: boolean;
  /** What the tile shows; a picker left out stands at today's choice. */
  readonly picks: Picks;
}

/** A row and its tiles. */
export interface RowTiles {
  readonly row: BoardRow;
  readonly tiles: readonly Tile[];
}

/** The picker of `subject` called `id`. */
export function pickerOf(subject: Subject, id: string): Picker {
  const picker = subject.pickers.find((candidate) => candidate.id === id);
  if (!picker) throw new Error(`${subject.id} has no picker "${id}"`);
  return picker;
}

/** The pickers set once for the whole board, as its first row's subject defines them. */
export function sharedPickers(board: Board): readonly Picker[] {
  const first = board.rows[0];
  return first ? board.shares.map((id) => pickerOf(first.subject, id)) : [];
}

/** Each row with a tile for every choice of its compared picker, in registry order, on the `shared` picks. */
export function boardRows(board: Board, shared: Picks): readonly RowTiles[] {
  return board.rows.map((row) => {
    const compared = pickerOf(row.subject, board.compares);
    const tiles = compared.choices.map((choice) => ({
      key: `${board.id}/${row.subject.id}/${choice.id}`,
      board,
      row,
      choice,
      current: choice.id === compared.current,
      picks: { ...shared, [compared.id]: choice.id },
    }));
    return { row, tiles };
  });
}

/** Every tile of the board, row by row. */
export function boardTiles(board: Board, shared: Picks): readonly Tile[] {
  return boardRows(board, shared).flatMap((row) => row.tiles);
}
