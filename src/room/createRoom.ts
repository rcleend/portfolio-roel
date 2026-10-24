import { type Material, Mesh, type Object3D } from 'three';
import type { GameSurface } from '@/engine/core/GameSurface';
import { assembleRoom, type RoomScene } from './assembleRoom';
import { loadRoomAssets } from './assets/roomAssets';
import type { PropAnchor } from './camera/anchors';
import type { FramingInsets } from './camera/CameraRig';
import type { Interactable } from './interaction/Interactable';
import { type PcMonitor, PcMonitorHandle } from './pc/PcMonitor';
import { ScreenOverlay } from './pc/ScreenOverlay';
import { ControlsLayer } from './radio/ControlsLayer';
import type { RadioDeck } from './radio/RadioDeck';
import { RadioDeckHandle } from './radio/RadioDeckHandle';
import { RoomStage } from './stage/RoomStage';
import { forEachTexture } from './stage/sceneTextures';
import type { PowerState } from './tv/powerTimeline';
import { ViewController } from './ViewController';
import type { RoomView } from './viewState';

export interface CreateRoomOptions {
  /** Element the room's canvas fills; its size drives the framing. */
  readonly container: HTMLElement;
  /**
   * Covers exactly the same box as `container`; the room puts the monitor's live screen in it. Keep it outside any
   * role="application" so screen readers can browse the document. Defaults to `container`.
   */
  readonly overlayContainer?: HTMLElement;
  readonly surface: GameSurface;
  /** Download progress, 0–1. */
  readonly onProgress?: (fraction: number) => void;
  /** Absolute URL of the folder holding the room assets; defaults to `<BASE_URL>room/`. */
  readonly assetBaseUrl?: string;
  /** Upper bound for devicePixelRatio (default 2). */
  readonly maxPixelRatio?: number;
  /** Upper bound for drawing-buffer pixels (default 3 000 000). */
  readonly maxDrawingBufferPixels?: number;
}

export interface Room {
  /** Resolves once the room is loaded and its first frame drawn; rejects if loading fails. */
  readonly ready: Promise<void>;
  /** The view the camera is at or flying to. */
  readonly view: RoomView;
  readonly powerState: PowerState;
  /** Lights the power LED and runs the CRT turn-on; resolves when the picture is up. */
  powerOn(): Promise<void>;
  powerOff(): Promise<void>;
  /** Flies to the TV; the game resumes and takes input once the camera lands. */
  focusTv(): void;
  /** Pauses the game, disables its input and pulls back to show the whole room. */
  showRoom(): void;
  /** Flies straight in front of the monitor; the game stays paused with its input off. */
  focusPc(): void;
  /** Flies to the CD player on the cabinet; the game stays paused with its input off. */
  focusRadio(): void;
  onViewChange(listener: (view: RoomView) => void): () => void;
  /** Keeps the TV framing clear of app overlays (CSS-pixel strips of the viewport). */
  setFramingInsets(insets: FramingInsets): void;
  /** Adds a clickable prop (radio, poster…); returns its unregister function. */
  registerInteractable(interactable: Interactable): () => void;
  /** The computer's monitor; usable before `ready` (calls are remembered). */
  readonly pc: PcMonitor;
  /** The CD player; usable before `ready` (calls are remembered). */
  readonly radio: RadioDeck;
  /** Where the TV, the computer and the radio sit in the settled room view, for the current viewport. */
  readonly anchors: readonly PropAnchor[];
  onAnchorsChange(listener: (anchors: readonly PropAnchor[]) => void): () => void;
  /** Diagnostics for the dev lab and performance checks. */
  readonly stats: RoomStats;
  dispose(): void;
}

