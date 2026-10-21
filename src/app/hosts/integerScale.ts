/** Fixed CSS sizes of the flat TV around the screen, in CSS pixels. Kept in sync with FlatHost.css. */
export const BEZEL = { side: 28, top: 28, bottom: 64, margin: 16, hint: 32 } as const;

/**
 * Largest whole-number zoom at which the native screen plus the TV bezel fits
 * the viewport. Integer zoom keeps every game pixel the same size; at least
 * 1 so the game is never shrunk below native resolution.
 */
export function integerScale(
  viewportWidth: number,
  viewportHeight: number,
  nativeWidth: number,
  nativeHeight: number,
): number {
  const availableWidth = viewportWidth - 2 * (BEZEL.side + BEZEL.margin);
  const availableHeight = viewportHeight - BEZEL.top - BEZEL.bottom - BEZEL.hint - 2 * BEZEL.margin;
  return Math.max(1, Math.floor(Math.min(availableWidth / nativeWidth, availableHeight / nativeHeight)));
}

/** Maps a client-space point to native game pixels given the canvas's on-screen rectangle. */
export function toNativePixels(
  clientX: number,
  clientY: number,
  rect: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  nativeWidth: number,
  nativeHeight: number,
): { readonly x: number; readonly y: number } {
  return {
    x: ((clientX - rect.left) / rect.width) * nativeWidth,
    y: ((clientY - rect.top) / rect.height) * nativeHeight,
  };
}
