/**
 * The maximised reader window's chrome, in layout px (docs/PC.md › The
 * reader). The CSS uses the same numbers; they are named here because the
 * default zoom depends on the document pane they leave over.
 */
export const TITLE_BAR_HEIGHT = 26;
export const MENU_BAR_HEIGHT = 20;
export const TOOLBAR_HEIGHT = 32;
export const STATUS_BAR_HEIGHT = 22;
/** The navigation strip down the pane's left edge, plus its 1 px divider. */
export const NAVIGATION_STRIP_WIDTH = 22;
const NAVIGATION_STRIP_BORDER = 1;

/** The document pane's client width (inside its always-shown scrollbar) for a maximised window. */
export function paneClientWidth(windowWidth: number, scrollbarWidth: number): number {
  return windowWidth - NAVIGATION_STRIP_WIDTH - NAVIGATION_STRIP_BORDER - scrollbarWidth;
}
