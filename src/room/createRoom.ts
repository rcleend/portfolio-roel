import { type Material, Mesh, type Object3D } from 'three';
import type { GameSurface } from '@/engine/core/GameSurface';
import { assembleRoom, type RoomScene } from './assembleRoom';
import { LiveScreenMood } from './atmosphere/LiveScreenMood';
import type { RoomAir, RoomMood } from './atmosphere/moods';
import type { PropAnchor } from './camera/anchors';
import type { FramingInsets } from './camera/CameraRig';
import { GeneratedRoom, type GeneratedStats } from './gen/GeneratedRoom';
import { genKit } from './gen/genKit';
import type { Interactable } from './interaction/Interactable';
import { type PcMonitor, PcMonitorHandle } from './pc/PcMonitor';
import { ScreenOverlay } from './pc/ScreenOverlay';
import { type PostersPath, PostersSlot, type PostersState } from './posters/PostersSlot';
import type { RadioDoor } from './radio/RadioDeck';
import { RadioDoorHandle } from './radio/RadioDoor';
import { RainSoundSlot } from './rain/RainSoundSlot';
import type { PropSpotlight } from './spotlight/PropSpotlight';
import { SpotlightDoor } from './spotlight/SpotlightDoor';
import { spotlightKit } from './spotlight/spotlightKit';
import type { IdleTask } from './stage/IdleWork';
import type { Quality, QualityTier } from './stage/quality';
import { RoomStage } from './stage/RoomStage';
import { forEachTexture } from './stage/sceneTextures';
import type { PowerState } from './tv/powerTimeline';
import { ViewController } from './ViewController';
import type { RoomView } from './viewState';

/** How long after the TV turns on the room's textures and buffers start going up (assembleRoom › prewarm). */
const PREWARM_DELAY_MS = 4000;
/**
 * How long at most the camera waits, once the room is lit, for the rest of what its flight shows to be made (ms): the
 * textures and buffers no frame has drawn, the posters' upload if they are painted. Measured: 4-12 ms on an Apple M4
 * Pro, 20-70 ms on the stand-ins for a phone and a slow GPU, when the visitor leaves in the room's first second;
 * nothing after that. What is not made in this time waits for the landing.
 */
const PREFLIGHT_WORK_MS = 400;
/** And how long at most for the GPU to be through with it, so that the flight's first frames do not queue behind (ms). */
const PREFLIGHT_GPU_MS = 400;
const MAX_ANISOTROPY = 4;

/**
 * Where the room is: its geometry and its opening view's light on their way (again, after a lost context), the
 * opening view on screen with the rest of the room baking behind it, all of it baked, or failed.
 */
export type GeneratedState = 'loading' | 'opening' | 'ready' | 'failed';
export interface CreateRoomOptions {
  /** Element the room's canvas fills; its size drives the framing. */
  readonly container: HTMLElement;
  /**
   * Covers exactly the same box as `container`; the room puts the monitor's live screen in it. Keep it outside any
   * role="application" so screen readers can browse the document. Defaults to `container`.
   */
  readonly overlayContainer?: HTMLElement;
  readonly surface: GameSurface;
  /**
   * The strips of the viewport the app's overlays cover, as `setFramingInsets` takes them: given here, the opening
   * view is framed (and lit first) as it will be shown.
   */
  readonly framingInsets?: FramingInsets;
  /** A further upper bound for devicePixelRatio, under the quality tier's own (docs/ROOM.md › Quality). */
  readonly maxPixelRatio?: number;
  /** A further upper bound for drawing-buffer pixels, under the quality tier's own. */
  readonly maxDrawingBufferPixels?: number;
  /**
   * How much the room draws: `auto` (the default) starts on the tier the device suggests and follows its measured
   * frame times; a tier fixes it (the lab, screenshots, tests).
   */
  readonly quality?: QualityTier | 'auto';
  /** The decorated walls (docs/ROOM.md › Posters); false keeps them bare, so tests can measure what they add. */
  readonly posters?: boolean;
  /** Optional night-time finish; original keeps the unprocessed bake for comparison. */
  readonly mood?: RoomMood;
  readonly air?: RoomAir;
}

