import { context2d, createCanvas } from '@/engine/gfx/canvas';
import { Bitmap } from './Bitmap';
import type { Mask } from './Mask';

/** Uploads a painted bitmap into a canvas that `gfx.image` can draw. */
export function bitmapToCanvas(bitmap: Bitmap): HTMLCanvasElement {
  const canvas = createCanvas(bitmap.width, bitmap.height);
  const ctx = context2d(canvas);
  const image = ctx.createImageData(bitmap.width, bitmap.height);
  image.data.set(bitmap.data);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** A mask as a single-colour cut-out on a transparent canvas. */
export function maskToCanvas(mask: Mask, color: string): HTMLCanvasElement {
  const bitmap = new Bitmap(mask.width, mask.height);
  bitmap.fill(mask, color);
  return bitmapToCanvas(bitmap);
}
