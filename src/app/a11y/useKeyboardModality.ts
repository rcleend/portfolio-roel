import { useSyncExternalStore } from 'react';
import { lastInputWasKeyboard } from './inputModality';

/**
 * Whether the visitor's last input, anywhere on the page, was a key rather than a pointer. Chrome's
 * `:focus-visible` matches a focus a script gives whenever an earlier one did (the page's own opening
 * focus on the stage does), so a ring on what a script focuses (the computer's document pane as the
 * reader opens, the radio's first CD as the camera lands) would show to mouse and touch users too; it
 * shows only with this. The value is watched from the page's start (inputModality.ts, whose listeners run
 * first), so a screen that loads after the key that brought the visitor still knows.
 */
export function useKeyboardModality(): boolean {
  return useSyncExternalStore(subscribe, lastInputWasKeyboard, () => false);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('keydown', onChange, true);
  window.addEventListener('pointerdown', onChange, true);
  return () => {
    window.removeEventListener('keydown', onChange, true);
    window.removeEventListener('pointerdown', onChange, true);
  };
}
