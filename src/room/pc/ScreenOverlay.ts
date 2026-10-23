import type { ScreenRect } from './PcMonitor';

/** The glass finish to lay over the live screen: the shared glass-layer canvas and the picture's part of it. */
export interface GlassFinish {
  readonly source: () => CanvasImageSource;
  /** The picture's rectangle in the source's pixels. */
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

const NO_RECT: ScreenRect = { left: 0, top: 0, width: 0, height: 0 };
/** Short enough to read as the tube "taking over", long enough to hide a sub-pixel colour step. */
const REVEAL_MS = 160;

/**
 * The live screen: one DOM element the room lays exactly over a display's picture while the
 * camera rests in front of it, so the app can show real, selectable, accessible content where
 * the WebGL still was. The element lives in an overlay container outside the canvas's
 * `role="application"`, so screen readers browse it as a document.
 *
 * ```
 * div[data-pc-screen][data-live]   positioned, clipped to the picture's rounded rectangle
 *   div                            the app's content slot (`room.pc.screen`)
 *   canvas                         the glass finish, the same pixels the still texture carries
 * ```
 */
export class ScreenOverlay {
  /** The positioned, clipped element. */
  readonly element: HTMLDivElement;
  /** The app's content slot. */
  readonly content: HTMLDivElement;
  private readonly finishCanvas: HTMLCanvasElement;
  private finish: GlassFinish | null = null;
  private finishDrawn = false;
  private rect: ScreenRect = NO_RECT;
  private isLive = false;
  private animation: Animation | null = null;
  private readonly liveListeners = new Set<(live: boolean) => void>();
  private readonly placementListeners = new Set<(placement: ScreenRect) => void>();

  constructor(
    container: HTMLElement,
    private readonly reducedMotion: MediaQueryList,
  ) {
    this.element = document.createElement('div');
    this.element.dataset.pcScreen = '';
    this.element.dataset.live = 'false';
    Object.assign(this.element.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '0',
      height: '0',
      overflow: 'hidden',
      // The screen's layout and paint never reach the page around it.
      contain: 'strict',
      visibility: 'hidden',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    this.content = document.createElement('div');
    Object.assign(this.content.style, { position: 'absolute', inset: '0' } satisfies Partial<CSSStyleDeclaration>);
    this.finishCanvas = document.createElement('canvas');
    this.finishCanvas.setAttribute('aria-hidden', 'true');
    Object.assign(this.finishCanvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    this.element.append(this.content, this.finishCanvas);
    container.append(this.element);
  }

  get live(): boolean {
    return this.isLive;
  }

  get placement(): ScreenRect {
    return this.rect;
  }

  onLiveChange(listener: (live: boolean) => void): () => void {
    this.liveListeners.add(listener);
    return () => this.liveListeners.delete(listener);
  }

  onPlacementChange(listener: (placement: ScreenRect) => void): () => void {
    this.placementListeners.add(listener);
    return () => this.placementListeners.delete(listener);
  }

  setFinish(finish: GlassFinish): void {
    this.finish = finish;
    this.finishDrawn = false;
  }

  /** Lays the element over the picture: `rect` in container CSS px, `radius` its rounded corners. */
  setPlacement(rect: ScreenRect, radius: number): void {
    const { style } = this.element;
    style.width = `${rect.width}px`;
    style.height = `${rect.height}px`;
    style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    style.borderRadius = `${radius}px`;
    if (sameRect(rect, this.rect)) return;
    this.rect = rect;
    for (const listener of this.placementListeners) listener(rect);
  }

  /** The camera has landed: show the screen, fading it in over the identical still. */
  reveal(): void {
    if (this.isLive) return;
    this.drawFinish();
    const { style } = this.element;
    style.visibility = 'visible';
    style.pointerEvents = 'auto';
    this.element.dataset.live = 'true';
    this.isLive = true;
    for (const listener of this.liveListeners) listener(true);
    // A listener may already have asked to leave again.
    if (!this.reducedMotion.matches && this.isLive) {
      this.animation = this.element.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: REVEAL_MS,
        easing: 'ease-out',
      });
    }
  }

  /** The camera is about to leave: hide the screen now, before the first flight frame draws. */
  conceal(): void {
    this.animation?.cancel();
    this.animation = null;
    const { style } = this.element;
    style.visibility = 'hidden';
    style.pointerEvents = 'none';
    this.element.dataset.live = 'false';
    if (!this.isLive) return;
    this.isLive = false;
    for (const listener of this.liveListeners) listener(false);
  }

  dispose(): void {
    this.animation?.cancel();
    this.liveListeners.clear();
    this.placementListeners.clear();
    this.element.remove();
  }

  /** The finish never changes for a display, so its canvas is drawn once, the first time it shows. */
  private drawFinish(): void {
    if (!this.finish || this.finishDrawn) return;
    const { rect, source } = this.finish;
    const canvas = this.finishCanvas;
    canvas.width = Math.max(1, Math.round(rect.width));
    canvas.height = Math.max(1, Math.round(rect.height));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(source(), rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
    this.finishDrawn = true;
  }
}

function sameRect(a: ScreenRect, b: ScreenRect): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
