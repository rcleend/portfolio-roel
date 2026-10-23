import type { AxisBinding } from './bindings';

const AXIS_DEAD_ZONE = 0.5;
const BUTTON_THRESHOLD = 0.5;

/**
 * Polls the Gamepad API (it has no events for buttons). Merges every connected
 * pad, so whichever controller the visitor picks up just works.
 */
export class GamepadSource {
  readonly #getGamepads: () => readonly (Gamepad | null)[];

  constructor(getGamepads: () => readonly (Gamepad | null)[] = defaultGetGamepads) {
    this.#getGamepads = getGamepads;
  }

  /** Current state of every pad, reduced to the two queries bindings need. */
  read(): GamepadState {
    const pads = this.#getGamepads().filter((pad): pad is Gamepad => pad?.connected === true);
    return {
      connected: pads.length > 0,
      button: (index) =>
        pads.some(
          (pad) => (pad.buttons[index]?.value ?? 0) >= BUTTON_THRESHOLD || pad.buttons[index]?.pressed === true,
        ),
      axis: ({ axis, direction }) => pads.some((pad) => (pad.axes[axis] ?? 0) * direction >= AXIS_DEAD_ZONE),
    };
  }
}

export interface GamepadState {
  readonly connected: boolean;
  button(index: number): boolean;
  axis(binding: AxisBinding): boolean;
}

function defaultGetGamepads(): readonly (Gamepad | null)[] {
  return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
}
