import { GamepadButton } from '@/engine/input/bindings';
import { type Action, bindings } from '../../input/bindings';

/** The touch pad's controls as the game draws them: its d-pad, its four round buttons by colour, its Start. */
export type PadGlyph = 'dpad' | 'red' | 'yellow' | 'green' | 'blue' | 'start';

/**
 * What to print on a key cap: text, an arrow drawn as pixels (the HUD fonts have no arrows), or one of the touch
 * pad's controls, drawn instead of a key on a touch screen.
 */
export type KeyCapLabel =
  | { readonly text: string }
  | { readonly arrow: 'left' | 'right' | 'up' | 'down' }
  | { readonly pad: PadGlyph };

/** What the player plays with: a keyboard, a gamepad, or the on-screen touch pad. */
export type ControlDevice = 'keyboard' | 'gamepad' | 'touch';

const ARROWS: Readonly<Record<string, 'left' | 'right' | 'up' | 'down'>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

const NAMED_KEYS: Readonly<Record<string, string>> = {
  Space: 'SPACE',
  Enter: 'ENTER',
  Escape: 'ESC',
  Backspace: 'BKSP',
};

const BUTTON_NAMES: Readonly<Record<number, string>> = {
  [GamepadButton.A]: 'A',
  [GamepadButton.B]: 'B',
  [GamepadButton.X]: 'X',
  [GamepadButton.Y]: 'Y',
  [GamepadButton.Start]: 'START',
  [GamepadButton.Select]: 'SELECT',
};

/**
 * The touch pad's control for each gamepad button it stands in for (app/overlays/touchpad: Neo Geo order and colours,
 * JUMP the red A, ATTACK the yellow X, SKILL 1 the green Y, SKILL 2 the blue B).
 */
const PAD_GLYPHS: Readonly<Record<number, PadGlyph>> = {
  [GamepadButton.A]: 'red',
  [GamepadButton.X]: 'yellow',
  [GamepadButton.Y]: 'green',
  [GamepadButton.B]: 'blue',
  [GamepadButton.Start]: 'start',
};

/** A `KeyboardEvent.code` as players know it: `KeyZ` → "Z", `ArrowLeft` → ←. */
export function keyCapForCode(code: string): KeyCapLabel {
  const arrow = ARROWS[code];
  if (arrow) return { arrow };
  if (code.startsWith('Key')) return { text: code.slice(3) };
  if (code.startsWith('Digit')) return { text: code.slice(5) };
  return { text: NAMED_KEYS[code] ?? code.toUpperCase() };
}

/**
 * The key (or pad button) to show for `action`: the first binding, which
 * is the primary one in `game/input/bindings.ts`. Arrow keys are skipped for
 * actions other than movement so "jump" shows Z rather than ↑. On the touch
 * pad, movement is its d-pad and every other action the button that
 * presses it.
 */
export function keyCapFor(action: Action, device: ControlDevice): KeyCapLabel {
  const binding = bindings[action];
  const movement = action === 'left' || action === 'right' || action === 'up' || action === 'down';
  if (device === 'touch') {
    if (movement) return { pad: 'dpad' };
    const button = binding.buttons?.find((index) => PAD_GLYPHS[index] !== undefined);
    if (button !== undefined) return { pad: PAD_GLYPHS[button] ?? 'start' };
  }
  if (device === 'gamepad') {
    const button = binding.buttons?.find((index) => BUTTON_NAMES[index] !== undefined);
    if (button !== undefined) return { text: BUTTON_NAMES[button] ?? '?' };
  }
  const keys = binding.keys ?? [];
  const code = (movement ? keys[0] : keys.find((key) => !(key in ARROWS))) ?? keys[0];
  return code ? keyCapForCode(code) : { text: '?' };
}
