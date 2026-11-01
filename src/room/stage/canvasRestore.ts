/**
 * Calls `repaint` whenever `canvas` comes back from a lost context. A GPU process reset (a laptop waking from sleep, a
 * display change, a driver reset) wipes every 2D canvas on the page, CPU ones (`willReadFrequently`) included, and
 * hands each back blank; the restored WebGL context then uploads what a texture's canvas holds. A canvas painted once
 * must paint again, or its texture reads black for good (docs/ROOM.md › Lost canvases). Returns a function that stops
 * listening.
 */
export function onCanvasRestored(canvas: HTMLCanvasElement, repaint: () => void): () => void {
  canvas.addEventListener('contextrestored', repaint);
  return () => canvas.removeEventListener('contextrestored', repaint);
}
