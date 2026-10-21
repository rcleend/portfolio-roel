import type { PointerSink } from '../core/GameSurface';
import type { InputBindings } from './bindings';
import type { GamepadSource } from './GamepadSource';
import { type ActionState, type InputDevice, InputSnapshot } from './InputSnapshot';
import { KeyboardSource } from './KeyboardSource';
import { PointerState } from './PointerState';
import { VirtualButtons } from './VirtualButtons';

export interface InputManagerOptions {
  /** Defaults to a window keyboard listener. Pass `null` to disable keyboard input entirely (tests, kiosks). */
  readonly keyboard?: KeyboardSource | null;
  readonly gamepad?: GamepadSource | null;
}

/**
 * Turns raw devices into one immutable `InputSnapshot` per fixed step.
 *
 * Edge semantics: `wasPressed` fires on the step an action goes from up to
 * down — including a tap that went down and up between two steps, and a
 * re-press within a step. Holding a second key bound to an already-held
 * action does not press it again.
 */
export class InputManager<A extends string> {
  readonly pointer: PointerSink;
  readonly virtual = new VirtualButtons<A>();
  readonly #bindings: InputBindings<A>;
  readonly #actions: readonly A[];
  readonly #keyboard: KeyboardSource | null;
  readonly #gamepad: GamepadSource | null;
  readonly #pointer = new PointerState();
  #previous = new Map<A, ActionState>();
  #lastDevice: InputDevice | null = null;
  #enabled = true;

  constructor(bindings: InputBindings<A>, options: InputManagerOptions = {}) {
    this.#bindings = bindings;
    this.#actions = Object.keys(bindings) as A[];
    const gameKeys = new Set(this.#actions.flatMap((action) => bindings[action].keys ?? []));
    this.#keyboard =
      options.keyboard === undefined ? new KeyboardSource((code) => gameKeys.has(code)) : options.keyboard;
    this.#gamepad = options.gamepad ?? null;
    this.pointer = this.#pointer;
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  /** Keyboard and gamepad only reach the game while enabled; pointer and virtual buttons are host-controlled. */
  setEnabled(enabled: boolean): void {
    this.#enabled = enabled;
    if (this.#keyboard) this.#keyboard.enabled = enabled;
  }

  /** Samples every device once. Call exactly once per fixed step. */
  poll(): InputSnapshot<A> {
    const keys = this.#keyboard?.keys.drain();
    const virtual = this.virtual.tracker.drain();
    const pad = this.#enabled ? this.#gamepad?.read() : undefined;
    const { snapshot: pointer, active: pointerActive } = this.#pointer.drain();

    const next = new Map<A, ActionState>();
    let device: InputDevice | null = null;
    for (const action of this.#actions) {
      const binding = this.#bindings[action];
      const boundKeys = binding.keys ?? [];
      const keyDown = boundKeys.some((code) => keys?.down.has(code));
      const keyPressed = boundKeys.some((code) => keys?.pressed.has(code));
      const keyReleased = boundKeys.some((code) => keys?.released.has(code));
      const padDown =
        pad !== undefined &&
        ((binding.buttons ?? []).some((index) => pad.button(index)) ||
          (binding.axes ?? []).some((axis) => pad.axis(axis)));
      const virtualDown = virtual.down.has(action);
      const virtualPressed = virtual.pressed.has(action);

      const wasDown = this.#previous.get(action)?.down ?? false;
      const down = keyDown || padDown || virtualDown;
      const pressEdge = keyPressed || virtualPressed;
      const releaseEdge = keyReleased || virtual.released.has(action);
      const repressed = wasDown && down && pressEdge && releaseEdge;
      const pressed = (!wasDown && (down || pressEdge)) || repressed;
      const released = (wasDown && !down) || (!wasDown && !down && pressEdge) || repressed;
      next.set(action, { down, pressed, released });

      if (pressed) device ??= keyPressed ? 'keyboard' : virtualPressed ? 'touch' : padDown ? 'gamepad' : null;
    }
    if (pointer.pressed || (pointerActive && device === null && pointer.down)) device ??= 'pointer';
    if (device) this.#lastDevice = device;
    this.#previous = next;
    return new InputSnapshot(next, pointer, this.#lastDevice);
  }

  dispose(): void {
    this.#keyboard?.dispose();
  }
}
