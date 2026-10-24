import { Group, MathUtils, type Mesh, type Object3D, type Raycaster, type Texture, type Vector2, Vector3 } from 'three';
import { FLIGHT_MS, REDUCED_FADE_MS } from '../../camera/CameraRig';
import { boxCorners } from '../../camera/framing';
import { projectToPage } from '../../camera/pageProjection';
import type { IdleTask } from '../../stage/IdleWork';
import { PowerLed } from '../../tv/PowerLed';
import type { CreateRadioDevice, DevicePick, DeviceTarget, RadioDevice, RadioDeviceContext } from '../deviceContract';
import { discSlots } from '../discLayout';
import type { DeckState, DiscArt, LcdReadout, RadioKey } from '../RadioDeck';
import { deviceMemory, rendererName, saveData } from '../rendererInfo';
import { AmbientPacer } from './AmbientPacer';
import { Choreography, type DiscSample, type Moment } from './choreography';
import { assembleParts, type CloseUpExtras, loadSkin, type RadioParts, skinTexture } from './closeUpAsset';
import { Discs } from './Discs';
import { radioLayout } from './deckLayout';
import { isSlow, wantsSkin } from './deviceTier';
import { keyShade, rockerDegrees, sideKeyTravel } from './keyMotion';
import { Lcd } from './Lcd';
import { blinks } from './lcdSegments';

/**
 * The CD player as a device (docs/ROOM.md › The CD player): the lazy `radioDevice` chunk. It cuts the lid and keys
 * out of the baked radio, hangs the close-up's parts and the discs, lights the LCD and the OPR lamp, and runs the
 * choreography: one `loop.animate` step that lives only while something moves, and an ambient pacer for the idle
 * float (≤ 30 frames a second, resting after 6 s). At rest nothing runs: the radio view draws no frames.
 */

const CLOSEUP_FILE = 'radio-closeup.glb';
const SKIN_FILE = 'radio-skin-2k.webp';
/** The paused time blinks 500 ms on, 500 off, until 30 s without input, then stays on. */
const BLINK_MS = 500;
const BLINK_FOR_MS = 30_000;
/** The LED of the OPR lamp: smaller than the TV's. */
const LED_SIZE = { lensRadius: 0.0015, haloRadius: 0.01 } as const;
/** Cue stereo spread. */
const PAN_WIDTH = 0.6;
/** Spin above which a seated disc counts as playing for picking purposes. */
const SEATED_HIDDEN_BELOW_DEGREES = 0.5;

/** One unit of the room's background work that runs `work` (on its first and only step). */
// biome-ignore lint/correctness/useYield: a single unit: the whole body is the unit's work.
function* unit(work: () => void): IdleTask {
  work();
}

/** Runs `work` in one unit of the room's background work and resolves with its result. */
function inIdle<T>(background: RadioDeviceContext['background'], work: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    background.add(
      unit(() => {
        try {
          resolve(work());
        } catch (error) {
          reject(error);
        }
      }),
    );
  });
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.arrayBuffer();
}

/** Loads, checks and prepares the device; rejects (the radio stays scenery) if anything does not fit. */
export const createRadioDevice: CreateRadioDevice = async (host, link) => {
  const { stage } = host;
  const context: RadioDeviceContext = {
    model: host.model,
    scene: stage.scene,
    camera: stage.camera,
    renderer: stage.renderer,
    loop: stage.loop,
    background: host.background,
    loader: host.loader,
    assetBaseUrl: host.assetBaseUrl,
    anisotropy: host.anisotropy,
    reducedMotion: link.reducedMotion,
    stage,
    views: host.views,
    pose: () => host.rig.viewpoint('radio'),
    slots: () => discSlots(link.discCount(), stage.size.width / stage.size.height),
    events: link.events,
  };
  const base = context.assetBaseUrl;
  const skinWanted = wantsSkin({
    bodyWidthCss: bodyWidthAtRadio(context),
    pixelRatio: context.stage.size.pixelRatio,
    deviceMemory: deviceMemory(),
    saveData: saveData(),
    slow: isSlow(rendererName(context.renderer.getContext()), null),
  });
  // The skin downloads and decodes beside the close-up; it is uploaded only once the visitor reaches for the radio.
  const skin = skinWanted ? loadSkin(new URL(SKIN_FILE, base).href).catch(() => null) : Promise.resolve(null);
  const buffer = await fetchBuffer(new URL(CLOSEUP_FILE, base).href);
  const gltf = await await inIdle(context.background, () => context.loader.parseAsync(buffer, base));
  const meshes = new Map(context.model.meshes.map((mesh) => [mesh.name, mesh]));
  const root = new Group();
  root.name = 'RadioDevice';
  context.scene.add(root);
  try {
    const parts = await inIdle(context.background, () => assembleParts(gltf, meshes, root));
    const device = await inIdle(
      context.background,
      () => new Device(context, root, parts, gltf.scene.userData as CloseUpExtras, skin),
    );
    if (parts.atlas) {
      const atlas = parts.atlas;
      await inIdle(context.background, () => context.renderer.initTexture(atlas));
    }
    return device;
  } catch (error) {
    root.removeFromParent();
    throw error;
  }
};

