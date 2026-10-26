/** A rectangle in the room container's CSS pixels; left and top are snapped to device pixels. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface StillRequest {
  /** Size of the canvas region to paint, in pixels: the monitor's picture (inside the tube border). */
  readonly width: number;
  readonly height: number;
  /** The picture's rectangle on the page when settled at the PC, for the current viewport: the live screen's size. */
  readonly placement: ScreenRect;
  /**
   * Make any canvas painted ahead (a cached bitmap) a CPU one, `{ willReadFrequently: true }`: the page draws with
   * a software GPU, where an accelerated canvas's raster queues behind the room's frames and stalls them.
   */
  readonly cpuCanvas: boolean;
}

/**
 * Paints what the monitor shows whenever the live screen does not. The context's origin is the picture's top-left
 * and it is clipped to the picture; compose transforms only (save/scale/translate/restore), never setTransform,
 * resetTransform or pixel reads. Called rarely, never per frame.
 */
export interface StillPainter {
  (context: CanvasRenderingContext2D, request: StillRequest): void;
  /**
   * Optional: the one-time work of the first paint (fonts to load, a bitmap to cache) in small units, each `yield`
   * ending one. The room runs them in idle moments ahead of the first paint, between a playing game's frames only
   * when a unit fits; a paint that comes first must do the rest itself.
   */
  readonly prepare?: (request: StillRequest) => Iterable<void>;
}

/** sRGB, 0–1. */
export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface PcMonitor {
  /** Content slot laid exactly over the monitor's picture; visible only while `live`. Render the screen's DOM in it. */
  readonly screen: HTMLElement;
  /** The picture's rectangle when the camera rests at the PC, for the current viewport; zero-sized until ready. */
  readonly placement: ScreenRect;
  onPlacementChange(listener: (placement: ScreenRect) => void): () => void;
  /** True from the landing frame until the camera is asked to leave the PC. */
  readonly live: boolean;
  onLiveChange(listener: (live: boolean) => void): () => void;
  /** What the glass shows whenever the live screen does not; null shows the dark standby tube. */
  setStill(painter: StillPainter | null): void;
  /** The still's content changed (e.g. the clock's minute); it is repainted before the next flight to or from the PC. */
  invalidateStill(): void;
  /** Light the screen spills while the live screen differs from the still; null follows the still. Cleared on conceal. */
  setLight(color: RgbColor | null): void;
}

/** The device side of the monitor, once the room has loaded (Monitor.ts). */
interface MonitorDevice {
  setStill(painter: StillPainter | null): void;
  invalidateStill(): void;
  setLight(color: RgbColor | null): void;
}

/** The live screen's element and state (ScreenOverlay.ts). */
interface LiveScreen {
  readonly content: HTMLElement;
  readonly placement: ScreenRect;
  readonly live: boolean;
  onPlacementChange(listener: (placement: ScreenRect) => void): () => void;
  onLiveChange(listener: (live: boolean) => void): () => void;
  reveal(): void;
  conceal(): void;
}

/**
 * The room's public face of the computer's monitor. It exists from `createRoom` on, before the
 * models have loaded, so the app can mount its screen and hand over its still early: the still
 * and the light are remembered and passed to the device once it exists.
 */
export class PcMonitorHandle implements PcMonitor {
  private device: MonitorDevice | null = null;
  private painter: StillPainter | null = null;
  private light: RgbColor | null = null;

  constructor(private readonly overlay: LiveScreen) {}

  get screen(): HTMLElement {
    return this.overlay.content;
  }

  get placement(): ScreenRect {
    return this.overlay.placement;
  }

  get live(): boolean {
    return this.overlay.live;
  }

  onPlacementChange(listener: (placement: ScreenRect) => void): () => void {
    return this.overlay.onPlacementChange(listener);
  }

  onLiveChange(listener: (live: boolean) => void): () => void {
    return this.overlay.onLiveChange(listener);
  }

  setStill(painter: StillPainter | null): void {
    this.painter = painter;
    this.device?.setStill(painter);
  }

  invalidateStill(): void {
    this.device?.invalidateStill();
  }

  setLight(color: RgbColor | null): void {
    this.light = color;
    this.device?.setLight(color);
  }

  /** The room has loaded: hands the device what the app asked for so far. */
  attach(device: MonitorDevice): void {
    this.device = device;
    device.setLight(this.light);
    device.setStill(this.painter);
  }

  detach(): void {
    this.device = null;
  }

  /** The camera landed at the computer (the view state's `revealScreen`). */
  reveal(): void {
    this.overlay.reveal();
  }

  /** The camera is leaving the computer (`concealScreen`): the light follows the still again. */
  conceal(): void {
    this.setLight(null);
    this.overlay.conceal();
  }
}
