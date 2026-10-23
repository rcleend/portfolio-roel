import { MathUtils, type PerspectiveCamera, Vector2, Vector3 } from 'three';
import { easeInOutCubic, easeOutCubic } from '../motion/easing';
import { type PcFramingModel, pcViewpoint } from '../pc/pcFraming';
import type { RenderLoop } from '../stage/RenderLoop';
import type { ViewportSize } from '../stage/RoomStage';
import type { TvModel } from '../tv/tvModel';
import type { RoomView } from '../viewState';
import {
  cloneViewpoint,
  craneControl,
  type FlightPath,
  type FlightProgress,
  interpolateViewpoint,
  pcLegProgress,
  uniformProgress,
  type Viewpoint,
} from './cameraPath';
import { boxCorners, FULL_VIEWPORT, frameSubject, type NdcRegion, regionFromInsets } from './framing';
import { roomViewpoint } from './roomFraming';
import type { ScreenFade } from './ScreenFade';

/** CSS-pixel strips of the viewport covered by app overlays (e.g. a touch pad). */
export interface FramingInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const NO_INSETS: FramingInsets = { top: 0, right: 0, bottom: 0, left: 0 };

// A long lens flattens the set into a "product shot" of the TV.
const TV_FOV = 28;
// Beyond this distance a portrait framing would back the camera into the desk; widen the
// lens instead.
const TV_MAX_DISTANCE = 1.75;
const TV_MAX_FOV = 60;
// Space left around the TV on each side, as a fraction of the framing region.
const TV_MARGIN = 0.06;
// Looking down slightly shows the top of the cabinet: depth without losing "straight on".
const TV_PITCH_DEGREES = 4;

/** One motion language: every flight, the computer's included, takes the same time. */
const FLIGHT_MS = 1100;
const FLIGHT_LIFT = 0.16;
const REDUCED_FADE_MS = 140;

const PARALLAX_RANGE = new Vector2(0.06, 0.035);
const PARALLAX_RATE = 5;

/**
 * Owns the TV, room and computer viewpoints, the flights between them and a subtle pointer
 * parallax in the room view.
 */
