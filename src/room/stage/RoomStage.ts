import {
  Group,
  Mesh,
  NoToneMapping,
  type Object3D,
  PerspectiveCamera,
  Points,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { RoomAir, RoomMood } from '../atmosphere/moods';
import { RoomAtmosphere } from '../atmosphere/RoomAtmosphere';
import {
  expectedFrameMs,
  FIT_MARGIN,
  fittingQuality,
  pixelRatioFor,
  QUALITY_TIERS,
  type Quality,
  QualityGovernor,
  type QualityTier,
  startingTier,
  ticksAtSixty,
} from './quality';

/** Frames `settle` draws at most: the first uploads what the view needs, the quickest of the others is the measure. */
const SETTLE_FRAMES = 4;

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
  /** Who holds the frames (`hold`). */
  private readonly holders = new Set<string>();
  /** Sees only what `warm` draws. */
  private readonly warmCamera = new PerspectiveCamera(40, 1, 0.03, 60);
  private readonly retargetListeners = new Set<() => void>();

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
  /** The frame `watchDisplay` waits for, while it watches. */
  private displayWatch: number | null = null;
  private reading = false;
  /** The governor has changed the quality and the stage has yet to take it up. */
  private qualityDue = false;
  /** The canvas has a new size and no frame of it yet (it is blank until one is drawn), or is owed one (`oweFrame`). */
  private blank = false;
  /** The samples of the target frames draw into, as the atmosphere was last told. */
  private samples: number;

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
    this.samples = QUALITY_TIERS[tier].samples;
    this.watchDisplay();

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

  /** Someone holds the frames: none is drawn (`hold`). */
  get held(): boolean {
    return this.holders.size > 0;
  }

  /**
   * While anyone holds the frames none is drawn: for the room's bake, while nothing of the room is on screen or a
   * visitor waits for the rest of it, and for what a flight shows being made ready before it sets off, so that work
   * is not queued behind frames on the GPU (and frames that come late for it say nothing to the governor). A resized
   * canvas still gets its one frame (it is blank until then). The last to let go asks for a frame.
   */
  hold(by: string, held: boolean): void {
    if (held) this.holders.add(by);
    else if (this.holders.delete(by) && this.holders.size === 0) this.loop.invalidate();
  }

  /** True while the canvas is on screen and the tab is visible. */
  get visible(): boolean {
    return this.visibleOnPage && !document.hidden;
  }

  /** The tier and scale frames are drawn at now (docs/ROOM.md › Quality). */
  get quality(): Quality {
    return this.governor.quality;
  }

  /** The interval frames are meant to come at here (ms): a 60 Hz frame, or the display's own where it ticks slower. */
  get frameMs(): number {
    return this.governor.frameMs;
  }

  /** How often the quality has changed this page load. */
  get qualityChanges(): number {
    return this.governor.changes;
  }

  /** The display hands out fewer than sixty frames a second (docs/ROOM.md › Quality › A capped display). */
  get displayCapped(): boolean {
    return this.governor.capped;
  }

  /**
   * Finds how fast the display hands out frames, before the room draws any: about the quickest interval between
   * sixteen of its frames in a row (a busy main thread makes some longer, nothing makes one much shorter). The governor and the
   * bake's pacing judge the room's frames against it (docs/ROOM.md › Quality › A capped display). A display that looks
   * capped is watched on for a while: a page busy loading shows few frames a single tick apart, and four of them,
   * whenever they come, say the display is not capped after all.
   */
  private watchDisplay(): void {
    let last: number | null = null;
    const intervals: number[] = [];
    let seen = 0;
    let quick = 0;
    const frame = (now: number): void => {
      this.displayWatch = null;
      if (last !== null && now > last) {
        intervals.push(now - last);
        if (ticksAtSixty(now - last)) quick++;
      }
      last = now;
      seen++;
      if (seen === DISPLAY_WATCH_FRAMES) {
        // The fourth quickest of the fifteen: a frame's timestamp may come a few milliseconds early (three of them
        // may), and the long ones a busy page makes are at the other end.
        const sorted = intervals.sort((a, b) => a - b);
        const quickest = sorted[Math.min(3, sorted.length - 1)];
        if (quickest !== undefined) this.governor.expect(expectedFrameMs(quickest));
      } else if (seen > DISPLAY_WATCH_FRAMES && quick > 3) {
        this.governor.expect(expectedFrameMs(0));
      }
      const watching = seen < DISPLAY_WATCH_FRAMES || (this.governor.capped && seen < DISPLAY_WATCH_LIMIT);
      if (watching) this.displayWatch = requestAnimationFrame(frame);
    };
    this.displayWatch = requestAnimationFrame(frame);
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

  /**
   * One more frame is drawn although the frames are held: what the screen shows changed as the hold began (the TV's
   * PAUSE, as a visitor leaves the game before the room is all made).
   */
  oweFrame(): void {
    this.blank = true;
    this.loop.invalidate();
  }

  /** As `prepare`, linking in the background where the browser can; resolves once the programs are ready to draw. */
  prepareAsync(object: Object3D): Promise<unknown> {
    if (this.atmosphere) return this.atmosphere.prepareAsync(this.scene, object, this.camera);
    return this.renderer.compileAsync(object, this.camera, this.scene);
  }

  /**
   * Draws `objects` once where nobody sees it (docs/ROOM.md › Warming): their vertex arrays are made, their buffers
   * and textures uploaded and the driver's own state for their programs built, for the target frames draw into,
   * which a frame would otherwise do the first time each comes into view, in the middle of a flight. The objects
   * themselves are not touched: stand-ins with their geometry, material and place are drawn, on a layer of their
   * own, so one hidden for now is warmed too.
   */
  warm(objects: readonly Object3D[]): void {
    if (!this.atmosphere || this.contextLost) return;
    const group = new Group();
    for (const object of objects) {
      const standIn = standInFor(object);
      if (standIn) group.add(standIn);
    }
    if (group.children.length === 0) return;
    this.warmCamera.layers.set(WARM_LAYER);
    this.warmCamera.position.copy(this.camera.position);
    this.warmCamera.quaternion.copy(this.camera.quaternion);
    this.scene.add(group);
    try {
      this.atmosphere.warm(this.scene, this.warmCamera);
    } finally {
      this.scene.remove(group);
    }
  }

  /**
   * Resolves once the GPU has done everything it was handed so far, or after `maxMs`; at once where it cannot say.
   * What the main thread hands over (an upload, a draw, a program) returns long before the GPU is through with it,
   * and a frame handed over next waits behind it.
   */
  gpuIdle(maxMs: number): Promise<void> {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (this.contextLost || typeof gl.fenceSync !== 'function') return Promise.resolve();
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const started = performance.now();
    return new Promise((resolve) => {
      const poll = (): void => {
        const waiting = sync !== null && !this.contextLost && gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED;
        if (waiting && performance.now() - started < maxMs) {
          later(poll);
          return;
        }
        if (sync && !this.contextLost) gl.deleteSync(sync);
        resolve();
      };
      poll();
    });
  }

  /** Called when the target frames draw into is made anew with other samples: what was warmed for it is not for this. */
  onRetarget(listener: () => void): () => void {
    this.retargetListeners.add(listener);
    return () => this.retargetListeners.delete(listener);
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
    if (this.displayWatch !== null) cancelAnimationFrame(this.displayWatch);
    this.displayWatch = null;
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
    this.retargetListeners.clear();
  }

  /** The pixel ratio `quality` draws a `width` × `height` canvas at here. */
  private ratioAt(quality: Quality, width: number, height: number): number {
    return Math.min(
      pixelRatioFor(quality, width, height, window.devicePixelRatio || 1),
      this.options.maxPixelRatio ?? Number.POSITIVE_INFINITY,
      Math.sqrt((this.options.maxDrawingBufferPixels ?? Number.POSITIVE_INFINITY) / (width * height)),
    );
  }

  /**
   * Finds the quality this GPU can draw the room at, before the room is shown (docs/ROOM.md › Quality › Before the
   * first frame): draws up to four frames nobody sees, each on a display frame, and times each by a fence. A frame
   * within `FIT_MARGIN` of a 60 Hz frame ends it at once, the quality as it was (a quick GPU draws one frame here);
   * otherwise the quickest of the last three says how many pixels fit (`fittingQuality`), so the governor does not
   * spend the room's first seconds finding out at a few frames a second. Resolves when done; at once where the
   * quality is fixed.
   */
  settle(): Promise<void> {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (this.governor.isFixed || this.contextLost || typeof gl.fenceSync !== 'function') return Promise.resolve();
    return new Promise((resolve) => {
      const times: number[] = [];
      const frame = (): void => {
        const started = performance.now();
        this.render();
        // In the next task: whatever stands in for a slow GPU by drawing the frame again has done so by then. Never on
        // a timer: a browser that slows timers down (a phone saving power) would have the frame look that slow.
        later(() => {
          const sync = this.contextLost ? null : gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = (): void => {
            if (sync && !this.contextLost && gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED) {
              later(poll);
              return;
            }
            if (sync) gl.deleteSync(sync);
            const took = performance.now() - started;
            times.push(took);
            const fits = took <= (1000 / 60) * FIT_MARGIN;
            if (!sync || fits || times.length === SETTLE_FRAMES) {
              const { width, height } = this.viewport;
              const fitting = fits
                ? this.quality
                : fittingQuality(this.quality, Math.min(...times.slice(1)), (quality) => {
                    const ratio = this.ratioAt(quality, width, height);
                    return ratio * ratio;
                  });
              if (sync && fitting !== this.quality) {
                this.governor.start(fitting, performance.now());
                this.retier();
                this.atmosphere?.syncMotion();
                this.resize();
              }
              resolve();
            } else requestAnimationFrame(frame);
          };
          poll();
        });
      };
      requestAnimationFrame(frame);
    });
  }

  private resize(): void {
    const width = Math.max(1, this.options.container.clientWidth);
    const height = Math.max(1, this.options.container.clientHeight);
    const pixelRatio = this.ratioAt(this.quality, width, height);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.viewport = { width, height, pixelRatio };
    for (const listener of this.resizeListeners) listener(this.viewport);
    this.blank = true;
    this.loop.invalidate();
  }

  private readonly draw = (now: number): void => {
    if (this.contextLost || (this.held && !this.blank)) return;
    this.blank = false;
    this.render();
    for (const listener of this.renderListeners) listener();
    // Judged after the frame, so a change of quality is drawn by the next one whole.
    const interval = this.loop.runInterval;
    if (interval !== null && this.governor.sample(interval, now)) this.qualityDue = true;
    // A change is a resize, which a flight's frames have no room for: it waits for the camera to land.
    if (!this.qualityDue || this.loop.animating) return;
    this.qualityDue = false;
    this.retier();
    this.atmosphere?.syncMotion();
    this.resize();
  };

  /** Takes up the quality's tier; a tier with other samples is another target, which nothing has been warmed for. */
  private retier(): void {
    const samples = QUALITY_TIERS[this.quality.tier].samples;
    const changed = this.atmosphere !== null && samples !== this.samples;
    this.samples = samples;
    this.atmosphere?.setTier(QUALITY_TIERS[this.quality.tier]);
    if (changed) for (const listener of this.retargetListeners) listener();
  }

  private render(): void {
    if (this.contextLost) return;
    if (this.atmosphere) this.atmosphere.render(this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
  }

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

/** Display frames watched in a row as the stage is made (`watchDisplay`): a quarter of a second at sixty a second. */
const DISPLAY_WATCH_FRAMES = 16;
/** A display that looks capped after those is watched this many frames in all: eight seconds at thirty a second. */
const DISPLAY_WATCH_LIMIT = 240;
/** The layer only `RoomStage.warm`'s camera sees (the bake's casters are on 20 and 21). */
const WARM_LAYER = 30;
/**
 * Runs `task` once nothing more urgent is queued, without a timer (as the bake looks at its fences, GeneratedRoom): a
 * timer's clamp is four milliseconds once timers nest, and a test's paused clock never fires one.
 */
function later(task: () => void): void {
  const tasks = (globalThis as { scheduler?: { postTask?(task: () => void, options: { priority: string }): unknown } })
    .scheduler;
  if (typeof tasks?.postTask === 'function') {
    void tasks.postTask(task, { priority: 'background' });
    return;
  }
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = () => {
    port1.close();
    task();
  };
  port2.postMessage(null);
}

/** A mesh or points with `object`'s geometry, material and place, seen only by the warming camera, wherever it looks. */
function standInFor(object: Object3D): Object3D | null {
  const source = object as Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean };
  if (!source.geometry || !source.material || source.isInstancedMesh || source.isSkinnedMesh) return null;
  const standIn = (object as Points).isPoints
    ? new Points(source.geometry, source.material)
    : source.isMesh
      ? new Mesh(source.geometry, source.material)
      : null;
  if (!standIn) return null;
  standIn.matrixAutoUpdate = false;
  standIn.matrixWorldAutoUpdate = false;
  standIn.matrixWorld.copy(object.matrixWorld);
  standIn.frustumCulled = false;
  standIn.layers.set(WARM_LAYER);
  return standIn;
}
