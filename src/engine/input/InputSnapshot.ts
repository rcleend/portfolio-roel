export type InputDevice = 'keyboard' | 'gamepad' | 'pointer' | 'touch';

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
  readonly #actions: ReadonlyMap<A, ActionState>;

  constructor(actions: ReadonlyMap<A, ActionState>, pointer: PointerSnapshot, lastDevice: InputDevice | null) {
    this.#actions = actions;
    this.pointer = Object.freeze({ ...pointer });
    this.lastDevice = lastDevice;
    Object.freeze(this);
  }

  /** A snapshot with nothing held or pressed. */
  static empty<A extends string>(pointer: PointerSnapshot = IDLE_POINTER): InputSnapshot<A> {
    return new InputSnapshot<A>(new Map(), pointer, null);
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
    return InputSnapshot.empty<A>({ ...this.pointer, down: false, pressed: false, released: false });
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
});
