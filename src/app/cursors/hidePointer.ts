/** Further than this (CSS px) from where a mouse was first seen, and it has really moved. */
const MOVE_SLOP = 2;

/**
 * The page opens with the mouse pointer hidden (index.html marks the root `data-pointer="hidden"`, cursors.css hides
 * every cursor under it) and shows it the first time the visitor moves the mouse or presses a button, from then on.
 * A browser re-sends a resting mouse's place when the page changes under it: such a move has no movement and the same
 * place, so it does not count. Returns a function that shows the pointer at once.
 */
export function hidePointerUntilMoved(root: HTMLElement = document.documentElement): () => void {
  root.dataset.pointer = 'hidden';
  let origin: { readonly x: number; readonly y: number } | null = null;
  const options = { capture: true, passive: true } as const;
  const reveal = (): void => {
    delete root.dataset.pointer;
    window.removeEventListener('pointermove', moved, options);
    window.removeEventListener('pointerdown', pressed, options);
  };
  const moved = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    if (event.movementX !== 0 || event.movementY !== 0) reveal();
    else if (!origin) origin = { x: event.clientX, y: event.clientY };
    else if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > MOVE_SLOP) reveal();
  };
  const pressed = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') reveal();
  };
  window.addEventListener('pointermove', moved, options);
  window.addEventListener('pointerdown', pressed, options);
  return reveal;
}
