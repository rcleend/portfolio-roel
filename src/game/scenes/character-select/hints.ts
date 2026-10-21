import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';

const COLORS = { key: '#a99cf0', label: '#6a6f8f' } as const;

/**
 * The control legend along the bottom: tiny drawn triangles stand in for the
 * d-pad, because the label face has no arrow glyphs and key names would be
 * wrong for half the players (keyboard vs pad).
 */
export function drawHints(gfx: Gfx, x: number, y: number, style: TextStyle): void {
  const label = { ...style, fill: COLORS.label };
  let pen = drawPair(gfx, x, y, 'horizontal') + 4;
  pen += gfx.text('CHANGE', pen, y, label).width + 12;
  pen = drawPair(gfx, pen, y, 'vertical') + 4;
  gfx.text('SKILLS', pen, y, label);
}

/** Two 4 px triangles pointing apart; returns the pen position after them. */
function drawPair(gfx: Gfx, x: number, y: number, axis: 'horizontal' | 'vertical'): number {
  const color = COLORS.key;
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
