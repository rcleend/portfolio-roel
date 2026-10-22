import type { Rgba } from '@/engine/gfx/color';
import { Bitmap } from '../../../../art/logos/raster/Bitmap';
import { polygon, type Shape } from '../../../../art/logos/raster/shape';
import { SILHOUETTE } from './colors';
import { STAGE } from './layout';

/** The launch complex's box on screen; the pad art covers exactly this. */
export const PAD_BOX = { x: STAGE.pad.x - 34, y: 180, width: 68, height: 31 } as const;

/**
 * The service tower beside the rocket. Its crane tops out a few rows under
 * "PRESS ANY BUTTON", so the lattice never sits behind the prompt.
 */
const TOWER = { left: STAGE.pad.x + 7, right: STAGE.pad.x + 12, top: 184, craneTop: 182 } as const;
const DECK = { top: STAGE.pad.y, bottom: STAGE.pad.y + 6, halfTop: 21, halfBottom: 27 } as const;
/** Lightning masts either side of the pad, and the row their tips reach. */
const MASTS = [STAGE.pad.x - 19, STAGE.pad.x + 22] as const;
const MAST_TOP = 186;

/**
 * The pad's static parts, near silhouettes like the rest of the
 * foreground: the deck with the flame trench's two mouths, the lattice
 * service tower with its crane, two lightning masts and the floodlights
 * that keep the deck's edge lit.
 */
export function paintLaunchPad(): Bitmap {
  const bitmap = new Bitmap(PAD_BOX.width, PAD_BOX.height);
  const plot = (x: number, y: number, color: Rgba): void => bitmap.set(x - PAD_BOX.x, y - PAD_BOX.y, color);
  const block = (x: number, y: number, w: number, h: number, color: Rgba): void => {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) plot(x + dx, y + dy, color);
  };
  const { near, nearRim, window } = SILHOUETTE;

  fillShape(bitmap, deck(), near);
  block(STAGE.pad.x - DECK.halfTop, DECK.top, DECK.halfTop * 2 + 1, 1, nearRim);
  // The flame trench's mouths, where the exhaust comes boiling out.
  block(STAGE.pad.x - DECK.halfTop - 5, DECK.top + 2, 5, 4, SILHOUETTE.mouth);
  block(STAGE.pad.x + DECK.halfTop + 1, DECK.top + 2, 5, 4, SILHOUETTE.mouth);

  const { left, right, top, craneTop } = TOWER;
  for (let y = top; y < DECK.top; y++) {
    plot(left, y, near);
    plot(right, y, nearRim);
    const rung = (y - top) % 4;
    if (rung === 0) for (let x = left; x <= right; x++) plot(x, y, near);
    else {
      // Cross-bracing: an X between every pair of platforms.
      plot(left + rung, y, near);
      plot(right - rung, y, near);
    }
  }
  // The crane on top: a jib reaching out over the far side, its brace, and the hook line.
  block(left - 1, craneTop, right - left + 8, 1, near);
  plot(right - 1, craneTop + 1, near);
  block(right + 5, craneTop + 1, 1, 5, near);

  for (const x of MASTS) {
    block(x, MAST_TOP + 1, 1, DECK.top - MAST_TOP - 1, near);
    plot(x, MAST_TOP, nearRim);
  }
  plot(STAGE.pad.x - 12, DECK.top - 1, window);
  plot(STAGE.pad.x + 15, DECK.top - 1, window);
  return bitmap;
}

function deck(): Shape {
  const { x } = STAGE.pad;
  return polygon([
    [x - DECK.halfTop, DECK.top],
    [x + DECK.halfTop + 1, DECK.top],
    [x + DECK.halfBottom + 1, DECK.bottom + 1],
    [x - DECK.halfBottom, DECK.bottom + 1],
  ]);
}

function fillShape(bitmap: Bitmap, shape: Shape, color: Rgba): void {
  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (shape(x + PAD_BOX.x + 0.5, y + PAD_BOX.y + 0.5)) bitmap.set(x, y, color);
    }
  }
}
