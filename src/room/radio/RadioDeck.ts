import type { FramingInsets } from '../camera/CameraRig';
import type { ScreenRect } from '../pc/PcMonitor';

/**
 * The CD player on the cabinet, as the room shows it (docs/ROOM.md › The CD player). The room owns the device —
 * the lid, the keys, the floating and seated discs, the LCD and LED, the camera and what the visitor's pointer
 * does to them — and knows nothing about albums, tracks or sound; the app owns those and drives the device
 * declaratively through `setState`, as it shows a GameSurface or a monitor it does not understand.
 */

export type RadioKey = 'play-pause' | 'stop' | 'previous' | 'next';
export type Transport = 'playing' | 'paused' | 'stopped';

/** What the segment display shows; the room paints it (and blinks a paused time itself). */
export type LcdReadout =
  | { readonly kind: 'off' } //                      dark; the OPR LED is off too
  | { readonly kind: 'no-disc' } //                  "no dISC"
  | { readonly kind: 'reading' } //                  "-- --:--"
  | {
      readonly kind: 'track';
      readonly track: number;
      readonly seconds: number;
      /** 'stopped': a track chosen with ⏭ or ⏮ after ■ shows its number and a steady 00:00, without an icon. */
      readonly transport: Transport;
    }
  | { readonly kind: 'total'; readonly tracks: number; readonly seconds: number } // stopped: the disc's totals
  | { readonly kind: 'error' }; //                   "00 -- --", the device's own

/** What the player is doing; the room animates the difference (insert, swap, spin, LCD) and retargets mid-animation. */
export interface DeckState {
  /** The disc on the spindle or on its way there; null for an empty player. */
  readonly loaded: string | null;
  /** Ignored while `loaded` is null. */
  readonly transport: Transport;
  readonly lcd: LcdReadout;
}

/** A disc's print. Square, `labelSize` px; RGB is the ink, alpha its coverage (0 shows bare foil). The room keeps it. */
export interface DiscArt {
  readonly id: string;
  /**
   * Null: a plain silver disc until a later `setDiscs` brings the print. The room reads a small copy of it back (the
   * spin blur's radial average), so paint a canvas on the CPU (`getContext('2d', { willReadFrequently: true })`):
   * reading a GPU canvas would make the main thread wait for the GPU.
   */
  readonly label: HTMLCanvasElement | ImageBitmap | null;
}

/** Gestures on the model, emitted synchronously inside the pointer event (a user gesture: media may start). */
export type RadioIntent =
  | { readonly type: 'pick'; readonly disc: string }
  | { readonly type: 'press'; readonly key: RadioKey }; // already animated: do not call press() for it

export type RadioCue =
  | 'power-on'
  | 'lid-push'
  | 'lid-unlatch'
  | 'lid-swing'
  | 'lid-stop'
  | 'lid-close'
  | 'lid-latch'
  | 'disc-rise'
  | 'disc-flip'
  | 'disc-sink'
  | 'disc-pick'
  | 'disc-seat'
  | 'disc-unseat'
  | 'key-down'
  | 'key-up'
  | 'spin-up'
  | 'spin-down';

export interface RadioCueEvent {
  readonly cue: RadioCue;
  /** Stereo position from the moving part's place on screen, −1…1. */
  readonly pan: number;
  /** Disc cues: the disc's place in the stagger, 0-based. */
  readonly order?: number;
}

/** CSS px in the room container at the settled radio pose; attention-pose centre for floating discs, the seat for the loaded one. */
export interface DiscAnchor {
  readonly disc: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly inPlayer: boolean;
}

export interface RadioLayout {
  readonly discs: readonly DiscAnchor[];
  /** Projected key rects; the rocker's halves split at its pivot. */
  readonly keys: Readonly<Record<RadioKey, ScreenRect>>;
}

/**
 * The radio as the room's first load has it (`room.radio`): whether it works, and the way to its deck, whose code
 * loads lazily (as the camera first leaves the TV, on a prefetch, or on the way to the radio).
 */
export interface RadioDoor {
  /** False once the radio cannot work (its chunk failed, or the room could not be lit; warned once): it is scenery again and the overview's menu drops its Music item. */
  readonly available: boolean;
  onAvailableChange(listener: (available: boolean) => void): () => void;
  /** Starts loading the deck and preparing the device; 'idle' does nothing under Save-Data. Idempotent. */
  prefetch(reason: 'idle' | 'intent'): void;
  /** The deck, importing its chunk on first call; rejects when the radio cannot work. */
  load(): Promise<RadioDeck>;
  /** The deck once `load` has brought it, else null. */
  readonly deck: RadioDeck | null;
  /**
   * The camera is about to set off for the radio for the first time and still rests where it is: `listener` makes the
   * app's half ready (the player, its controls) and the camera waits for what it returns, a bounded moment, so none
   * of that is mounted in the flight's frames (docs/ROOM.md › Flights). Returns its unsubscribe.
   */
  onBoarding(listener: () => Promise<unknown> | undefined): () => void;
}

export interface RadioDeck {
  /** False once the radio cannot work (its chunk failed, or the room could not be lit; warned once): it is scenery again and the overview's menu drops its Music item. */
  readonly available: boolean;
  onAvailableChange(listener: (available: boolean) => void): () => void;
  /** Starts loading and preparing the device; 'idle' does nothing under Save-Data. Idempotent. */
  prefetch(reason: 'idle' | 'intent'): void;
  /** Size to paint `DiscArt.label` at, fixed per page load once the room is ready. */
  readonly labelSize: 256 | 384 | 512;
  /** The collection in display order, 1–12 discs; replacing it re-lays the slots (discs spring to them). */
  setDiscs(discs: readonly DiscArt[]): void;
  setState(state: DeckState): void;
  /** Animates a key press for DOM controls, the bar and media keys; emits its key cues, no intent. */
  press(key: RadioKey): void;
  /** Keyboard focus: the disc takes the attention pose (null releases it). */
  setAttention(disc: string | null): void;
  /** The effective attention: the pointer's disc, else the keyboard's, else null. */
  onAttentionChange(listener: (disc: string | null) => void): () => void;
  onIntent(listener: (intent: RadioIntent) => void): () => void;
  /**
   * The loaded disc is on the spindle and ▷II has been pressed: start the sound now. Once per insert; in a microtask
   * after `setState` under reduced motion, while the stage is not visible, or while the device is not ready or unavailable
   * (a device that becomes ready later shows the disc already seated).
   */
  onSeated(listener: (disc: string) => void): () => void;
  /** Mechanical moments, emitted on the frame they happen (state-change cues only under reduced motion). */
  onCue(listener: (event: RadioCueEvent) => void): () => void;
  /** Content slot over the room for the app's controls; visible only while `live`. */
  readonly controls: HTMLElement;
  /** True from the landing at the radio until the camera is asked to leave. */
  readonly live: boolean;
  onLiveChange(listener: (live: boolean) => void): () => void;
  /**
   * True while the camera rests at the radio and every disc not in the player hangs in its slot, label out: the
   * shelf is up (teaching lines wait for it). False from the request to leave.
   */
  readonly discsOut: boolean;
  onDiscsOutChange(listener: (out: boolean) => void): () => void;
  readonly layout: RadioLayout;
  onLayoutChange(listener: (layout: RadioLayout) => void): () => void;
  /** CSS px of the viewport the app's controls cover at the radio (the touch transport bar); the radio is framed clear of it. */
  setControlInsets(insets: FramingInsets): void;
}
