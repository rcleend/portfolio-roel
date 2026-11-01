import { onCanvasRestored } from '@/engine/gfx/canvas';
import blissUrl from './bliss.webp';

/**
 * The desktop wallpaper: Windows XP's "Bliss" (Charles O'Rear's photograph),
 * a 1280 px webp of the original scan, drawn to cover the screen.
 *
 * It is painted into a cached canvas that serves every texture repaint and is
 * appended, as the very same element, behind the live DOM desktop: one
 * bitmap, so the glass and the live screen match by construction. Until the
 * photograph has downloaded the canvas holds its sky and its hill as two
 * flat bands; once it has decoded, the same canvas is repainted in place and
 * `loadWallpaper` resolves, so the room can repaint the glass.
 */

/** Ample for a picture at most ~1100 px wide; the photograph itself is 1280 px. */
const MAX_PIXELS = 1_000_000;
const LOW_MEMORY_MAX_PIXELS = 600_000;
/** Below this growth an upscaled wallpaper is indistinguishable; repainting would only cost time. */
const REPAINT_GROWTH = 1.3;

/** The photograph's average sky and grass, for the moments before it has decoded. */
export const WALLPAPER_PLACEHOLDER = { sky: '#3d78d8', grass: '#4f9b2a', horizon: 0.58 } as const;

export interface WallpaperSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The wallpaper's bitmap for a request `requiredWidth` px wide at the
 * picture's aspect (width / height), capped in pixels — harder on devices
 * reporting 2 GB of memory or less.
 */
export function wallpaperSize(requiredWidth: number, aspect: number, deviceMemory: number | undefined): WallpaperSize {
  const maxPixels = deviceMemory !== undefined && deviceMemory <= 2 ? LOW_MEMORY_MAX_PIXELS : MAX_PIXELS;
  const width = Math.max(1, Math.floor(Math.min(requiredWidth, Math.sqrt(maxPixels * aspect))));
  return { width, height: Math.max(1, Math.round(width / aspect)) };
}

/** Whether a wallpaper `currentWidth` px wide must be repainted to serve `wanted`. */
export function needsRepaint(currentWidth: number, wanted: WallpaperSize): boolean {
  return wanted.width > currentWidth * REPAINT_GROWTH;
}

/** The part of a `source`-sized image that covers `target` at its aspect, centred (CSS `object-fit: cover`). */
export function coverCrop(
  source: WallpaperSize,
  target: WallpaperSize,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const w = target.width / scale;
  const h = target.height / scale;
  return { x: (source.width - w) / 2, y: (source.height - h) / 2, w, h };
}

let cached: HTMLCanvasElement | null = null;
let cpuCanvas = false;
let photo: HTMLImageElement | null = null;
let loading: Promise<void> | null = null;
const restoredListeners = new Set<() => void>();

/**
 * The shared wallpaper canvas, at least close to `requiredWidth` px wide.
 * Growing repaints the same element in place, so a DOM desktop already
 * showing it picks up the sharper bitmap without a swap. The first call
 * decides whether it is a CPU canvas (`cpu`, see StillRequest.cpuCanvas).
 */
export function wallpaperCanvas(requiredWidth: number, aspect: number, cpu = false): HTMLCanvasElement {
  const wanted = wallpaperSize(requiredWidth, aspect, deviceMemory());
  if (cached && !needsRepaint(cached.width, wanted)) return cached;
  const canvas = cached ?? document.createElement('canvas');
  if (!cached) {
    cpuCanvas = cpu;
    // A GPU reset gives the canvas back blank: the live desktop shows it, and the glass is composed from it.
    onCanvasRestored(canvas, () => {
      paint(canvas);
      for (const listener of restoredListeners) listener();
    });
  }
  canvas.width = wanted.width;
  canvas.height = wanted.height;
  cached = canvas;
  paint(canvas);
  return canvas;
}

/**
 * Downloads and decodes the photograph once per page load, then repaints the
 * shared canvas with it. A failed load resolves too: the placeholder stays.
 */
export function loadWallpaper(): Promise<void> {
  loading ??= new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = blissUrl;
    // Decoded off the main thread where the browser can; a browser without `decode` takes the placeholder.
    Promise.resolve()
      .then(() => image.decode())
      .then(
        () => {
          photo = image;
          if (cached) paint(cached);
          resolve();
        },
        () => resolve(),
      );
  });
  return loading;
}

/**
 * Calls `listener` each time the wallpaper has been painted again after a GPU reset wiped it: the glass wants a
 * repaint. Returns a function that stops listening.
 */
export function onWallpaperRestored(listener: () => void): () => void {
  restoredListeners.add(listener);
  return () => restoredListeners.delete(listener);
}

function paint(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d', { willReadFrequently: cpuCanvas });
  if (!context) return;
  if (photo) paintPhoto(context, photo, canvas.width, canvas.height);
  else paintPlaceholder(context, canvas.width, canvas.height);
}

function paintPhoto(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const crop = coverCrop({ width: image.naturalWidth, height: image.naturalHeight }, { width, height });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
}

/** Paints the placeholder into `width` × `height` px of `context`: the sky over the hill. */
export function paintPlaceholder(context: CanvasRenderingContext2D, width: number, height: number): void {
  const horizon = Math.round(WALLPAPER_PLACEHOLDER.horizon * height);
  context.fillStyle = WALLPAPER_PLACEHOLDER.sky;
  context.fillRect(0, 0, width, horizon);
  context.fillStyle = WALLPAPER_PLACEHOLDER.grass;
  context.fillRect(0, horizon, width, height - horizon);
}

function deviceMemory(): number | undefined {
  return (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;
}
