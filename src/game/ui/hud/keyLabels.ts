import { GamepadButton } from '@/engine/input/bindings';
import { type Action, bindings } from '../../input/bindings';

/** What to print on a key cap: text, or an arrow drawn as pixels (the HUD fonts have no arrows). */
export type KeyCapLabel = { readonly text: string } | { readonly arrow: 'left' | 'right' | 'up' | 'down' };

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
 * actions other than movement so "jump" shows Z rather than ↑.
 */
export function keyCapFor(action: Action, device: 'keyboard' | 'gamepad'): KeyCapLabel {
  const binding = bindings[action];
  if (device === 'gamepad') {
    const button = binding.buttons?.find((index) => BUTTON_NAMES[index] !== undefined);
    if (button !== undefined) return { text: BUTTON_NAMES[button] ?? '?' };
  }
  const movement = action === 'left' || action === 'right' || action === 'up' || action === 'down';
  const keys = binding.keys ?? [];
  const code = (movement ? keys[0] : keys.find((key) => !(key in ARROWS))) ?? keys[0];
  return code ? keyCapForCode(code) : { text: '?' };
}
