import { type AnimationClip, AnimationMixer, Box3, type Camera, Frustum, Matrix4, type Object3D } from 'three';

const LAVA_FPS = 24;
/** Longest step fed to the mixer, so a throttled tab does not make the wax jump. */
const MAX_STEP_SECONDS = 0.12;

export interface LavaLampOptions {
  readonly root: Object3D;
  readonly clips: readonly AnimationClip[];
  readonly camera: Camera;
  /** Whether the stage canvas is on screen and the tab visible. */
  readonly isStageVisible: () => boolean;
  readonly reducedMotion: MediaQueryList;
  /** Asks the stage to draw a frame. */
  readonly invalidate: () => void;
}

/**
 * Plays the baked 48 s lava flow at 24 fps, and only while someone can see it: the lamp must
 * be inside the camera frustum, the canvas on screen, the tab visible and reduced motion off.
 * Each tick asks for exactly one frame; an idle lamp costs nothing.
 */
export class LavaLamp {
  private readonly mixer: AnimationMixer | null;
  private readonly bounds = new Box3();
  private readonly frustum = new Frustum();
  private readonly projection = new Matrix4();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last = 0;
  private disposed = false;

  constructor(private readonly options: LavaLampOptions) {
    const lamp: Object3D[] = [];
    options.root.traverse((object) => {
      if (object.userData.supplied_asset === 'lava') lamp.push(object);
    });
    for (const object of lamp) this.bounds.expandByObject(object);
    this.mixer = options.clips.length > 0 && lamp.length > 0 ? new AnimationMixer(options.root) : null;
    for (const clip of options.clips) this.mixer?.clipAction(clip).play();
    options.reducedMotion.addEventListener('change', this.sync);
  }

  get running(): boolean {
    return this.timer !== null;
  }

  /** Starts or stops ticking to match visibility; call after the camera moves. */
  readonly sync = (): void => {
    if (!this.shouldAnimate()) {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      return;
    }
    if (this.timer !== null) return;
    this.last = performance.now();
    this.timer = setTimeout(this.tick, 1000 / LAVA_FPS);
  };

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.options.reducedMotion.removeEventListener('change', this.sync);
    this.mixer?.stopAllAction();
  }

  private readonly tick = (): void => {
    this.timer = null;
    if (!this.mixer || !this.shouldAnimate()) return;
    const now = performance.now();
    this.mixer.update(Math.min((now - this.last) / 1000, MAX_STEP_SECONDS));
    this.last = now;
    this.options.invalidate();
    this.sync();
  };

  private shouldAnimate(): boolean {
    if (this.disposed || !this.mixer || this.bounds.isEmpty()) return false;
    if (this.options.reducedMotion.matches || !this.options.isStageVisible()) return false;
    const { camera } = this.options;
    camera.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    return this.frustum.intersectsBox(this.bounds);
  }
}
