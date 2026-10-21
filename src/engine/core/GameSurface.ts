/**
 * The contract between a running game and the host that presents it.
 *
 * A host (the 3D room's CRT, or the flat fallback TV) only ever sees this
 * interface: it shows `canvas`, refreshes when `onFrame` fires, forwards
 * pointer input in native pixel coordinates and decides when the game may run.
 */
export interface GameSurface {
  /** Native-resolution pixels to present. Never resized by the host. */
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** Fires after every rendered frame. Returns an unsubscribe function. */
  onFrame(listener: () => void): () => void;
  pause(): void;
  resume(): void;
  readonly paused: boolean;
  /** Keyboard and gamepad reach the game only while the host has focus. */
  setInputEnabled(enabled: boolean): void;
  readonly pointer: PointerSink;
}

/** Pointer input mapped by the host into native pixel coordinates. */
export interface PointerSink {
  move(x: number, y: number): void;
  leave(): void;
  down(): void;
  up(): void;
}