/** The radio body's width on the page at the radio pose (CSS px). */
function bodyWidthAtRadio(context: RadioDeviceContext): number {
  const { bodyBounds } = context.model;
  const corners = projectToPage(boxCorners(bodyBounds.min, bodyBounds.max), context.pose(), context.stage.size);
  const xs = corners.map((point) => point.x);
  return Math.max(...xs) - Math.min(...xs);
}

class Device implements RadioDevice {
  readonly root: Group;
  readonly #choreography: Choreography;
  readonly #discs: Discs;
  readonly #lcd: Lcd;
  readonly #led: PowerLed;
  readonly #pacer: AmbientPacer;
  readonly #sideHolders: Readonly<Record<'previous' | 'next', Object3D>>;
  #stopStep: (() => void) | null = null;
  #state: DeckState = { loaded: null, transport: 'stopped', lcd: { kind: 'off' } };
  #keyboardAttention: string | null = null;
  #pointerAttention: string | null = null;
  #attention: string | null = null;
  #pointer: Vector2 | null = null;
  #gesture: { target: DeviceTarget; cancelled: boolean } | null = null;
  #lastInput = Number.NEGATIVE_INFINITY;
  #blinkOn = true;
  #blinkTimer: ReturnType<typeof setTimeout> | null = null;
  #labelWork = new Set<string>();
  #skinShown = false;
  #skinIntent = false;
  #skinBitmap: ImageBitmap | null = null;
  #skinPixels = 0;
  #slow: boolean;
  #flightMeasured = false;
  #compiling: Promise<void> | null = null;
  #disposed = false;

  readonly #context: RadioDeviceContext;
  readonly #parts: RadioParts;

