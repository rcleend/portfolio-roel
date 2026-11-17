import { Group, MathUtils, type Mesh, type Object3D, type Raycaster, type Vector2, Vector3 } from 'three';
import { FLIGHT_MS, REDUCED_FADE_MS } from '../../camera/CameraRig';
import { projectToPage } from '../../camera/pageProjection';
import { type IdleTask, QUIET } from '../../stage/IdleWork';
import { isSlow } from '../../stage/slowDevice';
import { PowerLed } from '../../tv/PowerLed';
import type { CreateRadioDevice, DevicePick, DeviceTarget, RadioDevice, RadioDeviceContext } from '../deviceContract';
import { discSlots } from '../discLayout';
import type { DeviceParts, DeviceSpec, GeneratedRadioSource } from '../partsProvider';
import type { DeckState, DiscArt, LcdReadout, RadioKey } from '../RadioDeck';
import { AmbientPacer } from './AmbientPacer';
import { Choreography, type DiscSample, discHeirs, type Moment } from './choreography';
import { Discs } from './Discs';
import { radioLayout } from './deckLayout';
import { keyShade, rockerDegrees, sideKeyTravel } from './keyMotion';
import { Lcd } from './Lcd';
import { blinks } from './lcdSegments';
import { LID } from './lidMotion';
import { eventTime, MonotonicClock } from './monotonicClock';

/**
 * The CD player as a device (docs/ROOM.md › The CD player): the lazy `radioDevice` chunk. It takes the generated
 * radio's parts on their pivots (partsProvider.ts), hangs the discs, lights the LCD and the OPR lamp, and runs the
 * choreography: one `loop.animate` step that lives only while something moves, and the idle float, which rides the
 * frames the room draws anyway (posed in every one of them, resting after 6 s). At rest nothing of the device runs.
 */

/** The paused time blinks 500 ms on, 500 off, until 30 s without input, then stays on. */
const BLINK_MS = 500;
const BLINK_FOR_MS = 30_000;
/** The LED of the OPR lamp: smaller than the TV's. */
const LED_SIZE = { lensRadius: 0.0015, haloRadius: 0.01 } as const;
/** How late after its time a moment no frame has fired is fired by a timer. */
const MOMENT_GRACE_MS = 120;
/**
 * At the radio, the prints wait at most this long for an idle period between the float's frames that can hold their
 * next unit (IdleWork's patience): judged by the longest unit run so far none might fit on a fast display, and they
 * would wait for the float to rest, seconds on.
 */
export const WAITED_ON_PATIENCE_MS = 400;
/** Prints that arrive while the visitor watches fade in over the bare silver this long. */
const PRINT_FADE_MS = 260;
/** Cue stereo spread. */
const PAN_WIDTH = 0.6;
/**
 * Below this lid angle (degrees) the well and the lid's underside are hidden, and a seated disc with them. Above
 * the lid's latch rebound, so a lid bouncing off its latch never shows them for a frame (the gap is under 3 mm).
 */
const SEATED_HIDDEN_BELOW_DEGREES = LID.reboundDegrees + 0.3;

/** One unit of the room's background work that runs `work` (on its first and only step). */
// biome-ignore lint/correctness/useYield: a single unit: the whole body is the unit's work.
function* unit(work: () => void): IdleTask {
  work();
}

/**
 * One unit that uploads to the GPU: it waits for a moment where nothing plays (the game on the TV, the computer's
 * live screen), because the main thread cannot time what an upload costs a weak GPU. At the radio its tasks are
 * urgent, and so it may go between the float's frames (IdleWork): a print is small, and it is what the visitor waits
 * for.
 */
function* uploadUnit(work: () => void): IdleTask {
  yield QUIET;
  work();
}

/** Runs `work` in one unit of the room's background work (`kind`) and resolves with its result. */
function inIdle<T>(
  background: RadioDeviceContext['background'],
  work: () => T,
  kind: (work: () => void) => IdleTask = unit,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    background.add(
      kind(() => {
        try {
          resolve(work());
        } catch (error) {
          reject(error);
        }
      }),
    );
  });
}

