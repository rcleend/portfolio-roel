import type { Group, PerspectiveCamera, Raycaster, Scene, Vector2, WebGLRenderer } from 'three';
import type { RadioPoseSolver } from '../camera/CameraRig';
import type { Viewpoint } from '../camera/cameraPath';
import type { InteractionHit } from '../interaction/Interactable';
import type { IdleWork } from '../stage/IdleWork';
import type { RenderLoop } from '../stage/RenderLoop';
import type { ViewportSize } from '../stage/RoomStage';
import type { RoomView } from '../viewState';
import type { DiscSlot } from './discLayout';
import type { GeneratedRadioDoor } from './partsProvider';
import type { DeckState, DiscArt, RadioCueEvent, RadioIntent, RadioKey, RadioLayout } from './RadioDeck';
import type { RadioModel } from './radioModel';

/**
 * The seam between the radio's deck (RadioDeckHandle, the lazy `radioDeck` chunk, which the room chunk's RadioDoor
 * loads) and its lazy device (device/RadioDevice.ts, the `radioDevice` chunk). Types only: the device receives everything it uses from the
 * room through the host and the link, so the chunk imports no room state of its own.
 */

/** What the room gives the radio once it is assembled. */
export interface RadioHost {
  readonly model: RadioModel;
  readonly rig: {
    viewpoint(view: 'radio'): Viewpoint;
    setRadioFraming(solve: RadioPoseSolver | null): void;
  };
  readonly stage: {
    readonly renderer: WebGLRenderer;
    readonly scene: Scene;
    readonly camera: PerspectiveCamera;
    readonly loop: RenderLoop;
    readonly visible: boolean;
    readonly size: ViewportSize;
    /** The GPU is software (read once when the renderer was made: asking again would wait for the GPU). */
    readonly softwareGpu: boolean;
  };
  readonly views: { readonly view: RoomView; readonly moving: boolean; request(view: RoomView): void };
  readonly background: Pick<IdleWork, 'add'>;
  readonly anisotropy: number;
  /** The generated room's radio (docs/ROOM.md › The generated room): the device takes its parts from it. */
  readonly generated: GeneratedRadioDoor;
}

/** What the handle gives the device it loads: the motion preference, the disc count, and where to report. */
export interface RadioLink {
  readonly reducedMotion: MediaQueryList;
  discCount(): number;
  readonly events: RadioDeviceEvents;
}

/** The device's own view of the room, built from the host and the link. */
export interface RadioDeviceContext {
  readonly model: RadioModel;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly loop: Pick<RenderLoop, 'animate' | 'invalidate' | 'lastFrameTime' | 'ride' | 'paced'>;
  /** Work ahead of need, never while anything moves (the radio's own motion included). */
  readonly background: Pick<IdleWork, 'add'>;
  readonly anisotropy: number;
  /** The GPU is software: the slow tier and the smallest labels. */
  readonly software: boolean;
  readonly reducedMotion: MediaQueryList;
  /** The stage canvas is on screen and the tab visible; its CSS size and pixel ratio. */
  readonly stage: { readonly visible: boolean; readonly size: ViewportSize };
  readonly views: { readonly view: RoomView; readonly moving: boolean };
  /** The settled pose at the radio for the current viewport and the slots it frames. */
  pose(): Viewpoint;
  slots(): readonly DiscSlot[];
  readonly events: RadioDeviceEvents;
}

/** What the device tells the handle, which tells the app. */
export interface RadioDeviceEvents {
  intent(intent: RadioIntent): void;
  seated(disc: string): void;
  cue(event: RadioCueEvent): void;
  /** The pointer's disc (hover, a touch press) or null. */
  pointerAttention(disc: string | null): void;
  /** Where the discs and keys now sit on the page at the settled radio pose. */
  layout(layout: RadioLayout): void;
  /** Every disc not in the player is up in its slot (or no longer: the leave began). */
  discsOut(out: boolean): void;
}

/** What a ray met on the device, in priority order: a disc, a key or the lid. */
export type DeviceTarget =
  | { readonly kind: 'disc'; readonly disc: string; readonly seated: boolean }
  | { readonly kind: 'key'; readonly key: RadioKey }
  | { readonly kind: 'lid' };

export interface DevicePick {
  readonly target: DeviceTarget;
  readonly hit: InteractionHit;
  readonly distance: number;
}

export interface RadioDevice {
  /** Pixels of the device's own textures on the GPU (labels with mips, the LCD). */
  readonly texturePixels: number;
  /** Ambient motion (the floating discs' idle) is scheduling frames. */
  readonly ambient: boolean;
  /** Something of the device's is animating: background work waits. */
  readonly moving: boolean;
  /** The lid's angle in degrees at `now` (0 closed); a pure function of time. */
  lidDegrees(now: number): number;
  setDiscs(discs: readonly DiscArt[]): void;
  setState(state: DeckState): void;
  /** A press from the app's controls: animate the key and emit its cues. */
  press(key: RadioKey): void;
  setKeyboardAttention(disc: string | null): void;
  /** The mouse in NDC, or null when it left or is a touch: parallax, tilt, and "the visitor is here". */
  setPointer(ndc: Vector2 | null): void;
  /** The camera set off for the radio at `at` (performance.now()). */
  approach(at: number): void;
  reveal(): void;
  conceal(): void;
  /** The slots or the pose changed (resize, disc count, insets): retarget resting discs. */
  relayout(): void;
  pick(raycaster: Raycaster): DevicePick | null;
  /**
   * Pointer pressed on a device target; true to own the gesture. A mouse's key acts at once; a finger's or a pen's on
   * the release, where the browser grants the gesture that may start media (a refused play needs one).
   */
  pointerDown(target: DeviceTarget, pointerType: string): boolean;
  /** While owning a gesture: where the pointer is now (null off the device). */
  pointerMove(target: DeviceTarget | null): void;
  /** The owned gesture ended; a `cancelled` one does nothing (the key comes back up). */
  pointerUp(cancelled: boolean): void;
  /** A click that was not a gesture. */
  activate(target: DeviceTarget): void;
  /** Hover moved over a target or off the device (null). */
  hover(target: DeviceTarget | null): void;
  /** The group every part the device adds hangs from (for disposal and debugging). */
  readonly root: Group;
  dispose(): void;
}

export type CreateRadioDevice = (host: RadioHost, link: RadioLink) => Promise<RadioDevice>;
