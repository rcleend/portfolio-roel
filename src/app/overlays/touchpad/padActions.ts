import { GamepadButton, type InputBindings } from '@/engine/input/bindings';

/** The physical controls drawn on the touch pad. */
export type PadButtonId = 'jump' | 'attack' | 'skill1' | 'skill2' | 'start';
export type PadDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Each pad control stands in for one button of a standard gamepad, so it
 * presses exactly the actions that button does in the game's bindings
 * (JUMP is the A button: jump in a level, confirm in a menu). The bindings
 * table stays the single source of truth for what a button means.
 */
export const PAD_BUTTON_GAMEPAD: Readonly<Record<PadButtonId, number>> = {
  jump: GamepadButton.A,
  attack: GamepadButton.X,
  skill1: GamepadButton.Y,
  skill2: GamepadButton.B,
  start: GamepadButton.Start,
};

export const PAD_DIRECTION_GAMEPAD: Readonly<Record<PadDirection, number>> = {
  up: GamepadButton.DpadUp,
  down: GamepadButton.DpadDown,
  left: GamepadButton.DpadLeft,
  right: GamepadButton.DpadRight,
};

/** Every action bound to gamepad button `index`, in binding order. */
export function actionsForGamepadButton<A extends string>(bindings: InputBindings<A>, index: number): A[] {
  return (Object.keys(bindings) as A[]).filter((action) => bindings[action].buttons?.includes(index) ?? false);
}

export interface PadActionMap<A extends string> {
  readonly buttons: Readonly<Record<PadButtonId, readonly A[]>>;
  readonly directions: Readonly<Record<PadDirection, readonly A[]>>;
}

export function padActionMap<A extends string>(bindings: InputBindings<A>): PadActionMap<A> {
  const map = <K extends string>(table: Readonly<Record<K, number>>) =>
    Object.fromEntries(
      Object.entries<number>(table).map(([id, index]) => [id, actionsForGamepadButton(bindings, index)]),
    ) as Record<K, A[]>;
  return { buttons: map(PAD_BUTTON_GAMEPAD), directions: map(PAD_DIRECTION_GAMEPAD) };
}
