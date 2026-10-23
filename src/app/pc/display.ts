/**
 * The computer's monitor as the room presents it: a structural copy of the
 * room's `PcMonitor` contract (docs/PC.md › Contract with the room). The two
 * branches are built in parallel; after they merge this file becomes
 * `export type { PcMonitor as PcDisplay, RgbColor, ScreenRect, StillPainter, StillRequest } from '@/room'`
 * and the type checker proves `room.pc` satisfies it.
 */

/** A rectangle in the room container's CSS pixels; left and top are snapped to device pixels. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface StillRequest {
  /** Size of the canvas region to paint, in pixels: the monitor's picture (inside the tube border). */
  readonly width: number;
  readonly height: number;
  /** The picture's rectangle on the page when settled at the PC, for the current viewport: the live screen's size. */
  readonly placement: ScreenRect;
}

/**
 * Paints what the monitor shows whenever the live screen does not. The context's origin is the picture's top-left
 * and it is clipped to the picture; compose transforms only (save/scale/translate/restore), never setTransform,
 * resetTransform or pixel reads. Called rarely, never per frame.
 */
export type StillPainter = (context: CanvasRenderingContext2D, request: StillRequest) => void;

/** sRGB, 0–1. */
export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface PcDisplay {
  /** Content slot laid exactly over the monitor's picture; visible only while `live`. Render the screen's DOM in it. */
  readonly screen: HTMLElement;
  /** The picture's rectangle when the camera rests at the PC, for the current viewport; zero-sized until ready. */
  readonly placement: ScreenRect;
  onPlacementChange(listener: (placement: ScreenRect) => void): () => void;
  /** True from the landing frame until the camera is asked to leave the PC. */
  readonly live: boolean;
  onLiveChange(listener: (live: boolean) => void): () => void;
  /** What the glass shows whenever the live screen does not; null shows the dark standby tube. */
  setStill(painter: StillPainter | null): void;
  /** The still's content changed (e.g. the clock's minute); it is repainted before the next flight to or from the PC. */
  invalidateStill(): void;
  /** Light the screen spills while the live screen differs from the still; null follows the still. Cleared on conceal. */
  setLight(color: RgbColor | null): void;
}

/** The view the camera is at or flying to (the room's `RoomView`). */
export type PcView = 'tv' | 'room' | 'pc';