export interface Room {
  /**
   * Resolves once the room is built, what its opening view shows is lit and its first frame drawn; rejects if it
   * cannot be made (docs/ROOM.md › Startup). The rest of the room is lit behind the running game.
   */
  readonly ready: Promise<void>;
  /**
   * True while the room has its light. A lost WebGL context takes it: until the room is lit again it draws nothing
   * worth showing, and the page covers it (the startup still, docs/ROOM.md › Lost canvases).
   */
  readonly shown: boolean;
  onShownChange(listener: (shown: boolean) => void): () => void;
  /** The view the camera is at or flying to. */
  readonly view: RoomView;
  /** True while the camera rests at `view`, false while it flies there. */
  readonly settled: boolean;
  readonly mood: RoomMood;
  /** Switches the finish in place, without reloading the room or scheduling an animation. */
  setMood(mood: RoomMood): void;
  /** Scales the selected mood's illuminated haze and dust (0–2; 1 is its authored finish). */
  setAir(air: RoomAir): void;
  /** Shares the app’s sound switch; rain plays everywhere except the TV. */
  setMuted(muted: boolean): void;
  readonly powerState: PowerState;
  /**
   * Lights the power LED and runs the CRT turn-on; resolves when the picture is up. `instant`: lit at once, for a game
   * the page already shows on the startup still (docs/ROOM.md › Startup).
   */
  powerOn(options?: { readonly instant?: boolean }): Promise<void>;
  powerOff(): Promise<void>;
  /** Flies to the TV; the game resumes and takes input once the camera lands. */
  focusTv(): void;
  /** Pauses the game, disables its input and pulls back to show the whole room. */
  showRoom(): void;
  /** Flies straight in front of the monitor; the game stays paused with its input off. */
  focusPc(): void;
  /** Flies to the CD player on the cabinet; the game stays paused with its input off. */
  focusRadio(): void;
  /** Called as the camera sets off towards another view. */
  onViewChange(listener: (view: RoomView) => void): () => void;
  /** Called as the camera comes to rest at the view. */
  onSettle(listener: (view: RoomView) => void): () => void;
  /** Keeps the TV framing clear of app overlays (CSS-pixel strips of the viewport). */
  setFramingInsets(insets: FramingInsets): void;
  /**
   * The phone's tilt, −1…1 each way (right, up), which looks gently round the room view as the pointer's parallax
   * does (only there, and not under reduced motion); null lets go.
   */
  setTilt(tilt: { readonly x: number; readonly y: number } | null): void;
  /**
   * While on, a tap or a pen (not a mouse) anywhere on the TV set at the TV view or below its top (its bezel and
   * bottom panel, the cabinet under it, the room beside it) presses the game as a tap on its picture does: the title's "PRESS TO BEGIN" (docs/ROOM.md › Using it
   * from the app). Usable before `ready`.
   */
  setTapToBegin(on: boolean): void;
  /** Adds a clickable prop (radio, poster…); returns its unregister function. */
  registerInteractable(interactable: Interactable): () => void;
  /** The computer's monitor; usable before `ready` (calls are remembered). */
  readonly pc: PcMonitor;
  /** The CD player; usable before `ready` (calls are remembered). */
  readonly radio: RadioDoor;
  /** The props' glow, bounce and label point in the room view (docs/ROOM.md › The spotlight); usable before `ready`. */
  readonly spotlight: PropSpotlight;
  /** Where the TV, the computer and the radio sit in the settled room view, for the current viewport. */
  readonly anchors: readonly PropAnchor[];
  onAnchorsChange(listener: (anchors: readonly PropAnchor[]) => void): () => void;
  /** Diagnostics for the dev lab and performance checks. */
  readonly stats: RoomStats;
  /** Resolves true once the decorated walls are shown, false when they will not be this page load. */
  readonly postersReady: Promise<boolean>;
  /** Resolves true once the whole room is lit (first time), false when it could not be. */
  readonly generatedReady: Promise<boolean>;
  dispose(): void;
}

