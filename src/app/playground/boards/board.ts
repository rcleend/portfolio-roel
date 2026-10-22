import type { Choice, Picker, Picks, Subject } from './subject';

/**
 * A titled grid of live tiles, one for every choice of the picker it
 * compares, with the subject's other pickers held at picks all its tiles
 * share. "Title lockup" compares every lockup on one backdrop.
 */
export interface Board {
  /** Page anchor and prefix of the board's keys in the URL. */
  readonly id: string;
  readonly title: string;
  /** One line under the title. */
  readonly summary: string;
  readonly subject: Subject;
  /** Id of the subject's picker whose every choice gets a tile. */
  readonly compares: string;
}

/** One live preview on a board: the board's subject at `picks`. */
export interface Tile {
  /** Unique on the page. */
  readonly key: string;
  readonly board: Board;
  readonly choice: Choice;
  /** Whether this is what the game shows today. */
  readonly current: boolean;
  /** What the tile shows; a picker left out stands at today's choice. */
  readonly picks: Picks;
}

/** The picker whose every choice gets a tile. */
export function comparedPicker(board: Board): Picker {
  const picker = board.subject.pickers.find((candidate) => candidate.id === board.compares);
  if (!picker) throw new Error(`Board "${board.id}" compares "${board.compares}", which ${board.subject.id} lacks`);
  return picker;
}

/** The pickers every tile of `board` shares: all of its subject's but the one it compares. */
export function sharedPickers(board: Board): readonly Picker[] {
  return board.subject.pickers.filter((picker) => picker.id !== board.compares);
}

/** A tile for every choice of the compared picker, in registry order, on the `shared` picks. */
export function boardTiles(board: Board, shared: Picks): readonly Tile[] {
  const compared = comparedPicker(board);
  return compared.choices.map((choice) => ({
    key: `${board.id}/${choice.id}`,
    board,
    choice,
    current: choice.id === compared.current,
    picks: { ...shared, [compared.id]: choice.id },
  }));
}
