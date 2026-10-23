import type { ScreenRect } from './PcMonitor';
import { NO_RECT, sameRect } from './screenPlacement';

/**
 * The glass finish to lay over the live screen: the canvas the still texture composites (covering
 * the whole glass) and where the picture lies in it, in its pixels.
 */
export interface GlassFinish {
  readonly canvas: () => HTMLCanvasElement;
  readonly picture: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

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
 *   canvas                         the glass finish: the very canvas the still texture composites,
 *                                  stretched over the whole glass and clipped to the picture
 * ```
 */
export class ScreenOverlay {
  /** The positioned, clipped element. */
  readonly element: HTMLDivElement;
  /** The app's content slot. */
  readonly content: HTMLDivElement;
  private finish: GlassFinish | null = null;
  private finishShown = false;
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
    // `contain: strict`: the screen's layout and paint never reach the page around it.
    this.element.style.cssText =
      'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;contain:strict;visibility:hidden;pointer-events:none';
    this.content = document.createElement('div');
    this.content.style.cssText = 'position:absolute;inset:0';
    this.element.append(this.content);
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
    this.showFinish();
    this.setLive(true);
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
    this.setLive(false);
  }

  dispose(): void {
    this.animation?.cancel();
    this.liveListeners.clear();
    this.placementListeners.clear();
    this.element.remove();
  }

  private setLive(live: boolean): void {
    const { style, dataset } = this.element;
    style.visibility = live ? 'visible' : 'hidden';
    style.pointerEvents = live ? 'auto' : 'none';
    dataset.live = String(live);
    if (live === this.isLive) return;
    this.isLive = live;
    for (const listener of this.liveListeners) listener(live);
  }

  /**
   * Lays the shared glass-finish canvas over the content the first time the screen shows: the
   * page then carries exactly the pixels the still texture does, at no extra memory. Percentages
   * keep it registered through every later placement.
   */
  private showFinish(): void {
    if (!this.finish || this.finishShown) return;
    const { canvas, picture } = this.finish;
    const layer = canvas();
    const percent = (value: number, of: number): string => `${(value / of) * 100}%`;
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = `position:absolute;pointer-events:none;left:${percent(-picture.x, picture.width)};top:${percent(-picture.y, picture.height)};width:${percent(layer.width, picture.width)};height:${percent(layer.height, picture.height)}`;
    this.element.append(layer);
    this.finishShown = true;
  }
}
