// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { hidePointerUntilMoved } from './hidePointer';

function move(x: number, y: number, movement = 0, pointerType = 'mouse'): void {
  const event = new PointerEvent('pointermove', { clientX: x, clientY: y, pointerType });
  // happy-dom leaves the movement out of the init dictionary.
  Object.defineProperties(event, { movementX: { value: movement }, movementY: { value: 0 } });
  window.dispatchEvent(event);
}

describe('the pointer on arrival', () => {
  const root = document.documentElement;
  let reveal: () => void = () => {};
  afterEach(() => reveal());

  it('is hidden until the mouse really moves', () => {
    reveal = hidePointerUntilMoved(root);
    expect(root.dataset.pointer).toBe('hidden');
    // A resting mouse's place, re-sent as the page changes under it.
    move(400, 300);
    move(400, 300);
    move(401, 300);
    expect(root.dataset.pointer).toBe('hidden');
    move(406, 300);
    expect(root.dataset.pointer).toBeUndefined();
  });

  it('shows on a move that reports movement, or a press', () => {
    reveal = hidePointerUntilMoved(root);
    move(10, 10, 3);
    expect(root.dataset.pointer).toBeUndefined();

    reveal = hidePointerUntilMoved(root);
    window.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'mouse' }));
    expect(root.dataset.pointer).toBeUndefined();
  });

  it('ignores fingers and pens', () => {
    reveal = hidePointerUntilMoved(root);
    move(10, 10, 5, 'touch');
    move(90, 90, 5, 'pen');
    expect(root.dataset.pointer).toBe('hidden');
  });
});
