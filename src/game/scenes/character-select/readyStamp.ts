import type { Gfx } from '@/engine/gfx/Gfx';
import type { TextStyle } from '@/engine/gfx/TextStyle';
import { CARD } from './layout';

const HEIGHT = 21;
const CENTER_Y = CARD.y + 58;
const OVERHANG = 6;

const BAND = { stops: ['#ff6a3d', '#d8301e', '#8f1410'], bands: 3 } as const;
const COLORS = { outline: '#1a0804', trim: '#ffc83d' } as const;

/**
 * The "READY!" banner slammed across the card once a character is chosen.
 * `opening` is the banner's height as a fraction of its final height (see
 * `stampOpening`): it snaps open from a line, overshoots, then settles, and
 * the lettering appears once it is (nearly) fully open.
 */
export function drawReadyStamp(gfx: Gfx, opening: number, style: TextStyle): void {
  const h = Math.max(1, Math.round(HEIGHT * opening));
  const x = CARD.x - OVERHANG;
  const w = CARD.w + OVERHANG * 2;
  const y = CENTER_Y - Math.floor(h / 2);
  gfx.fillRect(x, y + 2, w, h, COLORS.outline);
  gfx.fillRect(x, y, w, h, COLORS.outline);
  if (h > 4) {
    gfx.fillRect(x + 1, y + 1, w - 2, h - 2, BAND);
    gfx.fillRect(x + 1, y + 2, w - 2, 1, COLORS.trim);
    gfx.fillRect(x + 1, y + h - 3, w - 2, 1, COLORS.trim);
  }
  if (opening >= 1) gfx.text('READY!', CARD.x + CARD.w / 2, CENTER_Y - 6, style, { align: 'center' });
}