export class CameraRig {
  private readonly poses: Record<RoomView, Viewpoint>;
  private current: Viewpoint;
  private settledView: RoomView = 'tv';
  private region: NdcRegion = FULL_VIEWPORT;
  private insets: FramingInsets = NO_INSETS;
  private viewport: ViewportSize = { width: 1, height: 1, pixelRatio: 1 };
  private stopFlight: (() => void) | null = null;
  private readonly parallax = new Vector2();
  private readonly parallaxGoal = new Vector2();
  private parallaxActive = false;
  private parallaxEnabled = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly loop: RenderLoop,
    private readonly tv: TvModel,
    private readonly pc: PcFramingModel,
    private readonly reducedMotion: MediaQueryList,
    private readonly fade: ScreenFade,
  ) {
    this.poses = { tv: this.computeTvPose(), room: roomViewpoint(1), pc: pcViewpoint(pc, 1) };
    this.current = cloneViewpoint(this.poses.tv);
    this.apply();
  }

  get moving(): boolean {
    return this.stopFlight !== null;
  }

  /** The pose the camera rests at in `view`, for the current viewport. */
  viewpoint(view: RoomView): Viewpoint {
    return cloneViewpoint(this.poses[view]);
  }

  resize(viewport: ViewportSize): void {
    this.viewport = viewport;
    this.region = regionFromInsets(viewport, this.insets);
    this.refreshPoses();
  }

  setFramingInsets(insets: FramingInsets): void {
    this.insets = insets;
    this.resize(this.viewport);
  }

  /** Places the camera at `view` immediately. */
  jumpTo(view: RoomView): void {
    this.stopFlight?.();
    this.stopFlight = null;
    this.settledView = view;
    this.current = cloneViewpoint(this.poses[view]);
    this.apply();
    this.loop.invalidate();
  }

  /** Flies to `view` (or cuts, under reduced motion) and calls `onArrive` once there. */
  goTo(view: RoomView, onArrive: () => void): void {
    const leavingPc = !this.moving && this.settledView === 'pc';
    this.stopFlight?.();
    this.parallaxEnabled = false;
    this.setParallaxPointer(null);
    const step = this.reducedMotion.matches
      ? this.cutStep(view, onArrive)
      : this.flightStep(view, view === 'pc' ? 'arriving' : leavingPc ? 'departing' : null, onArrive);
    this.stopFlight = this.loop.animate(step);
  }

  /** Pointer position in NDC (-1…1), or null when it leaves; only moves the room view. */
  setParallaxPointer(pointer: Vector2 | null): void {
    if (pointer && this.parallaxEnabled) this.parallaxGoal.copy(pointer);
    else this.parallaxGoal.set(0, 0);
    if (!this.parallaxActive && !this.parallax.equals(this.parallaxGoal)) {
      this.parallaxActive = true;
      let last: number | null = null;
      this.loop.animate((now) => {
        const dt = last === null ? 1 / 60 : Math.min((now - last) / 1000, 0.1);
        last = now;
        this.parallax.lerp(this.parallaxGoal, 1 - Math.exp(-dt * PARALLAX_RATE));
        const settled = this.parallax.distanceToSquared(this.parallaxGoal) < 1e-6;
        if (settled) this.parallax.copy(this.parallaxGoal);
        this.apply();
        this.parallaxActive = !settled;
        return !settled;
      });
    }
  }

  dispose(): void {
    this.stopFlight?.();
    this.stopFlight = null;
  }

  /**
   * @param pcLeg 'arriving' or 'departing' for a flight to the computer or from a settled
   *   computer: a crane over the chair with the look-at leading; null for the TV ↔ room arc.
   */
  private flightStep(
    view: RoomView,
    pcLeg: 'arriving' | 'departing' | null,
    onArrive: () => void,
  ): (now: number) => boolean {
    const from = cloneViewpoint(this.current);
    let start: number | null = null;
    return (now) => {
      start ??= now;
      const t = Math.min(1, (now - start) / FLIGHT_MS);
      // Read every frame, so a resize mid-flight lands on the new viewport's pose.
      const to = this.poses[view];
      let progress: FlightProgress = uniformProgress(easeInOutCubic(t));
      let path: FlightPath = { lift: FLIGHT_LIFT };
      if (pcLeg) {
        const [pcEye, otherEye] = pcLeg === 'arriving' ? [to.position, from.position] : [from.position, to.position];
        progress = pcLegProgress(t, pcLeg);
        path = { control: craneControl(pcEye, otherEye) };
      }
      this.current = interpolateViewpoint(from, to, progress, path);
      this.apply();
      if (t < 1) return true;
      this.arrive(view, onArrive);
      return false;
    };
  }

  private cutStep(view: RoomView, onArrive: () => void): (now: number) => boolean {
    let start: number | null = null;
    let cut = false;
    return (now) => {
      start ??= now;
      const elapsed = now - start;
      if (!cut && elapsed >= REDUCED_FADE_MS) {
        cut = true;
        this.current = cloneViewpoint(this.poses[view]);
        this.apply();
      }
      const fadeIn = (elapsed - REDUCED_FADE_MS) / REDUCED_FADE_MS;
      this.fade.opacity = cut ? 1 - easeOutCubic(Math.min(1, fadeIn)) : elapsed / REDUCED_FADE_MS;
      if (fadeIn < 1) return true;
      this.fade.opacity = 0;
      this.arrive(view, onArrive);
      return false;
    };
  }

  private arrive(view: RoomView, onArrive: () => void): void {
    this.stopFlight = null;
    this.settledView = view;
    this.parallaxEnabled = view === 'room' && !this.reducedMotion.matches;
    onArrive();
  }

  private refreshPoses(): void {
    const aspect = this.viewport.width / this.viewport.height;
    this.poses.tv = this.computeTvPose();
    this.poses.room = roomViewpoint(aspect);
    this.poses.pc = pcViewpoint(this.pc, aspect);
    if (!this.moving) {
      this.current = cloneViewpoint(this.poses[this.settledView]);
      this.apply();
    }
  }

  private computeTvPose(): Viewpoint {
    const pitch = MathUtils.degToRad(TV_PITCH_DEGREES);
    const direction = this.tv.facing
      .clone()
      .negate()
      .multiplyScalar(Math.cos(pitch))
      .add(new Vector3(0, -Math.sin(pitch), 0));
    const points = boxCorners(this.tv.bounds.min, this.tv.bounds.max);
    const up = new Vector3(0, 1, 0);
    const aspect = this.viewport.width / this.viewport.height;
    let fov = TV_FOV;
    let pose = frameSubject({ points, direction, up, fovY: fov, aspect, region: this.region, margin: TV_MARGIN });
    while (pose.position.distanceTo(pose.target) > TV_MAX_DISTANCE && fov < TV_MAX_FOV) {
      fov += 2;
      pose = frameSubject({ points, direction, up, fovY: fov, aspect, region: this.region, margin: TV_MARGIN });
    }
    return { position: pose.position, target: pose.target, fov };
  }

  private apply(): void {
    const { camera, current } = this;
    camera.position.copy(current.position);
    if (this.parallax.lengthSq() > 0) {
      const forward = current.target.clone().sub(current.position).normalize();
      const right = new Vector3().crossVectors(forward, camera.up).normalize();
      const up = new Vector3().crossVectors(right, forward);
      camera.position
        .addScaledVector(right, this.parallax.x * PARALLAX_RANGE.x)
        .addScaledVector(up, this.parallax.y * PARALLAX_RANGE.y);
    }
    camera.lookAt(current.target);
    if (camera.fov !== current.fov) {
      camera.fov = current.fov;
      camera.updateProjectionMatrix();
    }
  }
}
