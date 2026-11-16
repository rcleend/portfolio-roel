import { NoToneMapping, type Object3D, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';
import type { RoomAir, RoomMood } from '../atmosphere/moods';
import { RoomAtmosphere } from '../atmosphere/RoomAtmosphere';
import { pixelRatioFor, QUALITY_TIERS, type Quality, QualityGovernor, type QualityTier, startingTier } from './quality';
import { RenderLoop } from './RenderLoop';
import { isSoftwareGpu } from './softwareGpu';

export interface StageOptions {
  readonly container: HTMLElement;
  /** Upper bound for devicePixelRatio. */
  readonly maxPixelRatio?: number;
  /** Upper bound for drawing-buffer pixels (width × height), whatever the DPR. */
  readonly maxDrawingBufferPixels?: number;
  readonly mood?: RoomMood;
  readonly air?: RoomAir;
  /** A fixed tier, or `auto` (the default): chosen from the device and governed by its frame times. */
  readonly quality?: QualityTier | 'auto';
}

export interface ViewportSize {
  /** CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

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
  private atmosphere: RoomAtmosphere | null = null;
  private atTv = true;
  private currentMood: RoomMood = 'original';
  private air: RoomAir = { haze: 1, dust: 1 };
  private readonly governor: QualityGovernor;
  private reading = false;
  /** The governor has changed the quality and the stage has yet to take it up. */
  private qualityDue = false;

  constructor(private readonly options: StageOptions) {
    // A finish draws the room into its own multisampled target and only two triangles and the dust onto the canvas,
    // whose own multisampling would be a second resolve of every frame for nothing; the unprocessed bake draws
    // straight onto it.
    const antialias = (options.mood ?? 'original') === 'original';
    this.renderer = new WebGLRenderer({ antialias, powerPreference: 'high-performance' });
    // Baked room surfaces already hold display values (the bake's own curve, gen/bake/shaders.ts); tone mapping
    // them again would wash them out.
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.shadowMap.enabled = false;
    // Checking a program's link status makes the main thread wait for the driver to finish linking it: a quarter of a
    // second for the CD's shader under SwiftShader, which lacks KHR_parallel_shader_compile. Development still checks.
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.softwareGpu = isSoftwareGpu(this.renderer.getContext());
    const fixed = options.quality && options.quality !== 'auto' ? options.quality : null;
    const tier =
      fixed ??
      startingTier({
        software: this.softwareGpu,
        coarse: window.matchMedia('(pointer: coarse)').matches,
        shortSide: Math.min(window.screen.width, window.screen.height),
      });
    // Not governed: a software renderer, whose frame times are the CPU's, which the page's own work moves more than
    // the pixels do; and a browser under automation, whose clock is the test's (a paused clock stepped a frame at a
    // time, a throttled CPU) and says nothing about the device.
    this.governor = new QualityGovernor({ tier, scale: 1 }, fixed !== null || this.softwareGpu || navigator.webdriver);

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
      this.atmosphere?.syncMotion();
      this.loop.invalidate();
    });
    this.intersectionObserver.observe(this.canvas);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.resize();
    if (options.air) this.setAir(options.air);
    this.setMood(options.mood ?? 'original');
  }

  get size(): ViewportSize {
    return this.viewport;
  }

  /** True while the canvas is on screen and the tab is visible. */
  get visible(): boolean {
    return this.visibleOnPage && !document.hidden;
  }

  /** The tier and scale frames are drawn at now (docs/ROOM.md › Quality). */
  get quality(): Quality {
    return this.governor.quality;
  }

  get lightning(): number {
    return this.atmosphere?.lightning ?? 0;
  }

  get mood(): RoomMood {
    return this.currentMood;
  }

  setMood(mood: RoomMood): void {
    if (mood === this.currentMood) return;
    this.currentMood = mood;
    this.atmosphere ??= new RoomAtmosphere(
      this.renderer,
      this.loop,
      () => this.visible && !this.contextLost && !this.airRests,
      QUALITY_TIERS[this.quality.tier],
    );
    this.atmosphere.attach(this.scene);
    this.atmosphere.setAir(this.air);
    this.atmosphere.setMood(mood);
    this.atmosphere.setAtTv(this.atTv);
    this.loop.invalidate();
  }

  setAtTv(atTv: boolean): void {
    this.atTv = atTv;
    this.atmosphere?.setAtTv(atTv);
  }

  /**
   * The visitor sits at the computer's live screen. Below the top tier the room's air then rests: on a phone the
   * screen covers the room, and drawing all of it twelve times a second for the dust beside a page being read is what
   * warms the device.
   */
  setReading(reading: boolean): void {
    this.reading = reading;
    this.atmosphere?.syncMotion();
  }

  private get airRests(): boolean {
    return this.reading && this.quality.tier !== 'high';
  }

  setAir(air: RoomAir): void {
    const bounded = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : 1);
    this.air = { haze: bounded(air.haze), dust: bounded(air.dust) };
    this.atmosphere?.setAir(this.air);
    this.loop.invalidate();
  }

  /** Called once the room's baked surfaces have joined the scene. */
  attachAtmosphere(): void {
    this.atmosphere?.attach(this.scene);
  }

  /** Compiles `object`'s materials now, for the target frames draw them into (the finish's, or the screen). */
  prepare(object: Object3D): void {
    if (this.atmosphere) this.atmosphere.prepare(this.scene, object, this.camera);
    else this.renderer.compile(object, this.camera, this.scene);
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
    this.atmosphere?.dispose();
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
    const pixelRatio = Math.min(
      pixelRatioFor(this.quality, width, height, window.devicePixelRatio || 1),
      this.options.maxPixelRatio ?? Number.POSITIVE_INFINITY,
      Math.sqrt((this.options.maxDrawingBufferPixels ?? Number.POSITIVE_INFINITY) / (width * height)),
    );
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.viewport = { width, height, pixelRatio };
    for (const listener of this.resizeListeners) listener(this.viewport);
    this.loop.invalidate();
  }

  private readonly draw = (now: number): void => {
    if (this.contextLost) return;
    if (this.atmosphere) this.atmosphere.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
    for (const listener of this.renderListeners) listener();
    // Judged after the frame, so a change of quality is drawn by the next one whole.
    const interval = this.loop.runInterval;
    if (interval !== null && this.governor.sample(interval, now)) this.qualityDue = true;
    // A change is a resize, which a flight's frames have no room for: it waits for the camera to land.
    if (!this.qualityDue || this.loop.animating) return;
    this.qualityDue = false;
    this.atmosphere?.setTier(QUALITY_TIERS[this.quality.tier]);
    this.atmosphere?.syncMotion();
    this.resize();
  };

  private readonly onVisibilityChange = (): void => {
    this.atmosphere?.syncMotion();
    this.loop.invalidate();
  };

  private readonly onContextLost = (event: Event): void => {
    // Prevent the default so the browser is allowed to restore the context later.
    event.preventDefault();
    this.contextLost = true;
    this.atmosphere?.syncMotion();
  };

  private readonly onContextRestored = (): void => {
    this.contextLost = false;
    this.atmosphere?.syncMotion();
    this.loop.invalidate();
  };
}