/** Waits for the generated radio and prepares the device; rejects (the radio stays scenery) without one. */
export const createRadioDevice: CreateRadioDevice = async (host, link) => {
  const { stage } = host;
  const context: RadioDeviceContext = {
    model: host.model,
    scene: stage.scene,
    camera: stage.camera,
    renderer: stage.renderer,
    loop: stage.loop,
    // On the way to the radio (and there) its preparation is what the flight waits for: it may go between the
    // flight's frames, where they leave room for it.
    background: {
      add: (task, options) =>
        host.background.add(task, {
          ...options,
          urgent: () => host.views.view === 'radio',
          // And a flight to the radio waits for it before it sets off: nothing runs while the camera flies.
          flight: (to) => to === 'radio',
        }),
    },
    anisotropy: host.anisotropy,
    software: stage.softwareGpu,
    reducedMotion: link.reducedMotion,
    stage,
    views: host.views,
    pose: () => host.rig.viewpoint('radio'),
    slots: () => discSlots(link.discCount(), stage.size.width / stage.size.height),
    events: link.events,
  };
  const root = new Group();
  root.name = 'RadioDevice';
  context.scene.add(root);
  let source: GeneratedRadioSource | null = null;
  let device: Device | null = null;
  try {
    // The parts are the generated room's, once its light is baked and it is on screen.
    source = (await host.generated.ready) ? host.generated.radio() : null;
    if (!source) throw new Error('The generated room has no CD player');
    const { parts, spec } = source;
    device = await inIdle(context.background, () => new Device(context, root, parts, spec));
    return device;
  } catch (error) {
    // Whatever step failed, the room's radio goes back to exactly what it was: scenery, never broken.
    if (device) device.dispose();
    else source?.parts.restore();
    root.removeFromParent();
    throw error;
  }
};

class Device implements RadioDevice {
  readonly root: Group;
  readonly #choreography: Choreography;
  readonly #discs: Discs;
  readonly #lcd: Lcd;
  readonly #led: PowerLed;
  readonly #pacer: AmbientPacer;
  readonly #sideHolders: Readonly<Record<'previous' | 'next', Object3D>>;
  #stopStep: (() => void) | null = null;
  /** The float rides the room's frames (a paced loop): stops it. */
  #stopRide: (() => void) | null = null;
  #state: DeckState = { loaded: null, transport: 'stopped', lcd: { kind: 'off' } };
  #keyboardAttention: string | null = null;
  #pointerAttention: string | null = null;
  #attention: string | null = null;
  #pointer: Vector2 | null = null;
  /** The pointer gesture the device owns: `acted` once a key's transport ran (a mouse's on the press). */
  #gesture: { target: DeviceTarget; cancelled: boolean; acted: boolean } | null = null;
  #lastInput = Number.NEGATIVE_INFINITY;
  #blinkOn = true;
  #blinkTimer: ReturnType<typeof setTimeout> | null = null;
  #labelWork = new Set<string>();
  #slow: boolean;
  #flightMeasured = false;
  #compiling: Promise<void> | null = null;
  #disposed = false;
  readonly #time = new MonotonicClock();
  /** A reveal asked for before the discs could be drawn: it runs once they can. */
  #revealOnceCompiled = false;
  /**
   * The viewport changed while the discs were put away: re-laid in the room's next idle moment, or on the next
   * approach if that comes first. `#dropRelay` takes the queued idle unit back.
   */
  #relayoutDue = false;
  #dropRelay: (() => void) | null = null;
  /** The shelf's disc ids, in slot order. */
  #discIds: readonly string[] = [];
  /** Fires the storyboard's next moment when no frame does (the tab hidden, the phone locked). */
  #momentTimer: ReturnType<typeof setTimeout> | null = null;
  /** Whether any disc is out of the radio, as last reported to the deck. */
  #discsOut = false;
  /** Whether the LCD shows anything (its power LED follows). */
  #lcdLit = false;
  /** The pointer's attention as last reported to the deck. */
  #pointerAttentionReported: string | null = null;

  readonly #context: RadioDeviceContext;
  readonly #parts: DeviceParts;