export interface RoomStats {
  /** Current outside storm flash, 0–1 (zero under reduced motion and at the TV). */
  readonly lightning: number;
  readonly rainReady: boolean;
  readonly rainPlaying: boolean;
  readonly framesRendered: number;
  readonly lavaRunning: boolean;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly pixelRatio: number;
  /** The tier and scale frames are drawn at (docs/ROOM.md › Quality). */
  readonly quality: Quality;
  /** How often the quality has changed this page load: each change is a resize. */
  readonly qualityChanges: number;
  /**
   * The interval the room's frames are meant to come at (ms): a 60 Hz frame, or the display's own where it hands out
   * fewer (`capped`: Safari in Low Power Mode draws thirty a second). What the governor judges frames against.
   */
  readonly display: { readonly frameMs: number; readonly capped: boolean };
  /**
   * What the room draws of its own accord now (docs/ROOM.md › Frames › At rest): `full`, every paced frame, and `why`
   * (`lighting`: the room is not whole yet; `judging`: its quality has not been seen to hold); `rest`, only what
   * moves by itself needs (`moving`, about `rate` frames a second); or `still`, nothing (hidden, or nothing moves).
   * Whatever is asked for (a flight, the game's frames, a pointer's move) is drawn on top of it at full pace.
   */
  readonly pace: {
    readonly pace: 'full' | 'rest' | 'still';
    readonly moving: readonly string[];
    readonly rate: number;
    readonly why: 'lighting' | 'judging' | '';
  };
  /** Shader programs compiled so far (renderer.info.programs.length); the PC must not add one. */
  readonly programs: number;
  /** Pixels of the monitor's texture (0 in standby before the first paint). */
  readonly pcTexturePixels: number;
  /** True while work ahead of need (texture uploads, pick chunks, the monitor's still) waits for idle moments. */
  readonly backgroundPending: boolean;
  /** The radio's device is loaded and prepared on the lit radio's parts (the lid will not wait for it). */
  readonly radioReady: boolean;
  /** Pixels of the radio's lazy textures on the GPU: the discs' labels and the LCD. */
  readonly radioTexturePixels: number;
  /** Current lid angle in degrees (0 closed). */
  readonly radioLidDegrees: number;
  /** Ambient motion is scheduling frames. */
  readonly radioAmbient: boolean;
  /** The decorated walls: none this page load, on their way, or shown (docs/ROOM.md › Posters). */
  readonly posters: PostersState;
  /** Pixels of the posters' atlas on the GPU. */
  readonly postersTexturePixels: number;
  /** How the loaded walls draw (PostersSlot.path). */
  readonly postersPath: PostersPath | null;
  /** Late bytes are fading in. */
  readonly postersFading: boolean;
  /** The reduced-motion cut's veil: 0 clear, 1 black. */
  readonly screenFade: number;
  /** The props' spotlight is in (from the first flight away from the TV): its two programs exist. */
  readonly spotlight: boolean;
  /** Where the room's making is (docs/ROOM.md › The generated room), and what building and baking it took. */
  readonly generated: GeneratedState;
  readonly generatedStats: GeneratedStats | null;
}

/**
 * Builds the attic room around a GameSurface. Throws synchronously when WebGL is
 * unavailable, so the app can fall back to the flat host.
 */
