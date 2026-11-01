import { createCanvas, paintCanvas } from '@/engine/gfx/canvas';
import { Bitmap } from './Bitmap';
import type { Mask } from './Mask';

/**
 * Uploads a painted bitmap into a canvas that `gfx.image` can draw. The canvas is painted again whenever it comes back
 * blank from a GPU reset (see `paintCanvas`): `paint` runs again then rather than the bitmap being kept, so pass a
 * function that paints it afresh; `finish` draws over the bitmap each time.
 */
export function bitmapToCanvas(
  paint: () => Bitmap,
  finish?: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement {
  let first: Bitmap | null = paint();
  const canvas = createCanvas(first.width, first.height);
  paintCanvas(canvas, (ctx) => {
    const bitmap = first ?? paint();
    first = null;
    const image = ctx.createImageData(bitmap.width, bitmap.height);
    image.data.set(bitmap.data);
    ctx.putImageData(image, 0, 0);
    finish?.(ctx);
  });
  return canvas;
}

/** A mask as a single-colour cut-out on a transparent canvas. */
export function maskToCanvas(mask: Mask, color: string): HTMLCanvasElement {
  return bitmapToCanvas(() => {
    const bitmap = new Bitmap(mask.width, mask.height);
    bitmap.fill(mask, color);
    return bitmap;
  });
}
