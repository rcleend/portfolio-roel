import type { Gfx } from '@/engine/gfx/Gfx';
import { drawNineSlice } from '@/engine/gfx/NineSlice';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { Rect } from '@/engine/math/Rect';
import { WINDOW_BORDER, type WindowTheme, windowSlice } from './theme';

export interface WindowOptions {
  /** Optional caption on a tab that sits on the top edge. */
  readonly title?: string;
  readonly titleStyle?: TextStyle;
}

/** Inner area available for content, inside the bevelled border plus one pixel of breathing room. */
export function windowContent(frame: Rect): Rect {
  const inset = WINDOW_BORDER + 1;
  return { x: frame.x + inset, y: frame.y + inset, w: frame.w - inset * 2, h: frame.h - inset * 2 };
}

/** Draws a bevelled window: banded fill, nine-slice frame, optional title tab. */
export function drawWindow(gfx: Gfx, frame: Rect, theme: WindowTheme, options: WindowOptions = {}): void {
  const { x, y, w, h } = frame;
  if (w < WINDOW_BORDER * 2 || h < WINDOW_BORDER * 2) return;
  gfx.fillRect(x + 2, y + 2, w - 4, h - 4, theme.fill);
  drawNineSlice(gfx, windowSlice(theme), x, y, w, h);
  if (options.title && options.titleStyle) {
    const label = gfx.measureText(options.title, options.titleStyle);
    const tabW = label.width + 10;
    const tabH = label.height + 6;
    const tabX = x + 8;
    const tabY = y - Math.floor(tabH / 2);
    gfx.fillRect(tabX + 1, tabY + 1, tabW - 2, tabH - 2, theme.dark);
    gfx.rect(tabX, tabY, tabW, tabH, theme.outline);
    gfx.fillRect(tabX + 1, tabY + 1, tabW - 2, 1, theme.mid);
    gfx.text(options.title, tabX + 5, tabY + 3, options.titleStyle);
  }
}
