import type { PointerKind } from '../input/InputSnapshot';

/**
 * How the pointer over the picture should look, as the game names it: its own pixel arrow, its pointing hand over
 * anything a click acts on, or, over the play of a level, what a click there would do. Hosts draw each their own way
 * (docs/ROOM.md › Cursors).
 */
export const GAME_CURSORS = ['arrow', 'hand', 'walk', 'jump', 'attack'] as const;

export type GameCursor = (typeof GAME_CURSORS)[number];

/**
 * The contract between a running game and the host that presents it.
 *
 * A host (the 3D room's CRT, or the flat fallback TV) only ever sees this
 * interface: it shows `canvas`, refreshes when `onFrame` fires, forwards
 * pointer input in native pixel coordinates, draws the cursor the game asks
 * for over the picture and decides when the game may run.
 */
export interface GameSurface {
  /** Native-resolution pixels to present. Never resized by the host. */
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** Fires after every rendered frame. Returns an unsubscribe function. */
  onFrame(listener: () => void): () => void;
  pause(): void;
  resume(): void;
  readonly paused: boolean;
  /** Keyboard and gamepad reach the game only while the host has focus. */
  setInputEnabled(enabled: boolean): void;
  readonly pointer: PointerSink;
  /** The cursor over the picture, as of the last rendered frame. */
  readonly cursor: GameCursor;
  /** Fires when `cursor` changes (after a rendered frame). Returns an unsubscribe function. */
  onCursorChange(listener: (cursor: GameCursor) => void): () => void;
}

/**
 * Pointer input mapped by the host into native pixel coordinates. `kind` is the device behind it
 * (`PointerEvent.pointerType`); left out, a move is a mouse's and a press keeps the kind of the last move.
 */
export interface PointerSink {
  move(x: number, y: number, kind?: PointerKind): void;
  leave(): void;
  down(kind?: PointerKind): void;
  up(): void;
}
