import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { HINT_COLORS, legendGlyphTop } from '../../ui/KeyHints';

/**
 * The d-pad half of the control legend along the bottom: tiny drawn triangles
 * stand in for the d-pad, because the label face has no arrow glyphs and key
 * names would be wrong for half the players (keyboard vs pad). The CONFIRM
 * and BACK keys that close the legend are the shared `KeyHints`.
 */
export function drawHints(gfx: Gfx, x: number, y: number, style: TextStyle): void {
  const label = { ...style, fill: HINT_COLORS.label };
  let pen = drawPair(gfx, x, legendGlyphTop(y, style, 7), 'horizontal') + 4;
  pen += gfx.text('CHANGE', pen, y, label).width + 12;
  pen = drawPair(gfx, pen, legendGlyphTop(y, style, 8), 'vertical') + 4;
  gfx.text('SKILLS', pen, y, label);
}

/** Two 4 px triangles pointing apart, from row `y` down (7 rows side by side, 8 stacked); returns the pen after them. */
function drawPair(gfx: Gfx, x: number, y: number, axis: 'horizontal' | 'vertical'): number {
  const color = HINT_COLORS.key;
  if (axis === 'horizontal') {
    for (let i = 0; i < 4; i++) {
      gfx.fillRect(x + i, y + 3 - i, 1, i * 2 + 1, color);
      gfx.fillRect(x + 11 - i, y + 3 - i, 1, i * 2 + 1, color);
    }
    return x + 12;
  }
  for (let i = 0; i < 4; i++) {
    gfx.fillRect(x + 3 - i, y + i, i * 2 + 1, 1, color);
    gfx.fillRect(x + 11 - i, y + 7 - i, i * 2 + 1, 1, color);
  }
  return x + 15;
}
