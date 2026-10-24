import { MathUtils, type PerspectiveCamera, Vector2, Vector3 } from 'three';
import { easeInOutCubic, easeOutCubic } from '../motion/easing';
import { type PcFramingModel, pcViewpoint } from '../pc/pcFraming';
import { discSlots } from '../radio/discLayout';
import { type ControlInsets, type RadioFramingModel, radioViewpoint } from '../radio/radioFraming';
import type { RenderLoop } from '../stage/RenderLoop';
import type { ViewportSize } from '../stage/RoomStage';
import type { TvModel } from '../tv/tvModel';
import type { RoomView } from '../viewState';
import {
  cloneViewpoint,
  craneControl,
  type DeviceLeg,
  deviceLegProgress,
  type FlightPath,
  type FlightProgress,
  flightShape,
  interpolateViewpoint,
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

/** One motion language: every flight, the computer's and the radio's included, takes the same time. */
export const FLIGHT_MS = 1100;
const FLIGHT_LIFT = 0.16;
/** Under reduced motion a move is a fade to black this long, a cut, and a fade back as long. */
export const REDUCED_FADE_MS = 140;

const PARALLAX_RANGE = new Vector2(0.06, 0.035);
const PARALLAX_RATE = 5;

/**
 * Owns the TV, room, computer and radio viewpoints, the flights between them and a subtle pointer
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
  private radioDiscs = 5;
  private controlInsets: ControlInsets = NO_INSETS;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly loop: RenderLoop,
    private readonly tv: TvModel,
    private readonly pc: PcFramingModel,
    private readonly reducedMotion: MediaQueryList,
    private readonly fade: ScreenFade,
    /** Null when the room has no radio: its view then rests where the room view does. */
    private readonly radio: RadioFramingModel | null = null,
  ) {
    const room = roomViewpoint(1);
    this.poses = { tv: this.computeTvPose(), room, pc: pcViewpoint(pc, 1), radio: this.computeRadioPose() ?? room };
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

  /** The radio view frames every disc slot clear of the app's controls: re-frame when either changes. */
  setRadioFraming(discs: number, insets: ControlInsets): void {
    this.radioDiscs = discs;
    this.controlInsets = insets;
    this.refreshPoses();
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
    const from = this.moving ? null : this.settledView;
    this.stopFlight?.();
    this.parallaxEnabled = false;
    this.setParallaxPointer(null);
    const { lead, crane } = flightShape(from, view);
    const step = this.reducedMotion.matches
      ? this.cutStep(view, onArrive)
      : this.flightStep(view, lead, crane, onArrive);
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
   * @param leg 'arriving' or 'departing' for a flight to a device view (the computer, the radio) or from a settled
   *   one: the look-at leads; null for the TV ↔ room motion.
   * @param crane which end of the flight is the computer, whose legs crane over the chair; null for the house arc.
   */
  private flightStep(
    view: RoomView,
    leg: DeviceLeg | null,
    crane: DeviceLeg | null,
    onArrive: () => void,
  ): (now: number) => boolean {
    const from = cloneViewpoint(this.current);
    let start: number | null = null;
    return (now) => {
      start ??= now;
      const t = Math.min(1, (now - start) / FLIGHT_MS);
      // Read every frame, so a resize mid-flight lands on the new viewport's pose.
      const to = this.poses[view];
      const progress: FlightProgress = leg ? deviceLegProgress(t, leg) : uniformProgress(easeInOutCubic(t));
      let path: FlightPath = { lift: FLIGHT_LIFT };
      if (crane) {
        const [pcEye, otherEye] = crane === 'arriving' ? [to.position, from.position] : [from.position, to.position];
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
    this.poses.radio = this.computeRadioPose() ?? this.poses.room;
    if (!this.moving) {
      this.current = cloneViewpoint(this.poses[this.settledView]);
      this.apply();
    }
  }

  private computeRadioPose(): Viewpoint | null {
    if (!this.radio) return null;
    const { width, height } = this.viewport;
    const { position, target, fov } = radioViewpoint(
      this.radio,
      discSlots(this.radioDiscs, width / height),
      { width, height },
      this.controlInsets,
    );
    return { position, target, fov };
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
