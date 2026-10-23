import type { ZoomSetting } from '../reader/zoom';

/** Where the visitor left the résumé, to reopen it there. */
export interface ScrollMemory {
  readonly top: number;
  /** The scroll range it was measured in; another layout (zoom, pop-out) restores proportionally. */
  readonly range: number;
  /** Which layout `top` belongs to (see `layoutKey`). */
  readonly layout: string;
}

/**
 * What the computer remembers between visits, for the rest of the page load
 * (never stored): whether the reader has opened before (later visits play the
 * short startup), the zoom the visitor chose and where they were reading.
 */
export interface ReaderMemory {
  opened: boolean;
  zoom: ZoomSetting | null;
  scroll: ScrollMemory | null;
}

export const readerMemory: ReaderMemory = { opened: false, zoom: null, scroll: null };

/** The scroll position to restore in a pane whose layout is `layout` and scroll range `range`. */
export function restoredScrollTop(memory: ScrollMemory | null, layout: string, range: number): number {
  if (!memory || range <= 0) return 0;
  if (memory.layout === layout) return Math.min(memory.top, range);
  return memory.range > 0 ? Math.round((memory.top / memory.range) * range) : 0;
}
