/**
 * Caps how often game frames are presented. The engine simulates at a fixed 60 Hz but
 * draws once per animation frame, so a 120 Hz display reports every simulated state twice.
 * Presenting at most ~60 times a second halves the room's GPU work there without ever
 * dropping the latest picture: a frame that arrives too early is presented late instead.
 */
export class FramePacer {
  private last = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly minIntervalMs: number,
    private readonly present: () => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** A new frame is ready. */
  frame(): void {
    if (this.timer !== null) return;
    const wait = this.last + this.minIntervalMs - this.now();
    if (wait <= 0) {
      this.fire();
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fire();
    }, wait);
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private fire(): void {
    this.last = this.now();
    this.present();
  }
}

/** Slightly under 1/60 s, so a 60 Hz display's frame jitter never skips a frame. */
export const GAME_FRAME_INTERVAL_MS = 1000 / 60 - 2;
