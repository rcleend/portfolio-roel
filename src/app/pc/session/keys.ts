/** Keys that never skip the startup: moving focus, closing, and modifiers pressed on their own. */
const NON_SKIP_KEYS = new Set(['Tab', 'Shift', 'Escape', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Fn', 'OS']);

/** Whether a key press during the startup sequence should jump straight to the open reader. */
export function isSkipKey(key: string): boolean {
  return !NON_SKIP_KEYS.has(key);
}
