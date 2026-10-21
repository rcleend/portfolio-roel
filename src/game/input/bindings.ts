import { GamepadAxis, GamepadButton, type InputBindings } from '@/engine/input/bindings';

/** Everything a player can do. Scenes read actions, never raw keys. */
export type Action =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'attack'
  | 'skill1'
  | 'skill2'
  | 'confirm'
  | 'back'
  | 'pause';

/**
 * Default bindings (see docs/ARCHITECTURE.md › Input). Several keys
 * deliberately share actions — Space jumps in a level and confirms in a menu —
 * because each scene only listens to the actions that make sense for it.
 */
export const bindings: InputBindings<Action> = {
  left: {
    keys: ['ArrowLeft', 'KeyA'],
    buttons: [GamepadButton.DpadLeft],
    axes: [{ axis: GamepadAxis.LeftX, direction: -1 }],
  },
  right: {
    keys: ['ArrowRight', 'KeyD'],
    buttons: [GamepadButton.DpadRight],
    axes: [{ axis: GamepadAxis.LeftX, direction: 1 }],
  },
  up: {
    keys: ['ArrowUp', 'KeyW'],
    buttons: [GamepadButton.DpadUp],
    axes: [{ axis: GamepadAxis.LeftY, direction: -1 }],
  },
  down: {
    keys: ['ArrowDown', 'KeyS'],
    buttons: [GamepadButton.DpadDown],
    axes: [{ axis: GamepadAxis.LeftY, direction: 1 }],
  },
  jump: { keys: ['KeyZ', 'Space', 'ArrowUp', 'KeyW'], buttons: [GamepadButton.A] },
  attack: { keys: ['KeyX', 'KeyJ'], buttons: [GamepadButton.X] },
  skill1: { keys: ['KeyC', 'KeyK'], buttons: [GamepadButton.Y] },
  skill2: { keys: ['KeyV', 'KeyL'], buttons: [GamepadButton.B] },
  confirm: { keys: ['Enter', 'Space', 'KeyZ'], buttons: [GamepadButton.A, GamepadButton.Start] },
  back: { keys: ['Escape', 'Backspace'], buttons: [GamepadButton.B] },
  pause: { keys: ['Escape', 'KeyP', 'Enter'], buttons: [GamepadButton.Start] },
};

export const ACTIONS = Object.keys(bindings) as Action[];
