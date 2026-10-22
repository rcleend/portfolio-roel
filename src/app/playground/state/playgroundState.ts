import { type Board, sharedPickers } from '../boards/board';
import type { Picks, Subject } from '../boards/subject';

/** Tile zoom factors on offer; `auto` picks the largest that still shows two tiles side by side. */
export const TILE_ZOOMS = [1, 2, 3] as const;
export type TileZoom = 'auto' | (typeof TILE_ZOOMS)[number];

/** On/off settings for every preview on the page. */
export type Toggle = 'crt' | 'reducedMotion' | 'sound';

/** One combination shown large: a subject at a pick for each of its pickers. */
export interface Focus {
  readonly subject: Subject;
  readonly picks: Picks;
}

/** Everything about the page a link can share; the transport's moment is not part of it. */
export interface PlaygroundState {
  /** The picks all tiles of a board share, by board id. */
  readonly shared: Readonly<Record<string, Picks>>;
  /** The combination shown large, or `null` on the boards. */
  readonly focus: Focus | null;
  /** Scanlines and vignette, as on the flat host's television. */
  readonly crt: boolean;
  /** Re-creates every scene with `settings.reducedMotion`. */
  readonly reducedMotion: boolean;
  /** Plays the focused view's music and effects; tiles on the boards are always silent. */
  readonly sound: boolean;
  readonly zoom: TileZoom;
}

export type PlaygroundAction =
  | { readonly type: 'share'; readonly board: string; readonly picker: string; readonly choice: string }
  | { readonly type: 'focus'; readonly focus: Focus | null }
  | { readonly type: 'focusPick'; readonly picker: string; readonly choice: string }
  | { readonly type: 'toggle'; readonly setting: Toggle }
  | { readonly type: 'zoom'; readonly zoom: TileZoom };

/** The page as it opens without a query: every board on what the game shows today. */
export function defaultState(boards: readonly Board[]): PlaygroundState {
  return {
    shared: Object.fromEntries(boards.map((board) => [board.id, currentShared(board)])),
    focus: null,
    crt: false,
    reducedMotion: false,
    sound: false,
    zoom: 'auto',
  };
}

/** The picks a board's tiles share, each at what the game shows today. */
export function currentShared(board: Board): Picks {
  return Object.fromEntries(sharedPickers(board).map((picker) => [picker.id, picker.current]));
}

export function reducePlayground(state: PlaygroundState, action: PlaygroundAction): PlaygroundState {
  switch (action.type) {
    case 'share':
      return {
        ...state,
        shared: { ...state.shared, [action.board]: { ...state.shared[action.board], [action.picker]: action.choice } },
      };
    case 'focus':
      return action.focus === state.focus ? state : { ...state, focus: action.focus };
    case 'focusPick':
      if (!state.focus) return state;
      return { ...state, focus: { ...state.focus, picks: { ...state.focus.picks, [action.picker]: action.choice } } };
    case 'toggle':
      return { ...state, [action.setting]: !state[action.setting] };
    case 'zoom':
      return { ...state, zoom: action.zoom };
  }
}
