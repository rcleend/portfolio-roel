/**
 * A toolbar's roving tabindex (one Tab stop; arrows move between its
 * controls), shared by the PC reader's toolbar and the CD player's: the
 * control to focus after `key`, or null when the key is not the toolbar's.
 * Up and Down are left alone: the reader's zoom field uses them.
 */
export function nextRovingIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count;
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
