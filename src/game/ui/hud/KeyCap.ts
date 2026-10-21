import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import type { KeyCapLabel } from './keyLabels';

const HEIGHT = 11;
const COLORS = { outline: '#0b0a1f', face: '#e4dcff', light: '#ffffff', side: '#8a80c0', ink: '#14123a' } as const;

/** Width of the key cap `drawKeyCap` would draw. */
export function keyCapWidth(gfx: Gfx, label: KeyCapLabel, style: TextStyle): number {
  return 'arrow' in label ? HEIGHT : Math.max(HEIGHT, gfx.measureText(label.text, style).width + 6);
}

/**
 * A little raised keyboard key with its legend, for control hints: light
 * face, darker bottom edge, one-pixel outline. Returns the width drawn.
 */
export function drawKeyCap(gfx: Gfx, x: number, y: number, label: KeyCapLabel, style: TextStyle): number {
  const width = keyCapWidth(gfx, label, style);
  gfx.fillRect(x + 1, y, width - 2, HEIGHT, COLORS.outline);
  gfx.fillRect(x, y + 1, width, HEIGHT - 2, COLORS.outline);
  gfx.fillRect(x + 1, y + 1, width - 2, HEIGHT - 2, COLORS.side);
  gfx.fillRect(x + 1, y + 1, width - 2, HEIGHT - 4, COLORS.face);
  gfx.fillRect(x + 2, y + 1, width - 4, 1, COLORS.light);
  if ('arrow' in label) {
    drawArrow(gfx, x + Math.floor(width / 2), y + 4, label.arrow);
  } else {
    gfx.text(
      label.text,
      x + Math.floor(width / 2),
      y + 2,
      { ...style, fill: COLORS.ink, outline: undefined, shadow: undefined },
      {
        align: 'center',
      },
    );
  }
  return width;
}

/** A 5-pixel solid arrow head centred on (cx, cy + 1). */
function drawArrow(gfx: Gfx, cx: number, cy: number, direction: 'left' | 'right' | 'up' | 'down'): void {
  for (let i = 0; i < 3; i++) {
    const length = 1 + i * 2;
    switch (direction) {
      case 'left':
        gfx.fillRect(cx - 1 + i, cy + 1 - i, 1, length, COLORS.ink);
        break;
      case 'right':
        gfx.fillRect(cx + 1 - i, cy + 1 - i, 1, length, COLORS.ink);
        break;
      case 'up':
        gfx.fillRect(cx - i, cy + i, length, 1, COLORS.ink);
        break;
      case 'down':
        gfx.fillRect(cx - i, cy + 2 - i, length, 1, COLORS.ink);
        break;
    }
  }
}