  constructor(
    context: RadioDeviceContext,
    root: Group,
    parts: RadioParts,
    extras: CloseUpExtras,
    skin: Promise<ImageBitmap | null>,
  ) {
    this.#context = context;
    this.#parts = parts;
    this.root = root;
    this.#slow = isSlow(rendererName(context.renderer.getContext()), null);
    this.#choreography = new Choreography({
      reducedFadeMs: REDUCED_FADE_MS,
      eye: () => context.pose().position,
      reducedMotion: () => context.reducedMotion.matches,
      slow: () => this.#slow,
    });
    this.#discs = new Discs(root, context.anisotropy);
    const lcdWidth = this.#lcdRenderWidth(extras);
    this.#lcd = new Lcd(root, extras.lcd, lcdWidth, context.anisotropy, context.loop);
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
      now: () => performance.now(),
      frame: () => {
        context.loop.animate(this.#ambientFrame);
      },
    });
    // Primary touch devices cannot hover: the skin is prepared at idle instead of on intent.
    if (window.matchMedia('(hover: none)').matches) this.#skinIntent = true;
    skin.then((bitmap) => {
      if (this.#disposed) {
        bitmap?.close();
        return;
      }
      this.#skinBitmap = bitmap;
      this.#maybeUploadSkin();
    });
    context.reducedMotion.addEventListener('change', this.#onMotionPreference);
  }

  get texturePixels(): number {
    return this.#discs.texturePixels + (this.#parts.atlas ? 512 * 512 : 0) + this.#lcd.pixels + this.#skinPixels;
  }

  get ambient(): boolean {
    return this.#pacer.running;
  }

  get moving(): boolean {
    return this.#stopStep !== null;
  }

  lidDegrees(now: number): number {
    return this.#choreography.lidDegrees(now);
  }

  setDiscs(discs: readonly DiscArt[]): void {
    const now = performance.now();
    this.#discIds = discs.map((disc) => disc.id);
    const pending = this.#discs.setDiscs(discs);
    this.#choreography.setDiscs(
      discs.map((disc) => disc.id),
      this.#context.slots(),
      now,
    );
    for (const id of pending) this.#prepareLabel(id);
    this.#choreography.setLabelsReady(this.#discs.labelsReady, now);
    this.#publishLayout();
    this.#kick();
  }

  setState(state: DeckState): void {
    const previous = this.#state;
    this.#state = state;
    const now = performance.now();
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
    this.#kick();
  }

  press(key: RadioKey): void {
    const now = performance.now();
    this.#input(now);
    this.#choreography.press(key, now, now, { instant: this.#context.reducedMotion.matches });
    this.#kick();
  }

  setKeyboardAttention(disc: string | null): void {
    this.#keyboardAttention = disc;
    if (disc !== null) this.#input(performance.now());
    this.#updateAttention();
  }

  setPointer(ndc: Vector2 | null): void {
    this.#pointer = ndc ? ndc.clone() : null;
    if (this.#context.views.view !== 'radio' || this.#context.views.moving) return;
    const now = performance.now();
    if (ndc) this.#input(now);
    this.#choreography.parallax(ndc, now);
    this.#updateTilt(now);
    this.#kick();
  }

  approach(at: number): void {
    const now = performance.now();
    this.#input(now);
    this.#compileDiscs();
    this.#choreography.approach(at, now);
    if (!this.#flightMeasured && !this.#context.reducedMotion.matches) this.#measureFlight(at);
    this.#maybeUploadSkin();
    this.#updateLcd(now);
    this.#kick();
  }

  reveal(): void {
    const now = performance.now();
    this.#choreography.reveal(now);
    this.#choreography.setLabelsReady(this.#discs.labelsReady, now);
    this.#kick();
  }

  conceal(): void {
    const now = performance.now();
    this.#gesture = null;
    this.#pointerAttention = null;
    this.#updateAttention();
    this.#choreography.conceal(now);
    this.#kick();
  }

  intent(): void {
    this.#skinIntent = true;
    this.#maybeUploadSkin();
  }

  relayout(): void {
    this.#choreography.relayout(this.#context.slots(), performance.now());
    this.#publishLayout();
    this.#kick();
  }

  pick(raycaster: Raycaster): DevicePick | null {
    const now = performance.now();
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

  pointerDown(target: DeviceTarget): boolean {
    const now = performance.now();
    this.#input(now);
    if (target.kind === 'key') {
      // The key goes down with the finger and the transport acts at once (a user gesture: media may start).
      this.#choreography.press(target.key, now, null, { instant: this.#context.reducedMotion.matches });
      this.#kick();
      this.#gesture = { target, cancelled: false };
      this.#context.events.intent({ type: 'press', key: target.key });
      return true;
    }
    if (target.kind === 'disc' && !target.seated) {
      this.#gesture = { target, cancelled: false };
      this.#pointerAttention = target.disc;
      this.#updateAttention();
      return true;
    }
    return false;
  }

  pointerMove(target: DeviceTarget | null): void {
    const gesture = this.#gesture;
    if (gesture?.target.kind !== 'disc') return;
    const still = target?.kind === 'disc' && target.disc === gesture.target.disc;
    if (!still && !gesture.cancelled) {
      // Sliding off the disc cancels the pick.
      gesture.cancelled = true;
      this.#pointerAttention = null;
      this.#updateAttention();
    }
  }

  pointerUp(): void {
    const gesture = this.#gesture;
    this.#gesture = null;
    if (!gesture) return;
    const now = performance.now();
    if (gesture.target.kind === 'key') {
      this.#choreography.release(gesture.target.key, now);
      this.#kick();
      return;
    }
    if (gesture.target.kind === 'disc' && !gesture.cancelled) {
      // Inside the pointer event: the app may start the music in this very gesture.
      this.#context.events.intent({ type: 'pick', disc: gesture.target.disc });
    }
  }

  activate(target: DeviceTarget): void {
    if (target.kind !== 'disc' || !target.seated) return;
    // A click on the disc in the well: ▷II presses itself and the transport toggles.
    const now = performance.now();
    this.#input(now);
    this.#choreography.press('play-pause', now, now, { instant: this.#context.reducedMotion.matches });
    this.#kick();
    this.#context.events.intent({ type: 'press', key: 'play-pause' });
  }

  hover(target: DeviceTarget | null): void {
    const disc = target?.kind === 'disc' && !target.seated ? target.disc : null;
    if (disc !== null) this.#input(performance.now());
    if (disc === this.#pointerAttention) {
      this.#updateTilt(performance.now());
      return;
    }
    this.#pointerAttention = disc;
    this.#updateAttention();
  }

  dispose(): void {
    this.#disposed = true;
    this.#stopStep?.();
    this.#stopStep = null;
    this.#pacer.stop();
    if (this.#blinkTimer !== null) clearTimeout(this.#blinkTimer);
    this.#context.reducedMotion.removeEventListener('change', this.#onMotionPreference);
    this.#discs.dispose();
    this.#lcd.dispose();
    this.#led.dispose();
    this.#skinBitmap?.close();
    this.root.removeFromParent();
  }

  /** Where the discs and keys sit on the page at the settled pose, for the app's buttons and captions. */
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
        window.devicePixelRatio || 1,
      ),
    );
  }

  #discIds: readonly string[] = [];

  /** Keeps the frame step alive while anything moves; it stops itself when everything rests. */
  #kick(): void {
    if (this.#disposed) return;
    if (this.#stopStep === null) {
      const step = (now: number): boolean => {
        const moving = this.#frame(now);
        if (!moving) this.#stopStep = null;
        return moving;
      };
      this.#stopStep = this.#context.loop.animate(step);
    }
    this.#pacer.sync();
  }

  readonly #ambientFrame = (now: number): boolean => {
    this.#frame(now);
    return false;
  };

  /** One frame: fire the moments that came due, then pose every part. Returns whether anything still moves. */
  #frame(now: number): boolean {
    for (const moment of this.#choreography.advance(now)) this.#fire(moment);
    const sample = this.#choreography.sample(now);
    this.#apply(sample.lid, sample.discs, sample.keys);
    this.#updateLcd(now);
    this.#pacer.sync();
    return sample.moving;
  }

  #apply(lid: number, discs: readonly DiscSample[], keys: ReturnType<Choreography['sample']>['keys']): void {
    const parts = this.#parts;
    parts.lidPivot.rotation.x = -MathUtils.degToRad(lid);
    const open = lid > SEATED_HIDDEN_BELOW_DEGREES;
    parts.well.visible = open;
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

  #lcdLit = false;

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
      const at = performance.now();
      this.#lcd.show(this.#displayed(at), this.#blinkOn || !this.#blinking(at), this.#context.reducedMotion.matches);
      this.#syncBlink(at);
    }, BLINK_MS);
  }

  #input(now: number): void {
    this.#lastInput = now;
    this.#choreography.activity(now);
    this.#pacer.sync();
  }

  #updateAttention(): void {
    const next = this.#pointerAttention ?? this.#keyboardAttention;
    if (next !== this.#pointerAttentionReported) {
      this.#pointerAttentionReported = this.#pointerAttention;
      this.#context.events.pointerAttention(this.#pointerAttention);
    }
    if (next === this.#attention) return;
    this.#attention = next;
    const now = performance.now();
    this.#choreography.attend(next, now);
    this.#updateTilt(now);
    this.#kick();
  }

  #pointerAttentionReported: string | null = null;

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
    return this.#choreography.ambientAt(performance.now());
  }

  #prepareLabel(id: string): void {
    if (this.#labelWork.has(id)) return;
    this.#labelWork.add(id);
    this.#context.background.add(
      unit(() => {
        this.#labelWork.delete(id);
        if (this.#disposed) return;
        if (this.#discs.prepareLabel(id, this.#context.renderer)) {
          this.#choreography.setLabelsReady(this.#discs.labelsReady, performance.now());
          // A print arriving on a disc in view replaces the plain silver in one frame.
          this.#context.loop.invalidate();
          this.#kick();
        }
      }),
    );
  }

  /** Compiles the disc program on the way to the radio, never before, so other views keep their program count. */
  #compileDiscs(): void {
    if (this.#compiling) return;
    this.#compiling = this.#discs.compile(this.#context.renderer, this.#context.camera, this.#context.scene).then(
      () => this.#kick(),
      (error: unknown) => console.warn('The CD shader failed to compile', error),
    );
  }

  /** The 2K skin goes up after an intent, in one unit of background work, never while anything moves. */
  #maybeUploadSkin(): void {
    const bitmap = this.#skinBitmap;
    if (this.#skinShown || !bitmap || !this.#skinIntent || this.#slow) return;
    this.#skinShown = true;
    this.#context.background.add(
      unit(() => {
        if (this.#disposed) return;
        const texture = skinTexture(bitmap, this.#context.anisotropy);
        this.#context.renderer.initTexture(texture);
        const old = new Set<Texture>();
        for (const material of this.#parts.skinMaterials) {
          if (material.map) old.add(material.map);
          material.map = texture;
          material.needsUpdate = true;
        }
        for (const texture1k of old) {
          (texture1k.image as Partial<ImageBitmap> | null)?.close?.();
          texture1k.dispose();
        }
        this.#skinPixels = bitmap.width * bitmap.height;
        this.#context.loop.invalidate();
      }),
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
      if (isSlow(null, frames)) {
        this.#slow = true;
        this.#pacer.sync();
      }
      return false;
    });
  }

  readonly #onMotionPreference = (): void => {
    this.#pacer.sync();
    this.#kick();
  };

  #lcdRenderWidth(extras: CloseUpExtras): number {
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
