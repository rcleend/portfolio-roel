import { type PerspectiveCamera, Vector2, Vector3 } from 'three';
import { easeInOutCubic, easeOutCubic } from '../motion/easing';
import { type PcFramingModel, pcViewpoint } from '../pc/pcFraming';
import type { RenderLoop } from '../stage/RenderLoop';
import type { ViewportSize } from '../stage/RoomStage';
import { type TvFramingModel, tvViewpoint } from '../tv/tvFraming';
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
import { FULL_VIEWPORT, type NdcRegion, regionFromInsets } from './framing';
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

/** The radio's resting pose for a viewport (radioFraming.ts › radioPoseSolver). */
export type RadioPoseSolver = (viewport: ViewportSize) => Viewpoint;

/** One motion language: every flight, the computer's and the radio's included, takes the same time. */
export const FLIGHT_MS = 1100;
const FLIGHT_LIFT = 0.16;
/** Under reduced motion a move is a fade to black this long, a cut, and a fade back as long. */
export const REDUCED_FADE_MS = 140;
/** The longest a cut stays black waiting for what it cuts to (the radio's device on a first visit). */
export const MAX_CUT_HOLD_MS = 1200;

export interface FlightOptions {
  /** Under reduced motion, hold the black after the cut while this says so (at most MAX_CUT_HOLD_MS). */
  readonly holdCut?: () => boolean;
}

const PARALLAX_RANGE = new Vector2(0.06, 0.035);
const PARALLAX_RATE = 5;

/**
 * Owns the TV, room, computer and radio viewpoints, the flights between them and a subtle pointer
 * parallax in the room view.
 */
export class CameraRig {
  /** The TV, room and computer poses for the current viewport; the radio's is solved when first needed. */
  private readonly poses: Record<Exclude<RoomView, 'radio'>, Viewpoint>;
  /** The radio's pose for the current viewport, disc count and control insets; null until asked for again. */
  private radioPose: Viewpoint | null = null;
  private current: Viewpoint;
  private settledView: RoomView = 'tv';
  private region: NdcRegion = FULL_VIEWPORT;
  private insets: FramingInsets = NO_INSETS;
  private viewport: ViewportSize = { width: 1, height: 1, pixelRatio: 1 };
  private stopFlight: (() => void) | null = null;
  /** The current cut holds its black (see `veiled`). */
  private holdingBlack = false;
  private readonly parallax = new Vector2();
  private readonly parallaxGoal = new Vector2();
  private parallaxActive = false;
  private parallaxEnabled = false;
  /** Solves the radio's pose; set by the radio's deck once its code has loaded (null: the room's pose). */
  private radioSolver: RadioPoseSolver | null = null;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly loop: RenderLoop,
    private readonly tv: TvFramingModel,
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

  /** A reduced-motion cut holds its black: the camera is at its destination and nothing on screen moves. */
  get veiled(): boolean {
    return this.moving && this.holdingBlack;
  }

  /** The pose the camera rests at in `view`, for the current viewport. */
  viewpoint(view: RoomView): Viewpoint {
    return cloneViewpoint(this.pose(view));
  }

  resize(viewport: ViewportSize): void {
    this.viewport = viewport;
    this.region = regionFromInsets(viewport, this.insets);
    this.refreshPoses();
  }

  setFramingInsets(insets: FramingInsets): void {
    this.insets = insets;
    this.region = regionFromInsets(this.viewport, insets);
    // Only the TV's framing keeps clear of overlays; the room and the computer use the whole viewport.
    this.poses.tv = this.computeTvPose();
    this.holdPose();
  }

  /**
   * How the radio view frames its disc slots clear of the app's controls, from the radio's deck (its framing code
   * leaves the first load): re-set when the disc count or the controls change. Null rests it at the room's pose.
   */
  setRadioFraming(solve: RadioPoseSolver | null): void {
    this.radioSolver = solve;
    this.radioPose = null;
    if (this.settledView === 'radio') this.holdPose();
  }

  /** Places the camera at `view` immediately. */
  jumpTo(view: RoomView): void {
    this.stopFlight?.();
    this.stopFlight = null;
    this.settledView = view;
    this.current = cloneViewpoint(this.pose(view));
    this.apply();
    this.loop.invalidate();
  }

  /** Flies to `view` (or cuts, under reduced motion) and calls `onArrive` once there. */
  goTo(view: RoomView, onArrive: () => void, options: FlightOptions = {}): void {
    const from = this.moving ? null : this.settledView;
    this.stopFlight?.();
    this.holdingBlack = false;
    this.parallaxEnabled = false;
    this.setParallaxPointer(null);
    const { lead, crane } = flightShape(from, view);
    const step = this.reducedMotion.matches
      ? this.cutStep(view, onArrive, options.holdCut)
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
    let stood = false;
    let start: number | null = null;
    return (now) => {
      // The first frame shows the camera where it stands, and the clock starts with the second. What the click itself
      // set going falls into that first frame (the page's interface takes the change of view: its style, its layout
      // and its paint, 22 ms of a slow phone's main thread), so the frame after it comes late however little the room
      // draws; with the clock already running that was the flight's first step, a late one (docs/ROOM.md › Flights).
      if (!stood) {
        stood = true;
        return true;
      }
      start ??= now;
      const t = Math.min(1, (now - start) / FLIGHT_MS);
      // Read every frame, so a resize mid-flight lands on the new viewport's pose.
      const to = this.pose(view);
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

  /** A fade to black, the cut (held black while `hold` says so, within MAX_CUT_HOLD_MS) and a fade back. */
  private cutStep(view: RoomView, onArrive: () => void, hold?: () => boolean): (now: number) => boolean {
    let start: number | null = null;
    let cut = false;
    let fadeInFrom = REDUCED_FADE_MS;
    let holding = hold !== undefined;
    return (now) => {
      start ??= now;
      const elapsed = now - start;
      if (!cut && elapsed >= REDUCED_FADE_MS) {
        cut = true;
        // The fade back starts at the cut, so the frame that cuts is black even when it comes late (a slow frame).
        fadeInFrom = elapsed;
        this.current = cloneViewpoint(this.pose(view));
        this.apply();
      }
      if (cut && holding) {
        // Black until what the cut shows is ready; once the fade back starts it never holds again.
        if (hold?.() && elapsed < REDUCED_FADE_MS + MAX_CUT_HOLD_MS) {
          fadeInFrom = elapsed;
          this.fade.opacity = 1;
          this.holdingBlack = true;
          return true;
        }
        holding = false;
        this.holdingBlack = false;
      }
      const fadeIn = (elapsed - fadeInFrom) / REDUCED_FADE_MS;
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
    this.radioPose = null;
    this.holdPose();
  }

  /** A camera at rest takes up its view's new pose; a flight reads its destination every frame. */
  private holdPose(): void {
    if (this.moving) return;
    this.current = cloneViewpoint(this.pose(this.settledView));
    this.apply();
  }

  /**
   * The pose `view` rests at. The radio's is solved on first use after a change (a few milliseconds, many on a slow
   * phone), so the first frame, a resize away from the radio and the app's controls never pay for it.
   */
  private pose(view: RoomView): Viewpoint {
    if (view !== 'radio') return this.poses[view];
    this.radioPose ??= this.computeRadioPose() ?? this.poses.room;
    return this.radioPose;
  }

  private computeRadioPose(): Viewpoint | null {
    if (!this.radioSolver) return null;
    const { position, target, fov } = this.radioSolver(this.viewport);
    return { position, target, fov };
  }

  private computeTvPose(): Viewpoint {
    return tvViewpoint(this.tv, this.viewport, this.region);
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
