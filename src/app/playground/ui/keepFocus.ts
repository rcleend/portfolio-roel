import type { MouseEvent } from 'react';

/**
 * Lets a click through without moving keyboard focus to the button, so Space
 * and the arrow keys keep driving the transport instead of the last button
 * clicked. Keyboard users still tab to every control as usual.
 */
export function keepFocus(event: MouseEvent): void {
  event.preventDefault();
}
