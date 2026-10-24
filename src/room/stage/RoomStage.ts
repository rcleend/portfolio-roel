import { NoToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import { RenderLoop } from './RenderLoop';
import { isSoftwareGpu } from './softwareGpu';

export interface StageOptions {
  readonly container: HTMLElement;
  /** Upper bound for devicePixelRatio. */
  readonly maxPixelRatio?: number;
  /** Upper bound for drawing-buffer pixels (width × height), whatever the DPR. */
  readonly maxDrawingBufferPixels?: number;
}

export interface ViewportSize {
  /** CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

const DEFAULT_MAX_PIXEL_RATIO = 2;
// 3 MP keeps the CRT's scanlines crisp on retina laptops while bounding fill cost on 4K.
const DEFAULT_MAX_DRAWING_BUFFER_PIXELS = 3_000_000;

/**
 * Owns the WebGL renderer, scene, camera and canvas, and draws only when its RenderLoop asks.
 */
export class RoomStage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(40, 1, 0.03, 60);
  readonly loop: RenderLoop;
  readonly canvas: HTMLCanvasElement;
  /** The GPU is software: 2D canvases are better painted on the CPU (see isSoftwareGpu). */
  readonly softwareGpu: boolean;

  private viewport: ViewportSize = { width: 1, height: 1, pixelRatio: 1 };
  private readonly resizeListeners = new Set<(size: ViewportSize) => void>();
  private readonly renderListeners = new Set<() => void>();
  private readonly resizeObserver: ResizeObserver;
  private visibleOnPage = true;
  private readonly intersectionObserver: IntersectionObserver;
  private contextLost = false;

  constructor(private readonly options: StageOptions) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Baked room surfaces already contain Blender's display transform; tone mapping them
    // again would wash them out.
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = false;
    this.softwareGpu = isSoftwareGpu(this.renderer.getContext());

    this.canvas = this.renderer.domElement;
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    // The canvas owns every gesture: taps drive the game and the camera, never page scroll.
    this.canvas.style.touchAction = 'none';
    options.container.appendChild(this.canvas);

    this.loop = new RenderLoop(this.draw);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(options.container);
    this.intersectionObserver = new IntersectionObserver((entries) => {
      this.visibleOnPage = entries.some((entry) => entry.isIntersecting);
      this.loop.invalidate();
    });
    this.intersectionObserver.observe(this.canvas);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.resize();
  }

  get size(): ViewportSize {
    return this.viewport;
  }

  /** True while the canvas is on screen and the tab is visible. */
  get visible(): boolean {
    return this.visibleOnPage && !document.hidden;
  }

  onResize(listener: (size: ViewportSize) => void): () => void {
    this.resizeListeners.add(listener);
    return () => this.resizeListeners.delete(listener);
  }

  /** Called after every drawn frame, e.g. to re-evaluate what is in view. */
  onRender(listener: () => void): () => void {
    this.renderListeners.add(listener);
    return () => this.renderListeners.delete(listener);
  }

  dispose(): void {
    this.loop.dispose();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.dispose();
    this.canvas.remove();
    this.resizeListeners.clear();
    this.renderListeners.clear();
  }

  private resize(): void {
    const width = Math.max(1, this.options.container.clientWidth);
    const height = Math.max(1, this.options.container.clientHeight);
    const maxPixels = this.options.maxDrawingBufferPixels ?? DEFAULT_MAX_DRAWING_BUFFER_PIXELS;
    const pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      this.options.maxPixelRatio ?? DEFAULT_MAX_PIXEL_RATIO,
      Math.sqrt(maxPixels / (width * height)),
    );
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.viewport = { width, height, pixelRatio };
    for (const listener of this.resizeListeners) listener(this.viewport);
    this.loop.invalidate();
  }

  private readonly draw = (): void => {
    if (this.contextLost) return;
    this.renderer.render(this.scene, this.camera);
    for (const listener of this.renderListeners) listener();
  };

  private readonly onVisibilityChange = (): void => {
    this.loop.invalidate();
  };

  private readonly onContextLost = (event: Event): void => {
    // Prevent the default so the browser is allowed to restore the context later.
    event.preventDefault();
    this.contextLost = true;
  };

  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    this.loop.invalidate();
  };
}
