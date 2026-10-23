/** Keys that never skip the startup: moving focus, closing, and modifiers pressed on their own. */
const NON_SKIP_KEYS = new Set(['Tab', 'Shift', 'Escape', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn', 'OS']);
/** F1–F12 and beyond belong to the browser and the system: help, reload, full screen. */
const FUNCTION_KEY = /^F\d+$/;

/** The parts of a `KeyboardEvent` that decide whether it skips. */
export interface KeyPress {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/**
 * Whether a key press during the startup sequence should jump straight to the open reader.
 * Browser and system shortcuts (anything with Ctrl, ⌘ or Alt, and the function keys) are left
 * alone, as the game's keyboard source leaves them.
 */
export function isSkipKey({ key, ctrlKey, metaKey, altKey }: KeyPress): boolean {
  if (ctrlKey || metaKey || altKey) return false;
  return !NON_SKIP_KEYS.has(key) && !FUNCTION_KEY.test(key);
}
