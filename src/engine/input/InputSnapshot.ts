import { containsPoint, type Rect } from '../math/Rect';

export type InputDevice = 'keyboard' | 'gamepad' | 'pointer' | 'touch';

/** The device behind the pointer (`PointerEvent.pointerType`): a mouse hovers and has a cursor, a finger or pen taps. */
export type PointerKind = 'mouse' | 'touch' | 'pen';

/** Pointer state in native pixels, as fed by the host through `PointerSink`. */
export interface PointerSnapshot {
  readonly x: number;
  readonly y: number;
  /** The pointer is over the game screen. */
  readonly over: boolean;
  readonly down: boolean;
  /** Went down since the previous step. */
  readonly pressed: boolean;
  /** Went up since the previous step. */
  readonly released: boolean;
  /** The device of the last move or press: menus take any, but only a mouse aims, walks and clicks keys in a level. */
  readonly kind: PointerKind;
}

export interface ActionState {
  readonly down: boolean;
  readonly pressed: boolean;
  readonly released: boolean;
}

const RELEASED: ActionState = { down: false, pressed: false, released: false };

/**
 * Input as seen by one fixed simulation step. Immutable: a scene can hold on
 * to it, compare it and pass it around without it changing underneath.
 */
export class InputSnapshot<A extends string> {
  readonly pointer: PointerSnapshot;
  readonly lastDevice: InputDevice | null;
  /**
   * The visitor last used the pointer on the screen (moved it or pressed it there, a finger on the picture included),
   * not a key, a gamepad or the touch pad's buttons: menus hide the hand that shows where the keys are.
   */
  readonly pointing: boolean;
  readonly #actions: ReadonlyMap<A, ActionState>;
  /**
   * Something a click acts on reported the pointer over it during this step (`clickable`, `pointsAt`). A private
   * field, so it stays writable on the frozen snapshot: the one thing a step adds to the input it was given.
   */
  #overClickable = false;

  constructor(
    actions: ReadonlyMap<A, ActionState>,
    pointer: PointerSnapshot,
    lastDevice: InputDevice | null,
    pointing = false,
  ) {
    this.#actions = actions;
    this.pointer = Object.freeze({ ...pointer });
    this.lastDevice = lastDevice;
    this.pointing = pointing;
    Object.freeze(this);
  }

  /** A snapshot with nothing held or pressed. */
  static empty<A extends string>(pointer: PointerSnapshot = IDLE_POINTER, pointing = false): InputSnapshot<A> {
    return new InputSnapshot<A>(new Map(), pointer, null, pointing);
  }

  isDown(action: A): boolean {
    return this.#state(action).down;
  }

  wasPressed(action: A): boolean {
    return this.#state(action).pressed;
  }

  wasReleased(action: A): boolean {
    return this.#state(action).released;
  }

  /**
   * Whether the pointer rests on something a click acts on (a button, a key of a legend, a card, a mission), as its
   * own hit test found it: true reports it, and over the picture the host draws the game's hand rather than its arrow
   * (docs/ARCHITECTURE.md › GameSurface). Returns `hit`, so a hit test can pass straight through it.
   */
  clickable(hit: boolean): boolean {
    if (hit && this.pointer.over) this.#overClickable = true;
    return hit;
  }

  /** The pointer is over `area`, something a click acts on: `clickable` for a plain rectangle. */
  pointsAt(area: Rect): boolean {
    return this.clickable(this.pointer.over && containsPoint(area, this.pointer.x, this.pointer.y));
  }

  /** Something a click acts on was under the pointer this step (`clickable`). */
  get overClickable(): boolean {
    return this.#overClickable;
  }

  /** The visitor is doing something this step: an action or the pointer is held, pressed or let go. */
  get active(): boolean {
    const { down, pressed, released } = this.pointer;
    if (down || pressed || released) return true;
    for (const state of this.#actions.values()) if (state.down || state.pressed || state.released) return true;
    return false;
  }

  /** Any action or the pointer was pressed this step — "press any button". */
  get anyPressed(): boolean {
    if (this.pointer.pressed) return true;
    for (const state of this.#actions.values()) if (state.pressed) return true;
    return false;
  }

  /**
   * The same pointer position with every press removed. Used while input is
   * suppressed (e.g. during a transition) so hover visuals stay put but
   * nothing can be triggered.
   */
  idle(): InputSnapshot<A> {
    return InputSnapshot.empty<A>({ ...this.pointer, down: false, pressed: false, released: false }, this.pointing);
  }

  #state(action: A): ActionState {
    return this.#actions.get(action) ?? RELEASED;
  }
}

export const IDLE_POINTER: PointerSnapshot = Object.freeze({
  x: 0,
  y: 0,
  over: false,
  down: false,
  pressed: false,
  released: false,
  kind: 'mouse',
});