export interface RoomStats {
  readonly framesRendered: number;
  readonly renderLoopIdle: boolean;
  readonly lavaRunning: boolean;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly pixelRatio: number;
  /** Shader programs compiled so far (renderer.info.programs.length); the PC must not add one. */
  readonly programs: number;
  /** Pixels of the monitor's texture (0 in standby before the first paint). */
  readonly pcTexturePixels: number;
  /** True while work ahead of need (texture uploads, pick chunks, the monitor's still) waits for idle moments. */
  readonly backgroundPending: boolean;
  /** The radio's close-up is loaded, cut and prepared (the lid will not wait for it). */
  readonly radioReady: boolean;
  /** Pixels of the radio's lazy textures on the GPU: labels, close-up atlas, LCD, 2K skin. */
  readonly radioTexturePixels: number;
  /** Current lid angle in degrees (0 closed). */
  readonly radioLidDegrees: number;
  /** Ambient motion is scheduling frames. */
  readonly radioAmbient: boolean;
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
  const pc = new PcMonitorHandle(overlay);
  const controls = new ControlsLayer(options.overlayContainer ?? options.container);
  const radio = new RadioDeckHandle(controls, reducedMotion);
  const assetBaseUrl = options.assetBaseUrl ?? defaultAssetBaseUrl();
  let scene: RoomScene | null = null;
  let disposed = false;
  let framingInsets: FramingInsets | null = null;
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
      loaded.rig.goTo(to, () => {
        arrived();
        loaded.refreshCursor();
      });
      loaded.refreshCursor();
    },
    releasePointer: () => scene?.tvInput.release(),
    revealScreen: () => pc.reveal(),
    concealScreen: () => pc.conceal(),
    // The device times its lid from the click, against the flight's own clock (FLIGHT_MS, REDUCED_FADE_MS).
    approachRadio: () => radio.approach(performance.now()),
    revealRadio: () => radio.reveal(),
    concealRadio: () => radio.conceal(),
  });

  const ready = loadRoomAssets(assetBaseUrl, options.onProgress ?? (() => {})).then((assets) => {
    if (disposed) return;
    scene = assembleRoom({
      stage,
      assets,
      surface,
      views,
      reducedMotion,
      overlay,
      radio,
      onAnchorsChange: (next) => {
        anchors = next;
        for (const listener of anchorListeners) listener(next);
      },
    });
    if (framingInsets) scene.setFramingInsets(framingInsets);
    for (const [interactable] of queuedInteractables) {
      queuedInteractables.set(interactable, scene.register(interactable));
    }
    pc.attach(scene.monitor);
    if (scene.radioModel) {
      radio.attach({
        model: scene.radioModel,
        rig: scene.rig,
        stage,
        views,
        background: scene.background,
        loader: assets.loader,
        assetBaseUrl,
        anisotropy: scene.anisotropy,
      });
    } else {
      radio.unavailable(new Error('The room assets lack the radio'));
    }
    const { background } = scene;
    // Work ahead of need never delays the first frame.
    return firstFrame(stage).then(() => background.start());
  });

  return {
    ready,
    get view() {
      return views.view;
    },
    get powerState() {
      return scene?.television.powerState ?? 'off';
    },
    async powerOn() {
      await ready;
      await scene?.television.powerOn();
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
    setFramingInsets(insets) {
      framingInsets = insets;
      scene?.setFramingInsets(insets);
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
        framesRendered: stage.loop.framesRendered,
        renderLoopIdle: stage.loop.idle,
        lavaRunning: scene?.lava.running ?? false,
        drawCalls: calls,
        triangles,
        pixelRatio: stage.size.pixelRatio,
        programs: renderer.info.programs?.length ?? 0,
        pcTexturePixels: scene?.monitor.texturePixels ?? 0,
        backgroundPending: scene?.background.pending ?? false,
        radioReady: radio.prepared !== null,
        radioTexturePixels: radio.prepared?.texturePixels ?? 0,
        radioLidDegrees: radio.prepared?.lidDegrees(performance.now()) ?? 0,
        radioAmbient: radio.prepared?.ambient ?? false,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pc.detach();
      radio.dispose();
      controls.dispose();
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

function defaultAssetBaseUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}room/`, window.location.href).href;
}

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