export function createRoom(options: CreateRoomOptions): Room {
  const { surface } = options;
  const stage = new RoomStage(options);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const overlay = new ScreenOverlay(options.overlayContainer ?? options.container, reducedMotion);
  const screenMood = new LiveScreenMood(overlay.element, options.overlayContainer ?? options.container);
  screenMood.setMood(stage.mood);
  const pc = new PcMonitorHandle(overlay);
  const radio = new RadioDoorHandle(options.overlayContainer ?? options.container, reducedMotion);
  const posters = new PostersSlot(options.posters ?? true);
  const spotlight = new SpotlightDoor();
  const rain = new RainSoundSlot();
  let scene: RoomScene | null = null;
  let disposed = false;
  let framingInsets: FramingInsets | null = options.framingInsets ?? null;
  let tapToBegin = false;
  let anchors: readonly PropAnchor[] = [];
  const anchorListeners = new Set<(anchors: readonly PropAnchor[]) => void>();
  const queuedInteractables = new Map<Interactable, () => void>();

  const views = new ViewController({
    surface,
    moveCamera: (from, to, arrived) => {
      // Before the room has loaded there is no flight to wait for.
      if (!scene) return arrived();
      const loaded = scene;
      // Any still the flight shows is painted and uploaded now, before its first frame.
      loaded.monitor.prepare(from, to);
      // A first reduced-motion visit to the radio stays black until its device is ready, so it is one cut to the
      // open radio, not a closed radio that then snaps open; the first cut to the room view also waits for the
      // posters while they are painted, so it lands on decorated walls.
      const holdCut = (): boolean =>
        (to === 'radio' && radio.available && radio.prepared === null) || posters.holdsCut(to);
      loaded.rig.goTo(
        to,
        () => {
          arrived();
          loaded.refreshCursor();
        },
        { holdCut },
      );
      loaded.refreshCursor();
    },
    releasePointer: () => scene?.tvInput.release(),
    revealScreen: () => {
      scene?.monitor.land();
      pc.reveal();
    },
    concealScreen: () => pc.conceal(),
    // The device times its lid from the click, against the flight's own clock (FLIGHT_MS, REDUCED_FADE_MS).
    approachRadio: () => radio.deck?.approach(performance.now()),
    revealRadio: () => radio.deck?.reveal(),
    concealRadio: () => radio.deck?.conceal(),
    // Nothing is made while the camera flies (docs/ROOM.md › Flights), so whatever a flight shows is made before it
    // sets off, and the camera waits for it: the rest of the room's light (no view but the TV's is shown before the
    // whole room is lit, docs/ROOM.md › Startup; its bake then hurries), the textures and buffers no frame has drawn
    // yet, the posters' upload once they are painted, the radio's deck and its discs on the way there. Normally all
    // of that is long made and the camera sets off in the click's own task.
    whenReady: (view) => {
      // A flight back to the TV shows nothing it has not shown.
      if (view === 'tv' || !scene) return null;
      const loaded = scene;
      loaded.prewarm();
      posters.depart();
      // The radio's discs are made ready once, before the first flight to them.
      const radioDue = view === 'radio' && !radioBoarded;
      if (generated.whole && !radioDue && !loaded.background.flightPending(view)) return null;
      return preflight(view, loaded);
    },
    // The frames are held while the room is made ready: the one that shows the game's PAUSE is drawn all the same.
    onWait: () => stage.oweFrame(),
  });
  let radioBoarded = false;
  /** The waits under way that hold the frames (`preflight`). */
  let preflights = 0;
  /** Makes what a flight to `view` shows, and resolves once the GPU is through with it. Rejects without the radio. */
  const preflight = async (view: RoomView, loaded: RoomScene): Promise<void> => {
    // The radio's deck leaves the first load: a request for the radio waits for it (it is fetched well before).
    if (view === 'radio' && !radio.deck) await radio.load();
    const lit = generated.whole || (await generated.whenWhole());
    if (disposed) return;
    // The room's light went with a lost context while the camera waited for it: the camera stays (the request is
    // dropped, and a game stopped for it goes on), since no view but the TV's shows a room without its light.
    if (!lit) throw new Error('The room lost its light while the camera waited');
    // A request made while the camera flies makes nothing: holding the frames would freeze the flight under way, and
    // what is left waits for the landing like everything else.
    if (views.moving) return;
    // The TV's picture stands still meanwhile (the game is paused): frames would only queue this work behind them.
    // Counted, so a second request's wait does not end the first one's hold.
    if (++preflights === 1) stage.hold('preflight', true);
    try {
      await loaded.background.drain(view, PREFLIGHT_WORK_MS);
      if (view === 'radio') {
        // The discs' program, for the target frames draw into, and the app's half (its player and controls, mounted
        // while the camera still rests: `RadioDoor.onBoarding`); then whatever preparing them queued.
        const boarded = Promise.all([radio.deck?.board() ?? Promise.resolve(), radio.boardApp()]);
        await Promise.race([boarded, pause(PREFLIGHT_WORK_MS)]);
        await loaded.background.drain(view, PREFLIGHT_WORK_MS);
        radioBoarded = radio.prepared !== null;
      }
      await posters.boarded(PREFLIGHT_WORK_MS);
      await stage.gpuIdle(PREFLIGHT_GPU_MS);
    } finally {
      if (--preflights === 0) stage.hold('preflight', false);
    }
  };
  // The props' glow and the radio's deck leave the first load. Neither is fetched in a flight, and what they make as
  // they arrive (programs, a target, the device) is made at rest: the glow's chunk is asked for from the TV, behind
  // the room's warming (`prewarm`), or at the first landing in the room; the deck's at that landing, since the radio
  // is a click away from there.
  const stopPreload = views.onSettle((view) => {
    if (view === 'tv') return;
    stopPreload();
    scene?.background.add(preloads());
  });
  function* preloads(): IdleTask {
    spotlight.preload(atRest);
    yield;
    radio.preload();
  }
  /** Resolves with `value` in a task of its own while the camera rests: at once, or a moment after it lands. */
  const atRest = <T>(value: T): Promise<T> =>
    new Promise((resolve) => {
      if (!views.moving) {
        resolve(value);
        return;
      }
      const stop = views.onSettle(() => {
        stop();
        setTimeout(() => resolve(value), 0);
      });
    });
  views.onChange((view) => {
    rain.setView(view);
    stage.setAtTv(view === 'tv');
    stage.setReading(false);
  });
  views.onSettle((view) => stage.setReading(view === 'pc'));
  // Only a camera resting in the room view lights a prop.
  views.onChange(() => spotlight.setOpen(false));
  views.onSettle((view) => spotlight.setOpen(view === 'room'));

  const anisotropy = Math.min(MAX_ANISOTROPY, stage.renderer.capabilities.getMaxAnisotropy());
  let state: GeneratedState = 'loading';
  let shown = false;
  const shownListeners = new Set<(shown: boolean) => void>();
  const setShown = (next: boolean): void => {
    if (shown === next) return;
    shown = next;
    for (const listener of shownListeners) listener(next);
  };
  let settleReady: { resolve(): void; reject(error: unknown): void } | null = null;
  const ready = new Promise<void>((resolve, reject) => (settleReady = { resolve, reject }));
  let settleRadio: (lit: boolean) => void = () => {};
  const radioLit = new Promise<boolean>((resolve) => (settleRadio = resolve));
  let settleWhole: (whole: boolean) => void = () => {};
  const generatedReady = new Promise<boolean>((resolve) => (settleWhole = resolve));
  // The room's geometry is built at once, in a worker; everything below waits for it, not for any download.
  const generated: GeneratedRoom = new GeneratedRoom(
    { stage, anisotropy, tier: stage.quality.tier, reducedMotion },
    genKit,
    {
      onBuilt: (parts) => {
        if (disposed) return;
        const built = assembleRoom({
          stage,
          parts,
          anisotropy,
          surface,
          views,
          reducedMotion,
          overlay,
          radio,
          onAnchorsChange: (next) => {
            anchors = next;
            for (const listener of anchorListeners) listener(next);
          },
          onHover: (target) => spotlight.hover(target),
          tapToBegin: () => tapToBegin,
        });
        scene = built;
        stage.attachAtmosphere();
        if (framingInsets) built.setFramingInsets(framingInsets);
        for (const [interactable] of queuedInteractables) {
          queuedInteractables.set(interactable, built.register(interactable));
        }
        pc.attach(built.monitor);
        radio.attach({
          model: built.radioModel,
          rig: built.rig,
          stage,
          views,
          background: built.background,
          anisotropy,
          // The device moves the generated radio's parts, once they have their light.
          generated: { ready: radioLit, radio: () => generated.radio },
        });
        posters.attach({ stage, views, background: built.background, anisotropy });
        const { spotlit } = built;
        spotlight.attach(() => ({
          kit: spotlightKit,
          renderer: stage.renderer,
          camera: stage.camera,
          loop: stage.loop,
          props: spotlit,
          reducedMotion,
          size: () => stage.size,
          still: (target) => target === 'radio' && radio.prepared === null,
          onRender: (listener) => stage.onRender(listener),
        }));
        stopReframe = stage.onResize(() => generated.reframed());
        // What the page opens on is lit first: the TV view, where the camera stands unless it was asked elsewhere.
        generated.bake({ background: built.background, opening: () => (views.view === 'tv' ? built.tvClip() : null) });
      },
      onShown: () => {
        if (disposed) return;
        state = generated.whole ? 'ready' : 'opening';
        settleRadio(true);
        // Work ahead of need never delays the first frame.
        firstFrame(stage).then(() => {
          if (disposed) return;
          scene?.background.start();
          setShown(true);
          settleReady?.resolve();
          settleReady = null;
        });
      },
      onComplete: () => {
        state = 'ready';
        settleWhole(true);
      },
      onLost: () => {
        state = 'loading';
        setShown(false);
      },
      onFailed: (error) => {
        state = 'failed';
        settleRadio(false);
        settleWhole(false);
        if (settleReady) settleReady.reject(error);
        else console.warn('The room could not be lit again.', error);
        settleReady = null;
      },
    },
  );
  let stopReframe: (() => void) | null = null;
  // biome-ignore lint/correctness/useYield: a task of one unit, which only asks for the chunk.
  function* glow(): IdleTask {
    spotlight.preload(atRest);
  }

  return {
    ready,
    get shown() {
      return shown;
    },
    onShownChange(listener) {
      shownListeners.add(listener);
      return () => shownListeners.delete(listener);
    },
    postersReady: posters.ready,
    generatedReady,
    get mood() {
      return stage.mood;
    },
    setMood: (mood) => {
      if (disposed) return;
      stage.setMood(mood);
      screenMood.setMood(mood);
    },
    setAir: (air) => {
      if (!disposed) stage.setAir(air);
    },
    setMuted: (muted) => rain.setMuted(muted),
    get view() {
      return views.view;
    },
    get settled() {
      return !views.moving;
    },
    get powerState() {
      return scene?.television.powerState ?? 'off';
    },
    async powerOn(options) {
      await ready;
      await scene?.television.powerOn(options?.instant);
      if (scene && !disposed) rain.prepare(scene.background);
      // The room's textures and buffers go up from the TV once the picture has settled in, ahead of the first look
      // around, and the props' glow comes in behind them.
      setTimeout(() => {
        if (disposed || !scene) return;
        scene.prewarm();
        scene.background.add(glow());
      }, PREWARM_DELAY_MS);
    },
    async powerOff() {
      await ready;
      await scene?.television.powerOff();
    },
    focusTv: () => views.request('tv'),
    showRoom: () => views.request('room'),
    focusPc: () => views.request('pc'),
    focusRadio: () => views.request('radio'),
    onViewChange: (listener) => views.onChange(listener),
    onSettle: (listener) => views.onSettle(listener),
    setTilt: (tilt) => scene?.tilt(tilt),
    setTapToBegin: (on) => {
      tapToBegin = on;
    },
    setFramingInsets(insets) {
      framingInsets = insets;
      scene?.setFramingInsets(insets);
      generated.reframed();
    },
    registerInteractable(interactable) {
      queuedInteractables.set(interactable, scene ? scene.register(interactable) : () => {});
      return () => {
        queuedInteractables.get(interactable)?.();
        queuedInteractables.delete(interactable);
      };
    },
    pc,
    radio,
    spotlight,
    get anchors() {
      return anchors;
    },
    onAnchorsChange(listener) {
      anchorListeners.add(listener);
      return () => anchorListeners.delete(listener);
    },
    get stats(): RoomStats {
      const { renderer } = stage;
      const { calls, triangles } = renderer.info.render;
      return {
        lightning: stage.lightning,
        rainReady: rain.ready,
        rainPlaying: rain.playing,
        framesRendered: stage.loop.framesRendered,
        lavaRunning: generated.lavaRunning,
        drawCalls: calls,
        triangles,
        pixelRatio: stage.size.pixelRatio,
        quality: stage.quality,
        qualityChanges: stage.qualityChanges,
        display: { frameMs: stage.frameMs, capped: stage.displayCapped },
        pace: { ...stage.loop.pacing, why: generated.whole ? (stage.judging ? 'judging' : '') : 'lighting' },
        programs: renderer.info.programs?.length ?? 0,
        pcTexturePixels: scene?.monitor.texturePixels ?? 0,
        backgroundPending: scene?.background.pending ?? false,
        radioReady: radio.prepared !== null,
        radioTexturePixels: radio.prepared?.texturePixels ?? 0,
        radioLidDegrees: radio.prepared?.lidDegrees(performance.now()) ?? 0,
        radioAmbient: radio.prepared?.ambient ?? false,
        posters: posters.state,
        postersTexturePixels: posters.texturePixels,
        postersPath: posters.path,
        postersFading: posters.fading,
        screenFade: scene?.fade.opacity ?? 0,
        spotlight: spotlight.loaded,
        generated: state,
        generatedStats: generated.stats,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      screenMood.dispose();
      rain.dispose();
      pc.detach();
      radio.dispose();
      posters.dispose();
      generated.dispose();
      stopReframe?.();
      shownListeners.clear();
      settleRadio(false);
      settleWhole(false);
      spotlight.dispose();
      scene?.dispose();
      scene = null;
      views.dispose();
      overlay.dispose();
      anchorListeners.clear();
      queuedInteractables.clear();
      disposeObjectTree(stage.scene);
      stage.dispose();
    },
  };
}

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function firstFrame(stage: RoomStage): Promise<void> {
  return new Promise((resolve) => {
    const stop = stage.onRender(() => {
      stop();
      resolve();
    });
    stage.loop.invalidate();
  });
}

function disposeObjectTree(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.geometry.dispose();
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      forEachTexture(material, (texture) => texture.dispose());
      material.dispose();
    }
  });
}
