import { type Material, Mesh, type Object3D } from 'three';
import type { GameSurface } from '@/engine/core/GameSurface';
import { assembleRoom, forEachTexture, type RoomScene } from './assembleRoom';
import { loadRoomAssets } from './assets/roomAssets';
import type { FramingInsets } from './camera/CameraRig';
import type { Interactable } from './interaction/Interactable';
import { RoomStage } from './stage/RoomStage';
import type { PowerState } from './tv/powerTimeline';
import { ViewController } from './ViewController';
import type { RoomSection, RoomView } from './viewState';

export interface CreateRoomOptions {
  /** Element the room's canvas fills; its size drives the framing. */
  readonly container: HTMLElement;
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
  /** Looks closer at the desktop or the radio/lava-lamp cabinet, keeping the game paused. */
  focusSection(section: RoomSection): void;
  onViewChange(listener: (view: RoomView) => void): () => void;
  /** Keeps the TV framing clear of app overlays (CSS-pixel strips of the viewport). */
  setFramingInsets(insets: FramingInsets): void;
  /** Adds a clickable prop (PC, radio, poster…); returns its unregister function. */
  registerInteractable(interactable: Interactable): () => void;
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
}

/**
 * Builds the attic room around a GameSurface. Throws synchronously when WebGL is
 * unavailable, so the app can fall back to the flat host.
 */
export function createRoom(options: CreateRoomOptions): Room {
  const { surface } = options;
  const stage = new RoomStage(options);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let scene: RoomScene | null = null;
  let disposed = false;
  let framingInsets: FramingInsets | null = null;
  const queuedInteractables = new Map<Interactable, () => void>();

  const views = new ViewController({
    surface,
    moveCamera: (view, arrived) => {
      // Before the room has loaded there is no flight to wait for.
      if (!scene) return arrived();
      const loaded = scene;
      loaded.rig.goTo(view, () => {
        arrived();
        loaded.refreshCursor();
      });
      loaded.refreshCursor();
    },
    releasePointer: () => scene?.tvInput.release(),
  });

  const ready = loadRoomAssets(options.assetBaseUrl ?? defaultAssetBaseUrl(), options.onProgress ?? (() => {})).then(
    (assets) => {
      if (disposed) return;
      scene = assembleRoom({ stage, assets, surface, views, reducedMotion });
      if (framingInsets) scene.rig.setFramingInsets(framingInsets);
      for (const [interactable] of queuedInteractables) {
        queuedInteractables.set(interactable, scene.register(interactable));
      }
      return firstFrame(stage);
    },
  );

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
    focusSection: (section) => views.request(section),
    onViewChange: (listener) => views.onChange(listener),
    setFramingInsets(insets) {
      framingInsets = insets;
      scene?.rig.setFramingInsets(insets);
    },
    registerInteractable(interactable) {
      queuedInteractables.set(interactable, scene ? scene.register(interactable) : () => {});
      return () => {
        queuedInteractables.get(interactable)?.();
        queuedInteractables.delete(interactable);
      };
    },
    get stats(): RoomStats {
      const { calls, triangles } = stage.renderer.info.render;
      return {
        framesRendered: stage.loop.framesRendered,
        renderLoopIdle: stage.loop.idle,
        lavaRunning: scene?.lava.running ?? false,
        drawCalls: calls,
        triangles,
        pixelRatio: stage.size.pixelRatio,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      scene?.dispose();
      scene = null;
      views.dispose();
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
