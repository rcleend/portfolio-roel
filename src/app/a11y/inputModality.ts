/**
 * Whether the visitor's last input, anywhere on the page, was a key rather than a pointer, watched from the
 * page's start: the computer's screen and the radio's controls load later, often after the very key or click that
 * brought the visitor to them, and must still know which it was (useKeyboardModality follows the changes).
 */
let keyboard = false;

/** Starts watching `target`'s keys and pointers (the window, once, from main.tsx), ahead of any other listener. */
export function watchInputModality(target: EventTarget = window): void {
  target.addEventListener('keydown', () => (keyboard = true), true);
  target.addEventListener('pointerdown', () => (keyboard = false), true);
}

export const lastInputWasKeyboard = (): boolean => keyboard;