  constructor(context: RadioDeviceContext, root: Group, parts: DeviceParts, extras: DeviceSpec) {
    this.#context = context;
    this.#parts = parts;
    this.root = root;
    this.#slow = isSlow(context.software, null);
    this.#choreography = new Choreography({
      reducedFadeMs: REDUCED_FADE_MS,
      eye: () => context.pose().position,
      reducedMotion: () => context.reducedMotion.matches,
      slow: () => this.#slow,
    });
    this.#discs = new Discs(root, context.anisotropy);
    const lcdWidth = this.#lcdRenderWidth(extras);
    // A new readout draws a frame only at the radio: elsewhere the clock ticks on silently and shows on the next frame
    // drawn for another reason (the lava lamp's in the room view), so music playing at the computer costs no frames.
    this.#lcd = new Lcd(root, extras.lcd, lcdWidth, context.anisotropy, {
      animate: (step) => context.loop.animate(step),
      invalidate: () => {
        if (context.views.view === 'radio') context.loop.invalidate();
      },
    });
    this.#led = new PowerLed(
      root,
      { position: new Vector3().fromArray(extras.led.point), facing: new Vector3().fromArray(extras.led.normal) },
      context.loop,
      LED_SIZE,
    );
    const holder = (mesh: Mesh): Object3D => mesh.parent ?? root;
    this.#sideHolders = { previous: holder(parts.previous), next: holder(parts.next) };
    this.#pacer = new AmbientPacer({
      wanted: () => this.#ambientWanted(),
      lastFrame: () => context.loop.lastFrameTime,
      frame: () => {
        context.loop.animate(this.#ambientFrame);
      },
    });
    context.renderer.domElement.addEventListener('webglcontextrestored', this.#onContextRestored);
    context.reducedMotion.addEventListener('change', this.#onMotionPreference);
  }

  get texturePixels(): number {
    return this.#discs.texturePixels + this.#lcd.pixels;
  }

  get ambient(): boolean {
    return this.#pacer.running || this.#stopRide !== null;
  }

  get moving(): boolean {
    return this.#stopStep !== null;
  }

  lidDegrees(now: number): number {
    return this.#choreography.lidDegrees(now);
  }

  setDiscs(discs: readonly DiscArt[]): void {
    const now = this.#clock();
    const ids = discs.map((disc) => disc.id);
    const heirs = discHeirs(this.#discIds, ids, this.#state.loaded);
    this.#discIds = ids;
    const pending = this.#discs.setDiscs(discs, heirs);
    this.#choreography.setDiscs(ids, this.#context.slots(), now, heirs);
    for (const id of pending) this.#prepareLabel(id);
    this.#publishLayout();
    this.#kick();
  }

  setState(state: DeckState): void {
    const previous = this.#state;
    this.#state = state;
    const now = this.#clock();
    this.#choreography.setTransport(state.transport, now);
    if (state.loaded !== previous.loaded) {
      const reduced = this.#context.reducedMotion.matches;
      const seen = this.#context.stage.visible && this.#choreography.atRadio && this.#discs.ready;
      this.#choreography.setLoaded(state.loaded, now, seen);
      // Nothing to watch, or nothing to wait for: the sound starts at once.
      const disc = state.loaded;
      if (disc !== null && (reduced || !seen)) {
        queueMicrotask(() => {
          if (this.#state.loaded === disc) this.#context.events.seated(disc);
        });
      }
      this.#publishLayout();
    }
    this.#updateLcd(now);
    // Away from the radio none of it moves on screen (the lid is shut, the disc inside): the choreography is a
    // function of time, so the next visit samples where this change left it, and the clock the player ticks every
    // second costs no frame at the computer or in the room. A step already running carries on regardless.
    if (this.#context.views.view === 'radio') this.#kick();
    else this.#syncAmbient();
  }

  press(key: RadioKey): void {
    const now = this.#clock();
    this.#input(now);
    this.#choreography.press(key, now, now, { instant: this.#context.reducedMotion.matches });
    this.#kick();
  }

  setKeyboardAttention(disc: string | null): void {
    this.#keyboardAttention = disc;
    if (disc !== null) this.#input(this.#clock());
    this.#updateAttention();
  }

  setPointer(ndc: Vector2 | null): void {
    this.#pointer = ndc ? ndc.clone() : null;
    if (this.#context.views.view !== 'radio' || this.#context.views.moving) return;
    const now = this.#clock();
    if (ndc) this.#input(now);
    this.#choreography.parallax(ndc, now);
    this.#updateTilt(now);
    this.#kick();
  }

  approach(at: number): void {
    const now = this.#clock();
    if (this.#relayoutDue) this.#relay(now);
    this.#input(now);
    this.#compileDiscs();
    this.#choreography.approach(at, now);
    if (!this.#flightMeasured && !this.#context.reducedMotion.matches) this.#measureFlight(at);
    this.#updateLcd(now);
    this.#kick();
  }

  reveal(): void {
    // The discs rise only once they can be drawn: one that rose before its program was ready would appear mid-air.
    if (!this.#discs.ready) {
      this.#revealOnceCompiled = true;
      return;
    }
    this.#choreography.reveal(this.#clock());
    this.#kick();
  }

  conceal(): void {
    this.#revealOnceCompiled = false;
    const now = this.#clock();
    this.#discsOut = false;
    this.#gesture = null;
    this.#pointerAttention = null;
    this.#updateAttention();
    this.#choreography.conceal(now);
    this.#kick();
  }

  relayout(): void {
    const now = this.#clock();
    // Away from the radio with every disc put away, a new viewport moves nothing: a phone turned in the room, at the
    // computer or at the TV costs no re-lay and no frame in its resize handler. The re-lay waits for an idle moment
    // (never a frame in motion), so the click that next sets off for the radio does not pay for it either; an
    // approach that comes first lays the discs out itself.
    if (!this.#choreography.atRadio && !this.#choreography.sample(now).moving) {
      this.#relayoutDue = true;
      this.#dropRelay ??= this.#context.background.add(
        unit(() => {
          this.#dropRelay = null;
          if (this.#relayoutDue && !this.#disposed) this.#relay(this.#clock());
        }),
      );
      return;
    }
    this.#relay(now);
    this.#kick();
  }

  pick(raycaster: Raycaster): DevicePick | null {
    const now = this.#clock();
    const lid = this.#choreography.lidDegrees(now);
    let best: DevicePick | null = null;
    const disc = this.#discs.pick(raycaster, (id) => {
      const phase = this.#choreography.phaseOf(id, now);
      if (phase === 'seated') return lid > 30;
      return phase === 'floating' || phase === 'rising' || phase === 'homing';
    });
    if (disc) {
      const seated = this.#choreography.phaseOf(disc.disc, now) === 'seated';
      best = {
        target: { kind: 'disc', disc: disc.disc, seated },
        hit: { object: disc.object, point: disc.point, uv: null },
        distance: disc.distance,
      };
    }
    const meshes: [Mesh, DeviceTarget][] = [
      [this.#parts.rockerTop, { kind: 'key', key: 'play-pause' }],
      [this.#parts.rockerBottom, { kind: 'key', key: 'stop' }],
      [this.#parts.previous, { kind: 'key', key: 'previous' }],
      [this.#parts.next, { kind: 'key', key: 'next' }],
      [this.#parts.lid, { kind: 'lid' }],
      [this.#parts.lidInner, { kind: 'lid' }],
    ];
    for (const [mesh, target] of meshes) {
      if (!mesh.visible && target.kind === 'lid') continue;
      const hit = raycaster.intersectObject(mesh, false)[0];
      if (hit && (!best || hit.distance < best.distance)) {
        best = { target, hit: { object: mesh, point: hit.point, uv: hit.uv ?? null }, distance: hit.distance };
      }
    }
    return best;
  }

  pointerDown(target: DeviceTarget, pointerType: string): boolean {
    const now = this.#clock();
    this.#input(now);
    if (target.kind === 'key') {
      // The key goes down with the pointer. A mouse press is a user gesture, so the transport acts at once; a touch is
      // one only on its release (media started before it is refused), so a finger's key acts when it lifts.
      this.#choreography.press(target.key, now, null, { instant: this.#context.reducedMotion.matches });
      this.#kick();
      const acted = pointerType === 'mouse';
      this.#gesture = { target, cancelled: false, acted };
      if (acted) this.#context.events.intent({ type: 'press', key: target.key });
      return true;
    }
    if (target.kind === 'disc' && !target.seated) {
      this.#gesture = { target, cancelled: false, acted: false };
      this.#pointerAttention = target.disc;
      this.#updateAttention();
      return true;
    }
    return false;
  }

  pointerMove(target: DeviceTarget | null): void {
    const gesture = this.#gesture;
    if (!gesture) return;
    if (gesture.target.kind === 'key') {
      // A finger sliding off a key it has not acted on lets it go, like a button.
      if (!gesture.acted && !(target?.kind === 'key' && target.key === gesture.target.key)) gesture.cancelled = true;
      return;
    }
    if (gesture.target.kind !== 'disc') return;
    const still = target?.kind === 'disc' && target.disc === gesture.target.disc;
    if (!still && !gesture.cancelled) {
      // Sliding off the disc cancels the pick.
      gesture.cancelled = true;
      this.#pointerAttention = null;
      this.#updateAttention();
    }
  }

  pointerUp(cancelled: boolean): void {
    const gesture = this.#gesture;
    this.#gesture = null;
    if (!gesture) return;
    const now = this.#clock();
    if (gesture.target.kind === 'key') {
      this.#choreography.release(gesture.target.key, now);
      this.#kick();
      // Inside the release: the app may start the music in this very gesture.
      if (!gesture.acted && !gesture.cancelled && !cancelled) {
        this.#context.events.intent({ type: 'press', key: gesture.target.key });
      }
      return;
    }
    if (cancelled && gesture.target.kind === 'disc') {
      this.#pointerAttention = null;
      this.#updateAttention();
      return;
    }
    if (gesture.target.kind === 'disc' && !gesture.cancelled) {
      // The disc leaves the pointer for the player: its attention (and the app's caption) go with the gesture; the
      // next pointer move finds whatever is under the pointer now.
      this.#pointerAttention = null;
      this.#updateAttention();
      // Inside the pointer event: the app may start the music in this very gesture.
      this.#context.events.intent({ type: 'pick', disc: gesture.target.disc });
    }
  }

  activate(target: DeviceTarget): void {
    if (target.kind !== 'disc' || !target.seated) return;
    // A click on the disc in the well: ▷II presses itself and the transport toggles.
    const now = this.#clock();
    this.#input(now);
    this.#choreography.press('play-pause', now, now, { instant: this.#context.reducedMotion.matches });
    this.#kick();
    this.#context.events.intent({ type: 'press', key: 'play-pause' });
  }

  hover(target: DeviceTarget | null): void {
    const disc = target?.kind === 'disc' && !target.seated ? target.disc : null;
    if (disc !== null) this.#input(this.#clock());
    if (disc === this.#pointerAttention) {
      this.#updateTilt(this.#clock());
      return;
    }
    this.#pointerAttention = disc;
    this.#updateAttention();
  }

  dispose(): void {
    this.#disposed = true;
    this.#dropRelay?.();
    this.#stopStep?.();
    this.#stopStep = null;
    this.#pacer.stop();
    this.#stopRide?.();
    this.#stopRide = null;
    if (this.#blinkTimer !== null) clearTimeout(this.#blinkTimer);
    if (this.#momentTimer !== null) clearTimeout(this.#momentTimer);
    this.#context.reducedMotion.removeEventListener('change', this.#onMotionPreference);
    this.#discs.dispose();
    this.#lcd.dispose();
    this.#led.dispose();
    this.#context.renderer.domElement.removeEventListener('webglcontextrestored', this.#onContextRestored);
    this.#parts.restore();
    this.root.removeFromParent();
  }

  /** Where the discs and keys sit on the page at the settled pose, for the app's buttons and captions. */
  #relay(now: number): void {
    this.#relayoutDue = false;
    this.#dropRelay?.();
    this.#dropRelay = null;
    this.#choreography.relayout(this.#context.slots(), now);
    this.#publishLayout();
  }

  #publishLayout(): void {
    const { stage, events } = this.#context;
    const ids = this.#discIds;
    events.layout(
      radioLayout(
        ids,
        this.#state.loaded,
        this.#context.slots(),
        this.#context.pose(),
        stage.size,
        stage.size.pixelRatio,
      ),
    );
  }

  /**
   * A frame's time, or with none given the time of an event handled now (`eventTime`), through the device's clock: a
   * frame never draws earlier than an event already handled.
   */
  #clock(frame?: number): number {
    return this.#time.at(frame ?? eventTime(performance.now(), this.#context.loop.lastFrameTime));
  }

  /** Keeps the frame step alive while anything moves; it stops itself when everything rests. */
  #kick(): void {
    if (this.#disposed) return;
    if (this.#stopStep === null) {
      const step = (now: number): boolean => {
        const moving = this.#frame(this.#clock(now));
        if (!moving) this.#stopStep = null;
        return moving;
      };
      this.#stopStep = this.#context.loop.animate(step);
    }
    this.#syncAmbient();
    this.#armMoments();
  }

  /**
   * Frames fire the storyboard's moments; when frames stop (the tab hidden, the phone locked mid-insert), a timer fires
   * them instead, so the disc's seat still starts its music. It draws nothing, and normally finds them fired.
   */
  #armMoments(): void {
    if (this.#momentTimer !== null) clearTimeout(this.#momentTimer);
    this.#momentTimer = null;
    const next = this.#choreography.nextMoment();
    if (next === null || this.#disposed) return;
    this.#momentTimer = setTimeout(
      () => {
        this.#momentTimer = null;
        for (const moment of this.#choreography.advance(this.#clock())) this.#fire(moment);
        this.#armMoments();
      },
      Math.max(0, next - this.#clock()) + MOMENT_GRACE_MS,
    );
  }

  readonly #ambientFrame = (now: number): boolean => {
    this.#frame(this.#clock(now));
    return false;
  };

  /**
   * Starts or stops the float to match `#ambientWanted()`. A room that draws frames of its own accord (the generated
   * room's sixty a second, `RenderLoop.pace`) carries it: the discs are posed in every frame drawn and no frame is
   * asked for. The pacer's thirty a second are for a loop that draws on demand only: beside a paced loop its frames
   * would never come due (every frame of the room's restarts its grid), and the discs would stand still in sixty
   * frames a second and jump whenever something else moved them.
   */
  #syncAmbient(): void {
    const { loop } = this.#context;
    if (!loop.paced) {
      this.#stopRide?.();
      this.#stopRide = null;
      this.#pacer.sync();
      return;
    }
    this.#pacer.stop();
    if (this.#ambientWanted()) this.#stopRide ??= loop.ride(this.#rideFrame);
    else {
      this.#stopRide?.();
      this.#stopRide = null;
    }
  }

  /** A frame the room draws while the discs float: their pose at its time, unless the choreography's step set it. */
  readonly #rideFrame = (now: number): boolean => {
    // The step runs first and poses everything (and looks after the float itself, `#frame`).
    if (this.#stopStep === null) this.#frame(this.#clock(now));
    else this.#syncAmbient();
    return this.#stopRide !== null;
  };

  /** One frame: fire the moments that came due, then pose every part. Returns whether anything still moves. */
  #frame(now: number): boolean {
    for (const moment of this.#choreography.advance(now)) this.#fire(moment);
    const sample = this.#choreography.sample(now);
    this.#apply(sample.lid, sample.discs, sample.keys);
    this.#updateLcd(now);
    this.#syncAmbient();
    this.#reportShelf(now);
    return sample.moving;
  }

  /** Tells the handle when the shelf is up, and when it no longer is. */
  #reportShelf(now: number): void {
    const out = this.#choreography.discsOut(now);
    if (out === this.#discsOut) return;
    this.#discsOut = out;
    this.#context.events.discsOut(out);
  }

  #apply(lid: number, discs: readonly DiscSample[], keys: ReturnType<Choreography['sample']>['keys']): void {
    const parts = this.#parts;
    parts.lidPivot.rotation.x = -MathUtils.degToRad(lid);
    const open = lid > SEATED_HIDDEN_BELOW_DEGREES;
    parts.well.visible = open;
    parts.wellFloor.visible = !open;
    parts.lidInner.visible = open;
    this.#discs.apply(discs, this.#attention, (sample) => sample.phase === 'seated' && !open);
    const rocker = keys.rockerKey ? rockerDegrees(keys.rockerKey, keys.rockerTravel) : 0;
    parts.rockerPivot.rotation.x = -MathUtils.degToRad(rocker);
    this.#sideHolders.previous.position.copy(parts.keyAxis).multiplyScalar(sideKeyTravel(keys.previous));
    this.#sideHolders.next.position.copy(parts.keyAxis).multiplyScalar(sideKeyTravel(keys.next));
    const shade = (face: RadioKey, pressed: RadioKey | null, travel: number) => keyShade(face, pressed, travel);
    parts.keyMaterials.rockerTop.color.setScalar(shade('play-pause', keys.rockerKey, keys.rockerTravel));
    parts.keyMaterials.rockerBottom.color.setScalar(shade('stop', keys.rockerKey, keys.rockerTravel));
    parts.keyMaterials.previous.color.setScalar(shade('previous', 'previous', keys.previous));
    parts.keyMaterials.next.color.setScalar(shade('next', 'next', keys.next));
  }

  #fire(moment: Moment): void {
    if (moment.seated && moment.disc !== undefined) {
      if (this.#state.loaded === moment.disc) this.#context.events.seated(moment.disc);
      return;
    }
    if (!moment.cue) return;
    if (this.#context.reducedMotion.matches && !STATE_CUES.has(moment.cue)) return;
    const event = {
      cue: moment.cue,
      pan: this.#panOf(moment),
      ...(moment.order === undefined ? {} : { order: moment.order }),
    };
    this.#context.events.cue(event);
  }

  /** Stereo position from the moving part's place on screen. */
  #panOf(moment: Moment): number {
    let point: Vector3 | null = null;
    if (moment.disc !== undefined) point = this.#discs.positionOf(moment.disc);
    if (!point && moment.part === 'keys') point = this.#parts.rockerPivot.position;
    if (!point) point = this.#parts.lidPivot.getWorldPosition(new Vector3()).add(new Vector3(0, 0.08, 0.06));
    const ndc = point.clone().project(this.#context.camera);
    return MathUtils.clamp(ndc.x, -1, 1) * PAN_WIDTH;
  }

  /** The readout the LCD shows: off reads as "no dISC" while the visitor is (or heads) at the radio. */
  #displayed(now: number): LcdReadout {
    const readout = this.#state.lcd;
    const awake = this.#choreography.atRadio || this.#choreography.lidDegrees(now) > 0;
    return readout.kind === 'off' && awake ? { kind: 'no-disc' } : readout;
  }

  #updateLcd(now: number): void {
    const readout = this.#displayed(now);
    const reduced = this.#context.reducedMotion.matches;
    const wasLit = this.#lcdLit;
    this.#lcd.show(readout, this.#blinkOn || !this.#blinking(now), reduced);
    this.#lcdLit = readout.kind !== 'off';
    if (this.#lcdLit !== wasLit) {
      this.#led.set(this.#lcdLit);
      if (this.#lcdLit && !wasLit && this.#choreography.atRadio) this.#context.events.cue({ cue: 'power-on', pan: 0 });
    }
    this.#syncBlink(now);
  }

  /** A paused time blinks while the visitor is at the radio and attentive (30 s), never in the slow tier or calm. */
  #blinking(now: number): boolean {
    return (
      blinks(this.#state.lcd) &&
      this.#choreography.atRadio &&
      now - this.#lastInput < BLINK_FOR_MS &&
      !this.#slow &&
      !this.#context.reducedMotion.matches
    );
  }

  #syncBlink(now: number): void {
    const wanted = this.#blinking(now);
    if (!wanted) {
      if (this.#blinkTimer !== null) clearTimeout(this.#blinkTimer);
      this.#blinkTimer = null;
      if (!this.#blinkOn) {
        this.#blinkOn = true;
        this.#lcd.show(this.#displayed(now), true, this.#context.reducedMotion.matches);
      }
      return;
    }
    if (this.#blinkTimer !== null) return;
    this.#blinkTimer = setTimeout(() => {
      this.#blinkTimer = null;
      this.#blinkOn = !this.#blinkOn;
      const at = this.#clock();
      this.#lcd.show(this.#displayed(at), this.#blinkOn || !this.#blinking(at), this.#context.reducedMotion.matches);
      this.#syncBlink(at);
    }, BLINK_MS);
  }

  #input(now: number): void {
    this.#lastInput = now;
    this.#choreography.activity(now);
    this.#syncAmbient();
  }

  #updateAttention(): void {
    const next = this.#pointerAttention ?? this.#keyboardAttention;
    // The handle hears of the pointer's disc only (it combines it with the keyboard's itself).
    if (this.#pointerAttention !== this.#pointerAttentionReported) {
      this.#pointerAttentionReported = this.#pointerAttention;
      this.#context.events.pointerAttention(this.#pointerAttention);
    }
    if (next === this.#attention) return;
    this.#attention = next;
    const now = this.#clock();
    this.#choreography.attend(next, now);
    this.#updateTilt(now);
    this.#kick();
  }

  /** The pointer's offset from the attended disc's centre, in disc radii on screen, tilts that disc (mouse only). */
  #updateTilt(now: number): void {
    const id = this.#attention;
    if (id === null || id !== this.#pointerAttention || !this.#pointer) return;
    const centre = this.#discs.positionOf(id);
    if (!centre) return;
    const projected = centre.clone().project(this.#context.camera);
    const edge = centre
      .clone()
      .add(new Vector3(0.06, 0, 0))
      .project(this.#context.camera);
    const radius = Math.max(1e-3, Math.abs(edge.x - projected.x));
    this.#choreography.tilt((this.#pointer.x - projected.x) / radius, (this.#pointer.y - projected.y) / radius, now);
    this.#kick();
  }

  #ambientWanted(): boolean {
    const { views, stage, reducedMotion } = this.#context;
    if (views.view !== 'radio' || views.moving || !stage.visible || reducedMotion.matches || this.#slow) return false;
    return this.#choreography.ambientAt(this.#clock());
  }

  #prepareLabel(id: string): void {
    if (this.#labelWork.has(id)) return;
    this.#labelWork.add(id);
    // A print is 384² or so, a millisecond or two: at the radio it may go between the float's (or the flight's) frames,
    // so prints that come late are up within moments rather than once the radio has come to rest.
    this.#context.background.add(
      uploadUnit(() => {
        this.#labelWork.delete(id);
        if (this.#disposed) return;
        this.#discs.prepareLabel(id, this.#context.renderer);
        // The prints show together once the last is up: at the radio they fade in over the bare silver.
        if (this.#labelWork.size === 0 && this.#discs.labelsWaiting) this.#showLabels();
      }),
      { patienceMs: WAITED_ON_PATIENCE_MS },
    );
  }

  #showLabels(): void {
    const { views, stage, reducedMotion, loop } = this.#context;
    const fade = views.view === 'radio' && stage.visible && !reducedMotion.matches;
    const ids = this.#discs.showLabels(fade ? 0 : 1);
    loop.invalidate();
    if (!fade) return;
    let start: number | null = null;
    loop.animate((now) => {
      start ??= now;
      const u = Math.min(1, (now - start) / PRINT_FADE_MS);
      this.#discs.setPrint(ids, u * u * (3 - 2 * u));
      return u < 1 && !this.#disposed;
    });
  }

  board(): Promise<void> {
    this.#compileDiscs();
    return (this.#compiling ?? Promise.resolve()).then(() => {
      if (!this.#disposed) this.#context.stage.warm([...this.#discs.group.children]);
    });
  }

  /**
   * Compiles the disc program as the camera is about to leave for the radio, never before, so other views keep their
   * program count; for the target frames draw into (compiled for the screen it was a program nothing drew with, and
   * the one that did draw was compiled in the flight's frame that first showed a disc).
   */
  #compileDiscs(): void {
    if (this.#compiling) return;
    this.#compiling = this.#discs.compile(this.#context.stage).then(
      () => {
        if (this.#revealOnceCompiled && !this.#disposed) {
          this.#revealOnceCompiled = false;
          this.reveal();
        }
        this.#kick();
      },
      (error: unknown) => console.warn('The CD shader failed to compile', error),
    );
  }

  /** Samples the first flight to the radio's frame times: a slow machine gets the slow tier for the page load. */
  #measureFlight(at: number): void {
    this.#flightMeasured = true;
    const frames: number[] = [];
    const end = at + FLIGHT_MS;
    this.#context.loop.animate((now) => {
      frames.push(now);
      if (now < end && this.#context.views.moving) return true;
      if (isSlow(false, frames)) {
        this.#slow = true;
        this.#syncAmbient();
      }
      return false;
    });
  }

  /** The context was lost and is back: three uploads the textures again. */
  readonly #onContextRestored = (): void => {
    this.#context.loop.invalidate();
  };

  readonly #onMotionPreference = (): void => {
    this.#syncAmbient();
    this.#kick();
  };

  #lcdRenderWidth(extras: DeviceSpec): number {
    const { lcd } = extras;
    const page = projectToPage(
      [new Vector3(lcd.min[0], lcd.min[1], lcd.z), new Vector3(lcd.max[0], lcd.max[1], lcd.z)],
      this.#context.pose(),
      this.#context.stage.size,
    );
    const [a, b] = page;
    return Math.abs((b?.x ?? 0) - (a?.x ?? 0)) * this.#context.stage.size.pixelRatio;
  }
}

/** The cues that still sound under reduced motion: changes of state, not motion. */
const STATE_CUES = new Set(['lid-unlatch', 'lid-latch', 'disc-seat', 'key-down', 'key-up']);
