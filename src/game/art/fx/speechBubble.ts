import type { Gfx } from '@/engine/gfx/Gfx';

export interface BubbleColors {
  readonly outline: string;
  readonly fill: string;
  /** A one-pixel band along the inside bottom, for a little volume. */
  readonly shade: string;
}

export const COMPLAINT_BUBBLE: BubbleColors = { outline: '#0b0a1f', fill: '#ffffff', shade: '#d9d0ff' };

/** Tail height below the bubble body, in px. */
export const BUBBLE_TAIL = 4;

/**
 * A comic speech bubble at native resolution: a pixel-rounded box with a
 * one-pixel outline and a stepped tail under the bottom corner on `tail`'s
 * side, pointing back at whoever spoke. (x, y, w, h) is the body; the tail
 * hangs below it.
 */
export function drawSpeechBubble(
  gfx: Gfx,
  x: number,
  y: number,
  w: number,
  h: number,
  tail: 'left' | 'right',
  colors: BubbleColors = COMPLAINT_BUBBLE,
): void {
  const [left, top, width, height] = [Math.round(x), Math.round(y), Math.round(w), Math.round(h)];
  if (width < 6 || height < 6) return;
  const right = left + width - 1;
  const bottom = top + height - 1;

  gfx.fillRect(left + 1, top + 1, width - 2, height - 2, colors.fill);
  gfx.fillRect(left + 2, bottom - 1, width - 4, 1, colors.shade);
  gfx.fillRect(left + 2, top, width - 4, 1, colors.outline);
  gfx.fillRect(left + 2, bottom, width - 4, 1, colors.outline);
  gfx.fillRect(left, top + 2, 1, height - 4, colors.outline);
  gfx.fillRect(right, top + 2, 1, height - 4, colors.outline);
  for (const [cx, cy] of [
    [left + 1, top + 1],
    [right - 1, top + 1],
    [left + 1, bottom - 1],
    [right - 1, bottom - 1],
  ] as const) {
    gfx.pixel(cx, cy, colors.outline);
  }

  // Stepped tail: each row one pixel narrower, slanting back towards the speaker.
  const anchor = tail === 'left' ? left + 4 : right - 4;
  const toward = tail === 'left' ? -1 : 1;
  for (let row = 0; row <= BUBBLE_TAIL; row++) {
    const span = BUBBLE_TAIL - row;
    const near = anchor;
    const far = anchor - toward * span;
    const [from, to] = near < far ? [near, far] : [far, near];
    const yRow = bottom + row;
    if (span > 0) gfx.fillRect(from + 1, yRow, to - from - 1, 1, row === 0 ? colors.shade : colors.fill);
    gfx.pixel(from, yRow, colors.outline);
    gfx.pixel(to, yRow, colors.outline);
  }
}
