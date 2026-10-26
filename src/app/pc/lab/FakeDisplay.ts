import type { PcDisplay, RgbColor, ScreenRect, StillPainter } from '../display';

/** Everything the screen asked of the monitor (and the lab did to it), in order, for end-to-end checks. */
export interface LabEvent {
  readonly type: 'setLight' | 'invalidateStill' | 'paint' | 'reveal' | 'conceal' | 'leave' | 'focusStage';
  /** `performance.now()` when it happened. */
  readonly at: number;
  /** The colour asked for, on `setLight` only. */
  readonly color?: RgbColor | null;
}

export interface FakeDisplayOptions {
  /** Covers the viewport; the live screen goes in it (the room's overlay container). */
  readonly overlay: HTMLElement;
  /** Under the screen at the same rectangle: what the glass shows while the screen is not live. */
  readonly still: HTMLCanvasElement;
  /** The picture's size in CSS px; null: a 5:4 picture at 61 % of the viewport's width. */
  readonly size: { readonly width: number; readonly height: number } | null;
  /** The still's texture width in px; null: the room's rule (512, 768 or 1024 by the picture's size). */
  readonly tier: number | null;
}

/** The room's 160 ms cross-fade at the landing frame. */
const REVEAL_MS = 160;
/** The room's tube corner radius at the PC pose, about 6 mm of glass. */
const CORNER_RADIUS = 6;

/**
 * A stand-in for the room's monitor (`room.pc`), for developing the screen
 * without three.js: it places the screen element like the room does, keeps
 * it hidden unless live, cross-fades it in on reveal and paints the still
 * with the screen's own painter into a canvas under it at texture resolution.
 */
export class FakeDisplay implements PcDisplay {
  readonly screen: HTMLElement;
  readonly element: HTMLElement;
  readonly events: LabEvent[] = [];
  readonly #still: HTMLCanvasElement;
  readonly #size: FakeDisplayOptions['size'];
  readonly #tier: number | null;
  #placement: ScreenRect;
  #live = false;
  #painter: StillPainter | null = null;
  #stale = false;
  readonly #placementListeners = new Set<(placement: ScreenRect) => void>();
  readonly #liveListeners = new Set<(live: boolean) => void>();

  constructor({ overlay, still, size, tier }: FakeDisplayOptions) {
    this.#still = still;
    this.#size = size;
    this.#tier = tier;
    this.element = document.createElement('div');
    this.element.dataset.pcScreen = '';
    this.element.dataset.live = 'false';
    this.screen = document.createElement('div');
    this.screen.className = 'lab-screen__slot';
    this.element.append(this.screen);
    overlay.append(this.element);
    this.#placement = this.#measure();
    this.#apply();
    window.addEventListener('resize', () => {
      this.#placement = this.#measure();
      this.#apply();
      this.paint();
      for (const listener of this.#placementListeners) listener(this.#placement);
    });
  }

  get placement(): ScreenRect {
    return this.#placement;
  }

  get live(): boolean {
    return this.#live;
  }

  onPlacementChange(listener: (placement: ScreenRect) => void): () => void {
    this.#placementListeners.add(listener);
    return () => this.#placementListeners.delete(listener);
  }

  onLiveChange(listener: (live: boolean) => void): () => void {
    this.#liveListeners.add(listener);
    return () => this.#liveListeners.delete(listener);
  }

  setStill(painter: StillPainter | null): void {
    this.#painter = painter;
    this.paint();
  }

  invalidateStill(): void {
    this.#stale = true;
    this.log({ type: 'invalidateStill' });
  }

  setLight(color: RgbColor | null): void {
    this.log({ type: 'setLight', color });
  }

  get painted(): boolean {
    return this.#painter !== null;
  }

  /** The landing frame: the screen goes live and fades in over the still. */
  reveal(): void {
    if (this.#live) return;
    if (this.#stale) this.paint();
    this.#live = true;
    this.element.style.visibility = 'visible';
    this.element.style.pointerEvents = 'auto';
    this.element.dataset.live = 'true';
    this.log({ type: 'reveal' });
    for (const listener of this.#liveListeners) listener(true);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.element.animate({ opacity: [0, 1] }, { duration: REVEAL_MS, easing: 'ease-out' });
    }
  }

  /** The camera is asked to leave: hidden at once, the light override cleared. */
  conceal(): void {
    if (!this.#live) return;
    for (const animation of this.element.getAnimations()) animation.cancel();
    this.#live = false;
    this.element.style.visibility = 'hidden';
    this.element.style.pointerEvents = 'none';
    this.element.dataset.live = 'false';
    this.log({ type: 'conceal' });
    for (const listener of this.#liveListeners) listener(false);
    if (this.#stale) this.paint();
  }

  /** Repaints the still at texture resolution, as the room does before a flight. */
  paint(): void {
    const { width, height, left, top } = this.#placement;
    const canvas = this.#still;
    Object.assign(canvas.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    const textureWidth =
      this.#tier ?? (width * devicePixelRatio <= 600 ? 512 : width * devicePixelRatio <= 900 ? 768 : 1024);
    canvas.width = Math.round(textureWidth);
    canvas.height = Math.round((textureWidth * height) / width);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#070a09';
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (!this.#painter) return;
    context.save();
    context.beginPath();
    context.rect(0, 0, canvas.width, canvas.height);
    context.clip();
    // Measured like the room's prepare-before-flight: the first paint also generates the wallpaper.
    const start = performance.now();
    this.#painter(context, {
      width: canvas.width,
      height: canvas.height,
      placement: this.#placement,
      cpuCanvas: false,
    });
    performance.measure('pc-still-paint', { start, end: performance.now() });
    context.restore();
    this.#stale = false;
    this.log({ type: 'paint' });
  }

  #measure(): ScreenRect {
    const width = this.#size?.width ?? Math.round(window.innerWidth * 0.61);
    const height = this.#size?.height ?? Math.round((width * 4) / 5);
    const snap = (value: number): number => Math.round(value * devicePixelRatio) / devicePixelRatio;
    return { left: snap((window.innerWidth - width) / 2), top: snap((window.innerHeight - height) / 2), width, height };
  }

  #apply(): void {
    const { left, top, width, height } = this.#placement;
    Object.assign(this.element.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${left}px, ${top}px)`,
      borderRadius: `${CORNER_RADIUS}px`,
      overflow: 'hidden',
      contain: 'strict',
      visibility: this.#live ? 'visible' : 'hidden',
      pointerEvents: this.#live ? 'auto' : 'none',
    });
    document.documentElement.style.setProperty('--lab-left', `${left}px`);
    document.documentElement.style.setProperty('--lab-top', `${top}px`);
    document.documentElement.style.setProperty('--lab-width', `${width}px`);
    document.documentElement.style.setProperty('--lab-height', `${height}px`);
  }

  log(event: Omit<LabEvent, 'at'>): void {
    this.events.push({ ...event, at: performance.now() });
  }
}
