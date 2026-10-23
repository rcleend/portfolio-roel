/**
 * Canvas helpers. Every canvas the engine creates goes through here so the
 * one setting that matters — no smoothing — can never be forgotten.
 */
export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

export function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', options);
  if (!ctx) throw new Error('Canvas 2D is not available in this environment');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Any drawable with known pixel dimensions. */
export type PixelImage = CanvasImageSource & { readonly width: number; readonly height: number };
