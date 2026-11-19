import { onCanvasRestored } from '@/engine/gfx/canvas';
import { paintWallpaperRows } from './wallpaperPicture';

/**
 * The desktop wallpaper: a green hill under a blue sky with fair-weather clouds, drawn by code
 * (`wallpaperPicture.ts`); nothing is downloaded.
 *
 * It is painted into a cached canvas that serves every texture repaint and is
 * appended, as the very same element, behind the live DOM desktop: one
 * bitmap, so the glass and the live screen match by construction. The picture
 * is worked out a few rows at a time (`paintWallpaperUnit`), by the room ahead
 * of the still's first paint and in the page's idle moments otherwise; until
 * its last row is done the canvas holds its sky and its hill as two flat
 * bands, then it is repainted in place and `onWallpaperPainted` says so, so
 * the room can repaint the glass.
 */

/** Ample for a picture at most ~1100 px wide. */
const MAX_PIXELS = 1_000_000;
const LOW_MEMORY_MAX_PIXELS = 600_000;
/** Below this growth an upscaled wallpaper is indistinguishable; repainting would only cost time. */
const REPAINT_GROWTH = 1.3;
/** Pixels worked out per unit: under 1 ms on a laptop, 4-5 ms on a phone six times slower. */
const UNIT_PIXELS = 16_000;
/** The idle time a unit wants left before it starts, and the longest the picture waits for such a moment. */
const IDLE_ROOM_MS = 8;
const IDLE_TIMEOUT_MS = 1000;
/** Without `requestIdleCallback` (Safari), a unit a frame. */
const FALLBACK_DELAY_MS = 16;

/** The picture's average sky and grass, for the moments before it has been worked out. */
export const WALLPAPER_PLACEHOLDER = { sky: '#4f8fe0', grass: '#3f8a22', horizon: 0.56 } as const;

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

let cached: HTMLCanvasElement | null = null;
let cpuCanvas = false;
/** The finished picture on the canvas, kept to paint it again after a GPU reset. */
let picture: ImageData | null = null;
/** The picture being worked out, and its next row. */
let job: { readonly image: ImageData; row: number } | null = null;
let driving = false;
const paintedListeners = new Set<() => void>();

/**
 * The shared wallpaper canvas, at least close to `requiredWidth` px wide.
 * Growing works the larger picture out behind the one shown and repaints the
 * same element in place, so a DOM desktop already showing it picks up the
 * sharper bitmap without a swap. The first call decides whether it is a CPU
 * canvas (`cpu`, see StillRequest.cpuCanvas).
 */
export function wallpaperCanvas(requiredWidth: number, aspect: number, cpu = false): HTMLCanvasElement {
  const wanted = wallpaperSize(requiredWidth, aspect, deviceMemory());
  if (cached && !needsRepaint(job?.image.width ?? cached.width, wanted)) return cached;
  let canvas = cached;
  if (!canvas) {
    canvas = cached = document.createElement('canvas');
    cpuCanvas = cpu;
    canvas.width = wanted.width;
    canvas.height = wanted.height;
    show(canvas);
    // A GPU reset gives the canvas back blank: the live desktop shows it, and the glass is composed from it.
    onCanvasRestored(canvas, () => {
      show(canvas as HTMLCanvasElement);
      for (const listener of paintedListeners) listener();
    });
  }
  const image = contextOf(canvas)?.createImageData(wanted.width, wanted.height);
  if (image) {
    job = { image, row: 0 };
    drive();
  }
  return canvas;
}

/**
 * Works out the next few rows of the picture (a unit of about a millisecond on a laptop), or puts the finished one
 * on the canvas. False once there is nothing left to do.
 */
export function paintWallpaperUnit(): boolean {
  if (!job || !cached) return false;
  const { image } = job;
  if (job.row < image.height) {
    const rows = Math.max(1, Math.round(UNIT_PIXELS / image.width));
    paintWallpaperRows(image.data, image.width, image.height, job.row, job.row + rows);
    job.row += rows;
    return true;
  }
  job = null;
  picture = image;
  if (cached.width !== image.width || cached.height !== image.height) {
    cached.width = image.width;
    cached.height = image.height;
  }
  show(cached);
  for (const listener of paintedListeners) listener();
  return false;
}

/**
 * Calls `listener` each time the finished picture has been put on the canvas: when it has first been worked out,
 * after it has grown, and after a GPU reset wiped it. The glass wants a repaint. Returns a function that stops
 * listening.
 */
export function onWallpaperPainted(listener: () => void): () => void {
  paintedListeners.add(listener);
  return () => paintedListeners.delete(listener);
}

/** Works the picture out in the page's idle moments, whoever else does or does not. */
function drive(): void {
  if (driving) return;
  driving = true;
  if (typeof requestIdleCallback === 'function') {
    // Only in an idle period that holds a unit on a slow phone, so none runs into a frame of a flight or of the
    // game; one a second at the least.
    const idle = (deadline: IdleDeadline): void => {
      let more = job !== null;
      if (more && deadline.didTimeout) more = paintWallpaperUnit();
      while (more && deadline.timeRemaining() > IDLE_ROOM_MS) more = paintWallpaperUnit();
      if (more) requestIdleCallback(idle, { timeout: IDLE_TIMEOUT_MS });
      else driving = false;
    };
    requestIdleCallback(idle, { timeout: IDLE_TIMEOUT_MS });
  } else {
    const tick = (): void => {
      if (paintWallpaperUnit()) setTimeout(tick, FALLBACK_DELAY_MS);
      else driving = false;
    };
    setTimeout(tick, FALLBACK_DELAY_MS);
  }
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  return canvas.getContext('2d', { willReadFrequently: cpuCanvas });
}

/** Puts on the canvas what there is to show: the finished picture, or the placeholder. */
function show(canvas: HTMLCanvasElement): void {
  const context = contextOf(canvas);
  if (!context) return;
  if (picture) context.putImageData(picture, 0, 0);
  else paintPlaceholder(context, canvas.width, canvas.height);
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
