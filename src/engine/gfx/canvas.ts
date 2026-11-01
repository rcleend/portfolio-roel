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

type Paint = (ctx: CanvasRenderingContext2D) => void;

/** Every canvas painted through `paintCanvas`, oldest first; weakly, so a scene's caches go with the scene. */
let painted: WeakRef<HTMLCanvasElement>[] = [];
const paints = new WeakMap<
  HTMLCanvasElement,
  { readonly paint: Paint; readonly options?: CanvasRenderingContext2DSettings }
>();
/** Painted canvases given back blank since the last repaint. */
const restored = new WeakSet<HTMLCanvasElement>();
const repaintListeners = new Set<() => void>();
let repaintQueued = false;
let repaintRunning = false;
/** `painted` drops the refs of collected canvases whenever it reaches this length. */
let compactAt = 256;

/**
 * Paints `canvas` once, now, and again whenever it comes back from a lost context: a GPU process reset (a laptop
 * waking from sleep, a display change, a driver reset) wipes every 2D canvas on the page, CPU ones included, and hands
 * each back blank, so a cache drawn once would draw nothing from then on. Every canvas the engine or the game draws
 * once and reads from later (atlases, glyph strips, pre-rendered art) is painted through here.
 *
 * `paint` gets a fresh context (smoothing off) on a blank canvas each time and must draw the whole picture. It is kept
 * as long as the canvas lives, so it should rebuild what it draws from rather than hold a copy of the pixels.
 */
export function paintCanvas(canvas: HTMLCanvasElement, paint: Paint, options?: CanvasRenderingContext2DSettings): void {
  paint(context2d(canvas, options));
  // Registered after the paint, so a cache it created along the way (a glyph atlas) repaints before it.
  painted.push(new WeakRef(canvas));
  if (painted.length >= compactAt && !repaintRunning) {
    painted = painted.filter((ref) => ref.deref() !== undefined);
    compactAt = Math.max(256, painted.length * 2);
  }
  paints.set(canvas, options ? { paint, options } : { paint });
  canvas.addEventListener('contextrestored', onRestored);
}

/**
 * Calls `listener` after canvases painted through `paintCanvas` have been painted again after a lost context: a
 * picture drawn from them (the game's frame) is due again. Returns a function that stops listening.
 */
export function onCanvasesRepainted(listener: () => void): () => void {
  repaintListeners.add(listener);
  return () => repaintListeners.delete(listener);
}

/** Calls `listener` whenever `canvas` comes back blank from a lost context (see `paintCanvas`); returns a stop. */
export function onCanvasRestored(canvas: HTMLCanvasElement, listener: () => void): () => void {
  canvas.addEventListener('contextrestored', listener);
  return () => canvas.removeEventListener('contextrestored', listener);
}

function onRestored(event: Event): void {
  restored.add(event.target as HTMLCanvasElement);
  if (repaintQueued) return;
  repaintQueued = true;
  setTimeout(repaintRestored, 0);
}

/**
 * Restored canvases repaint in the order they were first painted, and every canvas painted after the first of them
 * repaints too: a cache that draws from another (a flag's lettering from the font's atlas) may have been restored, or
 * painted, before the one it draws from. A canvas whose context is still lost waits for its own restore, which queues
 * another pass from there on.
 */
function repaintRestored(): void {
  repaintQueued = false;
  repaintRunning = true;
  const snapshot = painted;
  const live: WeakRef<HTMLCanvasElement>[] = [];
  let repainting = false;
  for (const ref of snapshot) {
    const canvas = ref.deref();
    const entry = canvas && paints.get(canvas);
    if (!canvas || !entry) continue;
    live.push(ref);
    if (restored.has(canvas)) repainting = true;
    if (!repainting || canvas.getContext('2d', entry.options)?.isContextLost?.()) continue;
    restored.delete(canvas);
    // Clears the canvas and resets its context's state, which a canvas that was never lost still holds from its paint.
    const { width } = canvas;
    canvas.width = width;
    try {
      entry.paint(context2d(canvas, entry.options));
    } catch (error) {
      console.warn('A canvas could not be painted again after a lost context', error);
    }
  }
  // Canvases first painted during the pass (a cache made on first use) were pushed after the snapshot.
  painted = [...live, ...painted.slice(snapshot.length)];
  repaintRunning = false;
  if (repainting) for (const listener of repaintListeners) listener();
}
